import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Bot, Task } from '@prisma/client';
import { prisma } from '../db/client';
import { wsManager } from './websocket';

const execAsync = promisify(exec);
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.resolve('./workspaces');

// 5-second pause between every LLM request to stay within free-tier rate limits
const INTER_REQUEST_DELAY_MS = 5000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Retry with exponential backoff ──────────────────────────────────────────

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  onRetry?: (attempt: number, delayMs: number, error: Error) => void,
): Promise<T> {
  const { maxAttempts = 5, baseDelayMs = 2000, maxDelayMs = 60000 } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const isLast = attempt === maxAttempts;

      const msg = error.message || '';
      const isRateLimit =
        msg.includes('429') ||
        msg.includes('Too Many Requests') ||
        msg.includes('quota') ||
        msg.includes('rate limit') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('overloaded');

      if (!isRateLimit || isLast) throw error;

      const retryMatch = msg.match(/retry in ([\d.]+)s/i);
      const suggestedMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) : 0;

      const exponential = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 1000;
      const delayMs = Math.min(Math.max(suggestedMs, exponential) + jitter, maxDelayMs);

      if (onRetry) onRetry(attempt, delayMs, error);
      await sleep(delayMs);
    }
  }

  throw new Error('withRetry: exhausted attempts');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function addLog(botId: string, taskId: string, message: string, level = 'info', meta?: unknown) {
  await prisma.log.create({ data: { botId, taskId, message, level, meta: meta ? JSON.stringify(meta) : null } });
  wsManager.log(botId, message, level, meta);
}

async function setBotStatus(botId: string, status: string) {
  await prisma.bot.update({ where: { id: botId }, data: { status } });
  wsManager.statusChange(botId, status);
}

async function setTaskStatus(taskId: string, status: string, extra?: Partial<Task>) {
  await prisma.task.update({ where: { id: taskId }, data: { status, ...extra } });
}

function workspacePath(botId: string, filePath = ''): string {
  const base = path.join(WORKSPACE_ROOT, botId);
  const resolved = path.resolve(base, filePath.replace(/^\/+/, ''));
  if (!resolved.startsWith(base)) throw new Error('Path traversal denied');
  return resolved;
}

// ─── Tool implementations ────────────────────────────────────────────────────

const createTools = (botId: string, taskId: string) => ({
  read_file: async (p: { path: string }) => {
    const full = workspacePath(botId, p.path);
    if (!fs.existsSync(full)) return { error: 'File not found' };
    return { content: fs.readFileSync(full, 'utf-8') };
  },

  write_file: async (p: { path: string; content: string }) => {
    const full = workspacePath(botId, p.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, p.content, 'utf-8');
    await addLog(botId, taskId, `Wrote file: ${p.path}`, 'tool');
    return { success: true, path: p.path };
  },

  list_dir: async (p: { path?: string }) => {
    const full = workspacePath(botId, p.path || '');
    if (!fs.existsSync(full)) return { items: [] };
    const items = fs.readdirSync(full, { withFileTypes: true }).map((d) => ({
      name: d.name,
      type: d.isDirectory() ? 'dir' : 'file',
    }));
    return { items };
  },

  execute_code: async (p: { code: string; language?: string; filename?: string }) => {
    const lang = p.language || 'python';
    const fname = p.filename || `run_${Date.now()}.${lang === 'python' ? 'py' : 'js'}`;
    const filePath = workspacePath(botId, fname);
    fs.writeFileSync(filePath, p.code);
    await addLog(botId, taskId, `Executing ${fname}...`, 'tool');
    try {
      const cmd = lang === 'python' ? `python3 "${filePath}"` : `node "${filePath}"`;
      const { stdout, stderr } = await execAsync(cmd, { timeout: 30000, cwd: workspacePath(botId) });
      return { stdout, stderr, exitCode: 0 };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; code?: number };
      return { stdout: err.stdout || '', stderr: err.stderr || String(e), exitCode: err.code || 1 };
    }
  },

  ask_human: async (p: { question: string; context?: string }) => {
    await addLog(botId, taskId, `Asking human: ${p.question}`, 'tool');
    const q = await prisma.humanQuestion.create({
      data: { botId, taskId, question: p.question, context: p.context, status: 'pending' },
    });
    await setBotStatus(botId, 'waiting_for_human');
    wsManager.emitToBot(botId, { type: 'human:question', botId, payload: q });

    for (let i = 0; i < 600; i++) {
      await sleep(1000);
      const updated = await prisma.humanQuestion.findUnique({ where: { id: q.id } });
      if (updated?.status === 'answered') {
        await setBotStatus(botId, 'executing');
        return { answer: updated.answer };
      }
    }
    return { error: 'Timeout waiting for human input' };
  },
});

// ─── Claude agent ─────────────────────────────────────────────────────────────

const CLAUDE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read a file from the workspace',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Relative file path' } }, required: ['path'] },
  },
  {
    name: 'write_file',
    description: 'Write content to a file in the workspace',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_dir',
    description: 'List files in a workspace directory',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Directory path (optional)' } } },
  },
  {
    name: 'execute_code',
    description: 'Execute Python or JavaScript code and return output',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code to execute' },
        language: { type: 'string', enum: ['python', 'javascript'], description: 'Programming language' },
        filename: { type: 'string', description: 'Optional filename to save the code as' },
      },
      required: ['code'],
    },
  },
  {
    name: 'ask_human',
    description: 'Ask the human operator a question and wait for an answer',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask' },
        context: { type: 'string', description: 'Additional context for the human' },
      },
      required: ['question'],
    },
  },
];

async function runClaudeAgent(bot: Bot, task: Task, tools: ReturnType<typeof createTools>) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are an autonomous AI agent named "${bot.name}". You have a set of tools to complete tasks.
Your workspace is a sandboxed directory where you can read/write files and execute code.
When you need human input, use the ask_human tool. Be thorough but efficient.
Always save important outputs as files in the workspace.`;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `Task: ${task.title}\n\nDescription: ${task.description}` },
  ];

  let totalTokens = 0;

  for (let i = 0; i < 20; i++) {
    // Pause before every request except the very first
    if (i > 0) {
      await addLog(bot.id, task.id, `⏸ Waiting ${INTER_REQUEST_DELAY_MS / 1000}s before next request...`, 'info');
      await sleep(INTER_REQUEST_DELAY_MS);
    }

    const response = await withRetry(
      () => client.messages.create({
        model: bot.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: CLAUDE_TOOLS,
        messages,
      }),
      { maxAttempts: 5, baseDelayMs: 2000, maxDelayMs: 60000 },
      (attempt, delayMs, error) => {
        addLog(bot.id, task.id,
          `⏳ Rate limited by Claude API (attempt ${attempt}/5) — retrying in ${Math.round(delayMs / 1000)}s... [${error.message.slice(0, 80)}]`,
          'warn',
        );
      },
    );

    totalTokens += response.usage.input_tokens + response.usage.output_tokens;

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        await addLog(bot.id, task.id, block.text, 'info');
      }
    }

    if (response.stop_reason === 'end_turn') {
      await prisma.task.update({ where: { id: task.id }, data: { tokenUsage: totalTokens } });
      return response.content.find((b) => b.type === 'text')?.text || 'Task completed.';
    }

    const toolUses = response.content.filter((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
    if (toolUses.length === 0) break;

    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      await addLog(bot.id, task.id, `Using tool: ${toolUse.name}`, 'tool', toolUse.input);
      const toolFn = (tools as Record<string, (input: unknown) => Promise<unknown>>)[toolUse.name];
      const result = toolFn ? await toolFn(toolUse.input) : { error: `Unknown tool: ${toolUse.name}` };
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  await prisma.task.update({ where: { id: task.id }, data: { tokenUsage: totalTokens } });
  return 'Task completed (max iterations reached).';
}

// ─── Gemini agent ─────────────────────────────────────────────────────────────

async function runGeminiAgent(bot: Bot, task: Task, tools: ReturnType<typeof createTools>) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  const model = genAI.getGenerativeModel({
    model: bot.model,
    tools: [{
      functionDeclarations: [
        { name: 'read_file',    description: 'Read a file',    parameters: { type: 'OBJECT', properties: { path: { type: 'STRING' } }, required: ['path'] } },
        { name: 'write_file',   description: 'Write a file',   parameters: { type: 'OBJECT', properties: { path: { type: 'STRING' }, content: { type: 'STRING' } }, required: ['path', 'content'] } },
        { name: 'list_dir',     description: 'List directory', parameters: { type: 'OBJECT', properties: { path: { type: 'STRING' } } } },
        { name: 'execute_code', description: 'Execute code',   parameters: { type: 'OBJECT', properties: { code: { type: 'STRING' }, language: { type: 'STRING' } }, required: ['code'] } },
        { name: 'ask_human',    description: 'Ask human',      parameters: { type: 'OBJECT', properties: { question: { type: 'STRING' }, context: { type: 'STRING' } }, required: ['question'] } },
      ] as any,
    }],
  });

  const chat = model.startChat({
    history: [],
    generationConfig: { maxOutputTokens: 4096 },
  });

  const prompt = `Task: ${task.title}\n\nDescription: ${task.description}`;

  // First request — no pre-delay
  let response = await withRetry(
    () => chat.sendMessage(prompt),
    { maxAttempts: 5, baseDelayMs: 2000, maxDelayMs: 60000 },
    (attempt, delayMs, error) => {
      addLog(bot.id, task.id,
        `⏳ Rate limited by Gemini API (attempt ${attempt}/5) — retrying in ${Math.round(delayMs / 1000)}s... [${error.message.slice(0, 80)}]`,
        'warn',
      );
    },
  );

  for (let i = 0; i < 20; i++) {
    const candidate = response.response.candidates?.[0];
    if (!candidate) break;

    const parts = candidate.content.parts;

    for (const part of parts.filter((p: { text?: string }) => p.text)) {
      if ((part as { text: string }).text?.trim()) {
        await addLog(bot.id, task.id, (part as { text: string }).text, 'info');
      }
    }

    const fnCalls = parts.filter((p: { functionCall?: unknown }) => p.functionCall);
    if (fnCalls.length === 0) break;

    const fnResponses: Array<{ functionResponse: { name: string; response: { result: unknown } } }> = [];
    for (const part of fnCalls) {
      const call = (part as { functionCall: { name: string; args: unknown } }).functionCall;
      await addLog(bot.id, task.id, `Using tool: ${call.name}`, 'tool', call.args);
      const toolFn = (tools as Record<string, (input: unknown) => Promise<unknown>>)[call.name];
      const result = toolFn ? await toolFn(call.args) : { error: `Unknown tool: ${call.name}` };
      fnResponses.push({ functionResponse: { name: call.name, response: { result } } });
    }

    // Pause before sending tool results back
    await addLog(bot.id, task.id, `⏸ Waiting ${INTER_REQUEST_DELAY_MS / 1000}s before next request...`, 'info');
    await sleep(INTER_REQUEST_DELAY_MS);

    response = await withRetry(
      () => chat.sendMessage(fnResponses as Parameters<typeof chat.sendMessage>[0]),
      { maxAttempts: 5, baseDelayMs: 2000, maxDelayMs: 60000 },
      (attempt, delayMs, error) => {
        addLog(bot.id, task.id,
          `⏳ Rate limited by Gemini API (attempt ${attempt}/5) — retrying in ${Math.round(delayMs / 1000)}s... [${error.message.slice(0, 80)}]`,
          'warn',
        );
      },
    );
  }

  return 'Task completed.';
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function runAgentTask(bot: Bot, task: Task) {
  const tools = createTools(bot.id, task.id);

  try {
    await setBotStatus(bot.id, 'planning');
    await setTaskStatus(task.id, 'planning');
    await addLog(bot.id, task.id, `Starting task: ${task.title}`, 'info');
    await addLog(bot.id, task.id, 'Analyzing task...', 'info');
    await setBotStatus(bot.id, 'executing');
    await setTaskStatus(task.id, 'executing');

    let result: string;
    if (bot.model.startsWith('gemini-')) {
      result = await runGeminiAgent(bot, task, tools);
    } else {
      result = await runClaudeAgent(bot, task, tools);
    }

    await setTaskStatus(task.id, 'done', { result });
    await setBotStatus(bot.id, 'idle');
    await addLog(bot.id, task.id, `✅ Task complete: ${result.slice(0, 200)}`, 'info');
    wsManager.emitToBot(bot.id, { type: 'task:done', botId: bot.id, payload: { taskId: task.id, result } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setTaskStatus(task.id, 'failed', { result: msg });
    await setBotStatus(bot.id, 'failed');
    await addLog(bot.id, task.id, `❌ Task failed: ${msg}`, 'error');
    wsManager.emitToBot(bot.id, { type: 'task:failed', botId: bot.id, payload: { taskId: task.id, error: msg } });
  }
}
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
const SHARED_PROGRAMS_ROOT = process.env.SHARED_PROGRAMS_ROOT || path.resolve('./shared-programs');

// Ensure shared programs directory exists
fs.mkdirSync(SHARED_PROGRAMS_ROOT, { recursive: true });

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

// ─── Workspace cleanup ────────────────────────────────────────────────────────

function cleanupTempFiles(botId: string) {
  const wsDir = path.join(WORKSPACE_ROOT, botId);
  if (!fs.existsSync(wsDir)) return 0;
  const entries = fs.readdirSync(wsDir);
  const tempPattern = /^run_\d+\.(py|js)$/;
  let removed = 0;
  for (const entry of entries) {
    if (tempPattern.test(entry)) {
      fs.unlinkSync(path.join(wsDir, entry));
      removed++;
    }
  }
  return removed;
}

export function cleanEntireWorkspace(botId: string): number {
  const wsDir = path.join(WORKSPACE_ROOT, botId);
  if (!fs.existsSync(wsDir)) return 0;
  let removed = 0;
  const removeRecursive = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { removeRecursive(full); fs.rmdirSync(full); }
      else { fs.unlinkSync(full); removed++; }
    }
  };
  removeRecursive(wsDir);
  return removed;
}

// ─── Tool implementations ────────────────────────────────────────────────────

const createTools = (botId: string, taskId: string) => ({
  // ── Workspace tools ────────────────────────────────────────────────────────
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

  install_package: async (p: { packages: string[]; manager?: 'pip' | 'npm' }) => {
    const manager = p.manager || 'pip';
    const pkgList = p.packages.filter(pkg => /^[a-zA-Z0-9_\-\.\[\]>=<!, ]+$/.test(pkg));
    if (pkgList.length === 0) return { error: 'No valid package names provided.' };

    const cmd = manager === 'pip'
      ? `pip install --quiet ${pkgList.map(p => `"${p}"`).join(' ')}`
      : `npm install --prefix /app/node_modules_shared ${pkgList.map(p => `"${p}"`).join(' ')}`;

    await addLog(botId, taskId, `📦 Installing ${manager} packages: ${pkgList.join(', ')}`, 'tool');
    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 });
      await addLog(botId, taskId, `✅ Installed: ${pkgList.join(', ')}`, 'tool');
      return { success: true, packages: pkgList, stdout, stderr };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; code?: number };
      return { success: false, stdout: err.stdout || '', stderr: err.stderr || String(e), exitCode: err.code || 1 };
    }
  },

  http_request: async (p: { url: string; method?: string; headers?: Record<string, string>; body?: string }) => {
    // Rewrite localhost / 127.0.0.1 → host.docker.internal so the agent can
    // reach services running on the host machine from inside the container.
    const url = p.url
      .replace(/^(https?:\/\/)localhost(:\d+)?/,  '$1host.docker.internal$2')
      .replace(/^(https?:\/\/)127\.0\.0\.1(:\d+)?/, '$1host.docker.internal$2');

    const method = (p.method || 'GET').toUpperCase();
    await addLog(botId, taskId, `🌐 ${method} ${url}`, 'tool');
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(p.headers || {}) },
        ...(p.body ? { body: p.body } : {}),
        signal: AbortSignal.timeout(30000),
      });
      let text = await res.text();
      // Gemini rejects any function_response payload containing strings that
      // look like JSON schema $ref values (e.g. "#/components/schemas/Foo").
      // Sanitize them so the agent still gets readable content.
      text = text
        .replace(/#\/components\/schemas\//g, 'schema:')
        .replace(/#\/definitions\//g, 'definition:')
        .replace(/"\$ref"/g, '"ref"');
      return { status: res.status, ok: res.ok, body: text };
    } catch (e: unknown) {
      return { error: String(e) };
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

  // ── Workspace management ───────────────────────────────────────────────────

  clean_workspace: async (_p: Record<string, never>) => {
    const removed = cleanEntireWorkspace(botId);
    await addLog(botId, taskId, `🧹 Workspace cleaned: removed ${removed} file(s)`, 'tool');
    return { success: true, filesRemoved: removed };
  },

  update_soul: async (p: { content: string; reason: string }) => {
    const botRecord = await prisma.bot.findUnique({ where: { id: botId } }) as any;
    if (botRecord?.soulId) {
      await (prisma as any).soul.update({ where: { id: botRecord.soulId }, data: { content: p.content } });
    } else {
      return { error: 'This bot has no soul assigned — cannot update.' };
    }
    await addLog(botId, taskId, `🔮 Soul updated: ${p.reason}`, 'tool');
    return { success: true, reason: p.reason };
  },

  // ── Shared Library tools ───────────────────────────────────────────────────

  save_to_library: async (p: {
    name: string;
    description: string;
    code: string;
    language?: string;
    tags?: string[];
  }) => {
    const lang = p.language || 'python';
    const ext = lang === 'javascript' ? 'js' : 'py';
    const safeName = p.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const filename = `${safeName}.${ext}`;
    const filePath = path.join(SHARED_PROGRAMS_ROOT, filename);

    fs.writeFileSync(filePath, p.code, 'utf-8');

    const existing = await prisma.sharedProgram.findUnique({ where: { name: safeName } });
    if (existing) {
      await prisma.sharedProgram.update({
        where: { name: safeName },
        data: {
          description: p.description,
          language: lang,
          filename,
          tags: JSON.stringify(p.tags || []),
          updatedBy: botId,
        },
      });
      await addLog(botId, taskId, `📚 Updated library program: ${safeName}`, 'tool');
      return { success: true, action: 'updated', name: safeName };
    } else {
      await prisma.sharedProgram.create({
        data: {
          name: safeName,
          description: p.description,
          language: lang,
          filename,
          tags: JSON.stringify(p.tags || []),
          createdBy: botId,
        },
      });
      await addLog(botId, taskId, `📚 Saved new library program: ${safeName}`, 'tool');
      return { success: true, action: 'created', name: safeName };
    }
  },

  list_library: async (p: { tag?: string; language?: string }) => {
    const all = await prisma.sharedProgram.findMany({ orderBy: { usageCount: 'desc' } });
    let results = all.map(prog => ({
      name: prog.name,
      description: prog.description,
      language: prog.language,
      tags: JSON.parse(prog.tags || '[]') as string[],
      usageCount: prog.usageCount,
      updatedAt: prog.updatedAt,
    }));
    if (p.tag)      results = results.filter(prog => prog.tags.includes(p.tag!));
    if (p.language) results = results.filter(prog => prog.language === p.language);
    return { programs: results, total: results.length };
  },

  load_from_library: async (p: { name: string }) => {
    const safeName = p.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const program = await prisma.sharedProgram.findUnique({ where: { name: safeName } });
    if (!program) return { error: `Program '${safeName}' not found in library` };

    const filePath = path.join(SHARED_PROGRAMS_ROOT, program.filename);
    if (!fs.existsSync(filePath)) return { error: `Program file missing for '${safeName}'` };

    const code = fs.readFileSync(filePath, 'utf-8');

    // Increment usage count
    await prisma.sharedProgram.update({
      where: { name: safeName },
      data: { usageCount: { increment: 1 } },
    });

    await addLog(botId, taskId, `📚 Loaded library program: ${safeName}`, 'tool');
    return {
      name: program.name,
      description: program.description,
      language: program.language,
      tags: JSON.parse(program.tags || '[]'),
      code,
    };
  },

  update_library: async (p: {
    name: string;
    code: string;
    description?: string;
    tags?: string[];
  }) => {
    const safeName = p.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const program = await prisma.sharedProgram.findUnique({ where: { name: safeName } });
    if (!program) return { error: `Program '${safeName}' not found in library` };

    const filePath = path.join(SHARED_PROGRAMS_ROOT, program.filename);
    fs.writeFileSync(filePath, p.code, 'utf-8');

    await prisma.sharedProgram.update({
      where: { name: safeName },
      data: {
        ...(p.description && { description: p.description }),
        ...(p.tags && { tags: JSON.stringify(p.tags) }),
        updatedBy: botId,
      },
    });

    await addLog(botId, taskId, `📚 Updated library program: ${safeName}`, 'tool');
    return { success: true, name: safeName };
  },
});

// ─── Claude tools definition ──────────────────────────────────────────────────

const CLAUDE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read a file from the workspace',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
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
    input_schema: { type: 'object', properties: { path: { type: 'string' } } },
  },
  {
    name: 'execute_code',
    description: 'Execute Python or JavaScript code. Temp files are cleaned up after the task.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        language: { type: 'string', enum: ['python', 'javascript'] },
        filename: { type: 'string', description: 'Optional filename. Defaults to a temp run_*.py file.' },
      },
      required: ['code'],
    },
  },
  {
    name: 'http_request',
    description: 'Make an HTTP request to any URL. Use this to call APIs, fetch web pages, read OpenAPI specs (e.g. http://localhost:8000/openapi.json), or interact with external services. localhost URLs are automatically routed to the host machine.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url:     { type: 'string',  description: 'Full URL including protocol e.g. http://localhost:8000/api/users' },
        method:  { type: 'string',  description: 'HTTP method: GET, POST, PUT, PATCH, DELETE. Default: GET' },
        headers: { type: 'object',  description: 'Optional request headers as key-value pairs' },
        body:    { type: 'string',  description: 'Optional request body (JSON string for JSON APIs)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'install_package',
    description: 'Install Python (pip) or Node (npm) packages so they are available for execute_code. Call this before executing code that requires third-party packages. Examples: requests, pandas, numpy, beautifulsoup4.',
    input_schema: {
      type: 'object' as const,
      properties: {
        packages: { type: 'array', items: { type: 'string' }, description: 'List of packages to install e.g. ["requests", "pandas>=2.0"]' },
        manager: { type: 'string', enum: ['pip', 'npm'], description: 'Package manager. Default: pip for Python, npm for JavaScript.' },
      },
      required: ['packages'],
    },
  },
  {
    name: 'ask_human',
    description: 'Ask the human operator a question and wait for an answer',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        context: { type: 'string' },
      },
      required: ['question'],
    },
  },
  {
    name: 'clean_workspace',
    description: 'Delete ALL files in your private workspace. Call this when a task is complete and temporary working files are no longer needed. Does not affect the shared library.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'update_soul',
    description: 'Update your soul.md — the file that defines your identity, values and behaviour. Only call this when a task causes a DRASTIC, irreversible shift in your purpose or operating environment. Do NOT call for routine learnings or task-specific insights.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Full new Markdown content for soul.md' },
        reason: { type: 'string', description: 'One-sentence explanation of why this soul update is warranted' },
      },
      required: ['content', 'reason'],
    },
  },
  {
    name: 'save_to_library',
    description: 'REQUIRED: Save a reusable program to the persistent shared library. All agents share this volume. Call this whenever you write a utility, parser, formatter, calculator, or any reusable script. Use snake_case names.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Snake_case name e.g. csv_parser, web_scraper' },
        description: { type: 'string', description: 'What this program does and how to use it' },
        code: { type: 'string' },
        language: { type: 'string', enum: ['python', 'javascript'] },
        tags: { type: 'array', items: { type: 'string' }, description: 'e.g. ["csv","data","parsing"]' },
      },
      required: ['name', 'description', 'code'],
    },
  },
  {
    name: 'list_library',
    description: 'REQUIRED FIRST STEP: List programs in the shared library before writing any code. Always call this at task start to discover existing utilities you can reuse.',
    input_schema: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: 'Filter by tag' },
        language: { type: 'string', enum: ['python', 'javascript'] },
      },
    },
  },
  {
    name: 'load_from_library',
    description: 'Load a program from the shared library. Returns the full source code. Use this to reuse or extend existing programs instead of rewriting them.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'update_library',
    description: 'Update an existing shared library program with improved code, better docs, or new features. You have full permission to improve any shared program — this is encouraged.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        code: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'code'],
    },
  },
];

// ─── Claude agent ─────────────────────────────────────────────────────────────

async function runClaudeAgent(bot: Bot, task: Task, tools: ReturnType<typeof createTools>) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Load soul content from DB (source of truth — not from workspace file)
  const soulContent = bot.soulId
    ? await (prisma as any).soul.findUnique({ where: { id: bot.soulId } }).then((s: any) => s?.content ?? null)
    : null;

  const soulSection = soulContent
    ? `${soulContent}\n\n---\n\n═══ SOUL GUIDANCE ═══\nThe soul above defines your identity, values, and decision-making style. Embody it in every task.\nYou may call update_soul ONLY when a task creates a drastic, irreversible shift in your purpose or operating environment — not for routine learnings.\n`
    : `═══ SOUL ═══\nNo soul file found. You are operating without a defined identity.\n`;

  const systemPrompt = `${soulSection}
You are an autonomous AI agent named "${bot.name}". You have tools to complete tasks independently.
Your workspace is a sandboxed directory where you can read/write files and execute code.
Temp files named run_*.py / run_*.js are auto-cleaned after the task — do not rely on them persisting.

═══ AUTONOMY (CRITICAL) ═══
You are expected to complete tasks WITHOUT asking the human for help. You have full permission to:
  - Make reasonable assumptions and proceed. State your assumption in a log, then act on it.
  - Invent sample/test data when none is provided. Do not ask for it.
  - Choose file names, formats, structures, and approaches yourself.
  - Create any helper code, utilities, or scripts you need.
  - Retry and debug failures on your own before giving up.

NEVER call ask_human for:
  - File names, variable names, or naming conventions → choose them yourself
  - Sample or test data → generate realistic synthetic data
  - Which approach to take → pick the most sensible one and proceed
  - Confirmation before starting → just start
  - What format to use → choose a standard format

ONLY call ask_human when ALL of the following are true:
  1. The task is IMPOSSIBLE to complete without a specific real-world value (e.g. a live API key, a real database URL, a real external account credential)
  2. You have genuinely no way to make progress without it
  3. There is no synthetic/mock alternative

When in doubt — make a decision and proceed. A completed task with reasonable assumptions is far better than a blocked task waiting for input.

═══ HTTP REQUESTS & API DISCOVERY ═══
Use http_request to call external APIs, scrape pages, or interact with services.
localhost URLs are automatically routed to your host machine — so http://localhost:8000/api/... works.
When asked to build a skill or client for an API:
  1. Fetch http://<host>/openapi.json (or /docs, /swagger.json) to read the full API spec
  2. Read all routes, schemas, and examples from the spec
  3. Build a complete Python/JS utility covering every endpoint
  4. Save it to the shared library so all agents can use it


Before running code that requires third-party packages, call install_package.
Examples: install_package(["requests", "beautifulsoup4"]) or install_package(["pandas", "numpy"]).
Always install before execute_code — never assume packages are pre-installed.

═══ SHARED LIBRARY (MANDATORY WORKFLOW) ═══
The shared library is a REAL persistent volume shared across ALL agents. Files saved there survive between tasks and are accessible to every other agent in this system.

You MUST follow this workflow on EVERY task:
  STEP 1 — Always call list_library at the start of any task that involves writing code.
  STEP 2 — If a relevant program exists, call load_from_library and build on it instead of rewriting.
  STEP 3 — If you write code that could be reused (parsers, scrapers, formatters, calculators, utilities), you MUST call save_to_library before finishing. This is not optional.
  STEP 4 — If you load an existing library program and improve it, you MUST call update_library with the improved version. You have full permission to modify shared library programs — improving shared code is encouraged and expected.
  STEP 5 — When a task is fully complete and working files are no longer needed, call clean_workspace to delete them from your workspace.

Rules for library programs:
  - Use snake_case names (e.g. csv_parser, web_scraper, json_formatter)
  - Write clear descriptions so other agents know when to use the program
  - Add relevant tags so programs are discoverable
  - Include usage examples in the code as comments

Always save important outputs as files in the workspace.`;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `Task: ${task.title}\n\nDescription: ${task.description}` },
  ];

  let totalTokens = 0;

  for (let i = 0; i < 20; i++) {
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

const GEMINI_TOOL_DECLARATIONS = [
  { name: 'read_file',         description: 'Read a file',                    parameters: { type: 'OBJECT', properties: { path: { type: 'STRING' } }, required: ['path'] } },
  { name: 'write_file',        description: 'Write a file',                   parameters: { type: 'OBJECT', properties: { path: { type: 'STRING' }, content: { type: 'STRING' } }, required: ['path', 'content'] } },
  { name: 'list_dir',          description: 'List directory',                 parameters: { type: 'OBJECT', properties: { path: { type: 'STRING' } } } },
  { name: 'execute_code',      description: 'Execute code',                   parameters: { type: 'OBJECT', properties: { code: { type: 'STRING' }, language: { type: 'STRING' } }, required: ['code'] } },
  { name: 'http_request',      description: 'Make HTTP requests to APIs or services. localhost is routed to host machine.', parameters: { type: 'OBJECT', properties: { url: { type: 'STRING' }, method: { type: 'STRING' }, headers: { type: 'OBJECT' }, body: { type: 'STRING' } }, required: ['url'] } },
  { name: 'install_package',   description: 'Install pip or npm packages before running code that needs them', parameters: { type: 'OBJECT', properties: { packages: { type: 'ARRAY', items: { type: 'STRING' } }, manager: { type: 'STRING' } }, required: ['packages'] } },
  { name: 'ask_human',         description: 'Ask human a question',           parameters: { type: 'OBJECT', properties: { question: { type: 'STRING' }, context: { type: 'STRING' } }, required: ['question'] } },
  { name: 'clean_workspace',    description: 'Delete all files in private workspace', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'update_soul',        description: 'Update soul.md — only for drastic identity shifts', parameters: { type: 'OBJECT', properties: { content: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['content', 'reason'] } },
  { name: 'save_to_library',   description: 'Save reusable program to shared library', parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, description: { type: 'STRING' }, code: { type: 'STRING' }, language: { type: 'STRING' } }, required: ['name', 'description', 'code'] } },
  { name: 'list_library',      description: 'List shared library programs',   parameters: { type: 'OBJECT', properties: { tag: { type: 'STRING' }, language: { type: 'STRING' } } } },
  { name: 'load_from_library', description: 'Load a program from library',    parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' } }, required: ['name'] } },
  { name: 'update_library',    description: 'Update a library program',       parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, code: { type: 'STRING' }, description: { type: 'STRING' } }, required: ['name', 'code'] } },
];

async function runGeminiAgent(bot: Bot, task: Task, tools: ReturnType<typeof createTools>) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  const model = genAI.getGenerativeModel({
    model: bot.model,
    tools: [{ functionDeclarations: GEMINI_TOOL_DECLARATIONS as any }],
  });

  const chat = model.startChat({
    history: [],
    generationConfig: { maxOutputTokens: 4096 },
  });

  const systemNote = `Before writing new code, call list_library to check for existing programs. Save reusable programs to the library.`;
  const prompt = `${systemNote}\n\nTask: ${task.title}\n\nDescription: ${task.description}`;

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

    // Guard: Gemini sometimes returns a candidate with no content (empty turn after function call)
    const parts = candidate.content?.parts ?? [];

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

    // Clean up temp execution files
    const removed = cleanupTempFiles(bot.id);
    if (removed && removed > 0) {
      await addLog(bot.id, task.id, `🧹 Cleaned up ${removed} temp file(s) from workspace`, 'info');
    }

    await setTaskStatus(task.id, 'done', { result });
    await setBotStatus(bot.id, 'idle');
    await addLog(bot.id, task.id, `✅ Task complete: ${result.slice(0, 200)}`, 'info');
    wsManager.emitToBot(bot.id, { type: 'task:done', botId: bot.id, payload: { taskId: task.id, result } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Still clean up temp files on failure
    cleanupTempFiles(bot.id);
    await setTaskStatus(task.id, 'failed', { result: msg });
    await setBotStatus(bot.id, 'failed');
    await addLog(bot.id, task.id, `❌ Task failed: ${msg}`, 'error');
    wsManager.emitToBot(bot.id, { type: 'task:failed', botId: bot.id, payload: { taskId: task.id, error: msg } });
  }
}

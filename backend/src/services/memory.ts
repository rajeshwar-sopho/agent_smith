import Anthropic from '@anthropic-ai/sdk';
import { Bot, Task } from '@prisma/client';
import { prisma } from '../db/client';

// ─── BM25 Search ─────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his',
  'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who',
  'did', 'did', 'use', 'she', 'they', 'this', 'that', 'with', 'have',
  'from', 'will', 'been', 'than', 'then', 'when', 'what', 'some', 'each',
  'also', 'into', 'more', 'such', 'like', 'time', 'just', 'been', 'here',
  'only', 'over', 'well', 'were', 'your', 'very', 'even', 'back', 'good',
  'after', 'before', 'there', 'their', 'these', 'while', 'about', 'which',
  'task', 'using', 'used', 'make', 'made', 'call', 'called', 'result',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function computeBM25(
  queryTerms: string[],
  docs: Array<{ id: string; text: string }>,
  k1 = 1.5,
  b = 0.75,
): Array<{ id: string; score: number }> {
  if (docs.length === 0) return [];

  const tokenizedDocs = docs.map(d => tokenize(d.text));
  const avgLen = tokenizedDocs.reduce((sum, d) => sum + d.length, 0) / docs.length;

  // Build document frequency map
  const df = new Map<string, number>();
  for (const tokens of tokenizedDocs) {
    for (const term of new Set(tokens)) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const N = docs.length;

  return docs.map((doc, idx) => {
    const tokens = tokenizedDocs[idx];
    const docLen = tokens.length;

    // Term frequency map
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

    let score = 0;
    for (const term of queryTerms) {
      const termTf = tf.get(term) ?? 0;
      if (termTf === 0) continue;
      const termDf = df.get(term) ?? 0;
      const idf = Math.log((N - termDf + 0.5) / (termDf + 0.5) + 1);
      const normTf = (termTf * (k1 + 1)) / (termTf + k1 * (1 - b + b * (docLen / avgLen)));
      score += idf * normTf;
    }

    return { id: doc.id, score };
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function searchMemories(
  botId: string,
  query: string,
  limit = 3,
) {
  const memories = await prisma.memory.findMany({
    where: { botId },
    orderBy: { createdAt: 'desc' },
    take: 100, // Consider the most recent 100 memories at most
  });

  if (memories.length === 0) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return memories.slice(0, limit);

  const docs = memories.map(m => ({ id: m.id, text: `${m.title} ${m.content}` }));
  const scores = computeBM25(queryTerms, docs);

  const topIds = scores
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.id);

  // Preserve ranked order
  const memoryMap = new Map(memories.map(m => [m.id, m]));
  return topIds.map(id => memoryMap.get(id)!).filter(Boolean);
}

export function formatMemoriesForPrompt(memories: Awaited<ReturnType<typeof searchMemories>>): string {
  if (memories.length === 0) return '';
  return memories
    .map((m, i) => `[Memory ${i + 1}] ${m.title} (${m.type}, ${m.createdAt.toISOString().split('T')[0]})\n${m.content}`)
    .join('\n\n');
}

// ─── Auto-save task memory ─────────────────────────────────────────────────────

function buildMemorySummary(
  task: Task,
  taskResult: string,
  recentLogs: string,
  type: 'task_outcome' | 'error_pattern',
): string {
  const lines: string[] = [];

  lines.push(`Status: ${type === 'error_pattern' ? 'FAILED' : 'COMPLETED'}`);
  lines.push(`Task: ${task.title}`);

  if (task.description && task.description !== task.title) {
    lines.push(`Description: ${task.description.slice(0, 300)}`);
  }

  lines.push(`Result: ${taskResult.slice(0, 400)}`);

  // Extract unique tools used from logs
  const toolMatches = [...recentLogs.matchAll(/Using tool: (\w+)/g)];
  const toolsUsed = [...new Set(toolMatches.map(m => m[1]))];
  if (toolsUsed.length > 0) {
    lines.push(`Tools used: ${toolsUsed.join(', ')}`);
  }

  // Extract packages installed
  const pkgMatches = [...recentLogs.matchAll(/Installing .* packages?: ([^\n]+)/g)];
  if (pkgMatches.length > 0) {
    lines.push(`Packages: ${pkgMatches.map(m => m[1]).join(', ').slice(0, 200)}`);
  }

  // Pull out key milestone log lines (errors, success markers, file/library actions)
  const keyLogLines = recentLogs
    .split('\n')
    .filter(l =>
      l.includes('❌') || l.includes('✅') || l.includes('📚') ||
      l.includes('📦') || l.includes('🌐') || l.includes('Wrote file') ||
      l.includes('error') || l.includes('Error') || l.includes('failed'),
    )
    .slice(0, 8)
    .map(l => l.trim())
    .filter(Boolean);

  if (keyLogLines.length > 0) {
    lines.push(`Key events:\n${keyLogLines.join('\n')}`);
  }

  return lines.join('\n');
}

export async function saveTaskMemory(
  bot: Bot,
  task: Task,
  taskResult: string,
  recentLogs: string,
  type: 'task_outcome' | 'error_pattern' = 'task_outcome',
) {
  try {
    const summary = buildMemorySummary(task, taskResult, recentLogs, type);

    // Extract keywords from all task text for BM25 indexing
    const keywords = [...new Set([
      ...tokenize(task.title),
      ...tokenize(task.description),
      ...tokenize(taskResult),
      ...tokenize(summary),
    ])].slice(0, 40);

    const memory = await prisma.memory.create({
      data: {
        botId: bot.id,
        taskId: task.id,
        type,
        title: task.title,
        content: summary,
        keywords: JSON.stringify(keywords),
      },
    });

    return memory;
  } catch (err) {
    console.error('[memory] Failed to save task memory:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ─── Context summarization ────────────────────────────────────────────────────

export async function summarizeMessages(
  client: Anthropic,
  model: string,
  messages: Anthropic.MessageParam[],
): Promise<string> {
  const messagesText = messages
    .map(m => {
      const role = m.role.toUpperCase();
      const content = Array.isArray(m.content)
        ? m.content
            .map(b => {
              if (typeof b === 'string') return b;
              if (b.type === 'text') return b.text;
              if (b.type === 'tool_use') return `[Tool: ${b.name}(${JSON.stringify(b.input).slice(0, 100)})]`;
              if (b.type === 'tool_result') return `[Tool result: ${String(b.content).slice(0, 200)}]`;
              return '';
            })
            .join(' ')
        : String(m.content);
      return `${role}: ${content.slice(0, 500)}`;
    })
    .join('\n');

  const response = await client.messages.create({
    model: model.startsWith('gemini-') ? 'claude-haiku-4-5-20251001' : model,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Summarize the key actions taken, tools used, intermediate results, and current execution state from this conversation excerpt. Be concise (max 300 words). This summary will replace the conversation history to free up context space.

Conversation:
${messagesText}

Write only the summary, no preamble.`,
      },
    ],
  });

  const content = response.content[0];
  return content.type === 'text' ? content.text.trim() : 'Previous conversation history condensed.';
}

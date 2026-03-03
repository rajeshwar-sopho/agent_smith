import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import botsRouter from './routes/bots';
import tasksRouter from './routes/tasks';
import workspaceRouter from './routes/workspace';
import logsRouter from './routes/logs';
import questionsRouter from './routes/questions';
import modelsRouter from './routes/models';
import libraryRouter from './routes/library';
import soulsRouter from './routes/souls';
import { wsManager } from './services/websocket';
import { prisma } from './db/client';

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json({ limit: '10mb' }));

// Static workspace files
app.use('/workspace', express.static(process.env.WORKSPACE_ROOT || './workspaces'));

// Routes
app.use('/api/bots', botsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/logs', logsRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/models', modelsRouter);
app.use('/api/library', libraryRouter);
app.use('/api/souls', soulsRouter);

// Health check
app.get('/health', (_, res) => res.json({ ok: true, ts: new Date() }));

// WebSocket setup
wsManager.init(wss);

// Seed default souls on first boot
async function seedSouls() {
  try {
    const count = await (prisma.soul as any).count();
    if (count > 0) return;
    const souls = [
      {
        name: 'Pragmatic Engineer',
        description: 'Efficient, direct, focused on working solutions over theory.',
        isDefault: true,
        content: '# Soul: Pragmatic Engineer\n\n## Identity\nYou are a pragmatic, results-driven engineer. You cut through complexity to deliver working solutions.\n\n## Core Values\n- **Working beats perfect.** Ship something functional first, then improve.\n- **Clarity over cleverness.** Readable code is better than clever code.\n- **Measure twice, cut once.** Understand the problem before writing a line.\n\n## Behavioural Traits\n- You prefer simple, proven approaches over novel ones.\n- You ask clarifying questions when requirements are ambiguous.\n- You document your decisions and tradeoffs.\n- You clean up after yourself — temp files, half-finished work, dead code.\n\n## Decision Framework\nWhen facing a hard choice, ask: *"What would a senior engineer with 10 years of production scars do?"*\n\n## Growth\nUpdate this soul only when a task fundamentally changes your understanding of your operating environment, constraints, or purpose. Cosmetic or task-specific learnings do not warrant a soul update.',
      },
      {
        name: 'Analytical Researcher',
        description: 'Thorough, curious, evidence-driven. Explores before concluding.',
        isDefault: false,
        content: '# Soul: Analytical Researcher\n\n## Identity\nYou are a meticulous researcher who forms conclusions only from evidence. You embrace uncertainty and communicate it honestly.\n\n## Core Values\n- **Evidence first.** Never assert what you have not verified.\n- **Depth over breadth.** Go deep on what matters rather than skimming everything.\n- **Intellectual honesty.** Acknowledge gaps, contradictions, and limitations.\n\n## Behavioural Traits\n- You enumerate assumptions before starting work.\n- You keep structured notes as you investigate.\n- You cite sources and save important reference material.\n- You summarise findings clearly for a non-expert reader.\n\n## Decision Framework\nWhen uncertain, ask: *"What is the minimum evidence I need to be confident in this claim?"*\n\n## Growth\nUpdate this soul when research reveals a fundamentally new domain of knowledge or responsibility that changes how you approach all future tasks.',
      },
      {
        name: 'Creative Problem Solver',
        description: 'Inventive, lateral-thinking, comfortable with ambiguity.',
        isDefault: false,
        content: '# Soul: Creative Problem Solver\n\n## Identity\nYou are an inventive agent who finds non-obvious solutions. You treat constraints as creative prompts, not blockers.\n\n## Core Values\n- **Reframe before you solve.** The first definition of a problem is rarely the best one.\n- **Breadth of exploration.** Generate multiple solutions before committing to one.\n- **Elegant simplicity.** The best solution often feels obvious in hindsight.\n\n## Behavioural Traits\n- You sketch two or three approaches before picking one.\n- You look for analogies from other domains.\n- You prototype quickly to test assumptions.\n- You embrace failure as information.\n\n## Decision Framework\nWhen stuck, ask: *"What would I do if the obvious approach was forbidden?"*\n\n## Growth\nUpdate this soul only when a major breakthrough or repeated failure teaches you something fundamental about your creative process or domain.',
      },
    ];
    for (const s of souls) {
      await (prisma.soul as any).create({ data: s });
    }
    console.log('🌱 Seeded 3 default souls');
  } catch (e) {
    console.warn('Soul seeding skipped (migration may be pending):', String(e).slice(0, 120));
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

const PORT = parseInt(process.env.PORT || '4000');
httpServer.listen(PORT, async () => {
  console.log(`🚀 BotOrchestrator backend running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}/ws`);
  await seedSouls();
});

export { app, httpServer };

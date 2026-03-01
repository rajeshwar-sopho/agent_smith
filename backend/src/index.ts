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

// Health check
app.get('/health', (_, res) => res.json({ ok: true, ts: new Date() }));

// WebSocket setup
wsManager.init(wss);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

const PORT = parseInt(process.env.PORT || '4000');
httpServer.listen(PORT, () => {
  console.log(`🚀 BotOrchestrator backend running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}/ws`);
});

export { app, httpServer };

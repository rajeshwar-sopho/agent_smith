import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client';
import { wsManager } from '../services/websocket';
import { runAgentTask } from '../services/agent';

const router = Router();

const CreateTaskSchema = z.object({
  botId: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
});

// GET /api/tasks?botId=...
router.get('/', async (req, res) => {
  try {
    const tasks = await prisma.task.findMany({
      where: req.query.botId ? { botId: String(req.query.botId) } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { subtasks: { orderBy: { order: 'asc' } } },
    });
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/tasks/:id
router.get('/:id', async (req, res) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        subtasks: { orderBy: { order: 'asc' } },
        logs: { orderBy: { createdAt: 'asc' }, take: 200 },
        questions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/tasks - Create and kick off a task
router.post('/', async (req, res) => {
  try {
    const body = CreateTaskSchema.parse(req.body);

    const bot = await prisma.bot.findUnique({ where: { id: body.botId } });
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const task = await prisma.task.create({
      data: {
        botId: body.botId,
        title: body.title,
        description: body.description,
        status: 'pending',
      },
    });

    res.status(201).json(task);

    // Run agent task async (non-blocking response already sent)
    runAgentTask(bot, task).catch((err) => {
      console.error('Agent task error:', err);
    });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/tasks/:id/retry
router.post('/:id/retry', async (req, res) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const bot = await prisma.bot.findUnique({ where: { id: task.botId } });
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    // Reset task state and clear old logs for this task
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { status: 'pending', result: null, tokenUsage: 0 },
    });
    await prisma.log.deleteMany({ where: { taskId: task.id } });

    res.json(updated);

    runAgentTask(bot, updated).catch((err) => {
      console.error('Agent retry error:', err);
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;

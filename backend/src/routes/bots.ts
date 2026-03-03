import { Router } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { prisma } from '../db/client';
import { createBotContainer, stopBotContainer } from '../services/docker';
import { wsManager } from '../services/websocket';

const router = Router();
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.resolve('./workspaces');

const CreateBotSchema = z.object({
  name: z.string().min(1).max(100),
  model: z.string().default('claude-sonnet-4-5'),
  soulId: z.string().optional(),
});

// GET /api/bots
router.get('/', async (req, res) => {
  try {
    const bots = await (prisma.bot as any).findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { tasks: true } },
        soul: true,
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { title: true, status: true, createdAt: true },
        },
      },
    });
    res.json(bots);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/bots/:id
router.get('/:id', async (req, res) => {
  try {
    const bot = await (prisma.bot as any).findUnique({
      where: { id: req.params.id },
      include: {
        soul: true,
        tasks: { orderBy: { createdAt: 'desc' } },
        questions: {
          where: { status: 'pending' },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    res.json(bot);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/bots
router.post('/', async (req, res) => {
  try {
    const body = CreateBotSchema.parse(req.body);

    // Resolve soul: use provided soulId or fall back to the default soul
    let soulId = body.soulId;
    if (!soulId) {
      const defaultSoul = await (prisma as any).soul.findFirst({ where: { isDefault: true } });
      if (defaultSoul) soulId = defaultSoul.id;
    }

    const bot = await prisma.bot.create({
      data: { name: body.name, model: body.model, status: 'idle', ...(soulId && { soulId }) } as any,
    });

    // Soul lives in the DB — loaded at task runtime, not written to workspace

    // Start the Docker container
    try {
      const containerId = await createBotContainer(bot.id);
      await prisma.bot.update({
        where: { id: bot.id },
        data: { containerId },
      });
      bot.containerId = containerId;
    } catch (dockerErr) {
      console.error('Docker error (continuing):', dockerErr);
      // Don't fail — bot can work without container in dev mode
    }

    wsManager.broadcast({ type: 'bot:created', botId: bot.id, payload: bot });

    res.status(201).json(bot);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /api/bots/:id
router.patch('/:id', async (req, res) => {
  try {
    const bot = await prisma.bot.update({
      where: { id: req.params.id },
      data: req.body,
    });
    wsManager.broadcast({ type: 'bot:updated', botId: bot.id, payload: bot });
    res.json(bot);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/bots/:id
router.delete('/:id', async (req, res) => {
  try {
    const bot = await prisma.bot.findUnique({ where: { id: req.params.id } });
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    if (bot.containerId) {
      await stopBotContainer(bot.containerId);
    }

    await prisma.bot.delete({ where: { id: req.params.id } });
    wsManager.broadcast({ type: 'bot:deleted', botId: bot.id, payload: { id: bot.id } });

    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/bots/:id/restart
router.post('/:id/restart', async (req, res) => {
  try {
    const bot = await prisma.bot.findUnique({ where: { id: req.params.id } });
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    if (bot.containerId) {
      await stopBotContainer(bot.containerId);
    }

    const newContainerId = await createBotContainer(bot.id);
    const updated = await prisma.bot.update({
      where: { id: bot.id },
      data: { containerId: newContainerId, status: 'idle' },
    });

    wsManager.statusChange(bot.id, 'idle');
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;

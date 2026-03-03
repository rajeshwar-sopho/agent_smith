import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client';

const router = Router();

// GET /api/bots/:botId/memories — list memories for a bot
router.get('/bots/:botId/memories', async (req, res) => {
  try {
    const { botId } = req.params;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);

    const memories = await prisma.memory.findMany({
      where: { botId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(memories);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/memories/:id — delete a specific memory
router.delete('/memories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.memory.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;

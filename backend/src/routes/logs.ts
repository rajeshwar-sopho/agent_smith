import { Router } from 'express';
import { prisma } from '../db/client';

const router = Router();

// GET /api/logs?botId=...&taskId=...&limit=100
router.get('/', async (req, res) => {
  try {
    const logs = await prisma.log.findMany({
      where: {
        ...(req.query.botId ? { botId: String(req.query.botId) } : {}),
        ...(req.query.taskId ? { taskId: String(req.query.taskId) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(String(req.query.limit || '100')), 500),
    });
    res.json(logs.reverse());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;

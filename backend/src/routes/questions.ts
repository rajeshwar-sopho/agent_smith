import { Router } from 'express';
import { prisma } from '../db/client';
import { wsManager } from '../services/websocket';

const router = Router();

// GET /api/questions?botId=...
router.get('/', async (req, res) => {
  try {
    const questions = await prisma.humanQuestion.findMany({
      where: {
        ...(req.query.botId ? { botId: String(req.query.botId) } : {}),
        ...(req.query.status ? { status: String(req.query.status) } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(questions);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/questions/:id/answer
router.post('/:id/answer', async (req, res) => {
  try {
    const { answer } = req.body;
    if (!answer) return res.status(400).json({ error: 'answer is required' });

    const question = await prisma.humanQuestion.update({
      where: { id: req.params.id },
      data: { answer, status: 'answered', answeredAt: new Date() },
    });

    // Update bot status back to executing
    await prisma.bot.update({
      where: { id: question.botId },
      data: { status: 'executing' },
    });

    wsManager.emitToBot(question.botId, {
      type: 'human:answer',
      botId: question.botId,
      payload: { questionId: question.id, answer },
    });
    wsManager.statusChange(question.botId, 'executing');

    res.json(question);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;

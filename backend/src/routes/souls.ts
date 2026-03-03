import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client';

const router = Router();

const SoulSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1),
  content: z.string().min(1),
  isDefault: z.boolean().optional(),
});

// GET /api/souls
router.get('/', async (_req, res) => {
  try {
    const souls = await (prisma as any).soul.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: { _count: { select: { bots: true } } },
    });
    res.json(souls);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/souls/:id
router.get('/:id', async (req, res) => {
  try {
    const soul = await (prisma as any).soul.findUnique({ where: { id: req.params.id } });
    if (!soul) return res.status(404).json({ error: 'Soul not found' });
    res.json(soul);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/souls
router.post('/', async (req, res) => {
  try {
    const body = SoulSchema.parse(req.body);
    if (body.isDefault) {
      await (prisma as any).soul.updateMany({ data: { isDefault: false } });
    }
    const soul = await (prisma as any).soul.create({ data: body });
    res.status(201).json(soul);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /api/souls/:id
router.patch('/:id', async (req, res) => {
  try {
    const soul = await (prisma as any).soul.findUnique({ where: { id: req.params.id } });
    if (!soul) return res.status(404).json({ error: 'Soul not found' });

    const { name, description, content, isDefault } = req.body as Record<string, unknown>;
    if (isDefault) {
      await (prisma as any).soul.updateMany({ data: { isDefault: false } });
    }

    const updated = await (prisma as any).soul.update({
      where: { id: req.params.id },
      data: {
        ...(name        !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(content     !== undefined && { content }),
        ...(isDefault   !== undefined && { isDefault }),
      },
    });

    // Soul content is loaded from DB at task runtime — no workspace sync needed

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/souls/:id
router.delete('/:id', async (req, res) => {
  try {
    const soul = await (prisma as any).soul.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { bots: true } } },
    });
    if (!soul) return res.status(404).json({ error: 'Soul not found' });
    if (soul._count?.bots > 0) {
      return res.status(400).json({ error: 'Cannot delete a soul that is assigned to bots' });
    }
    await (prisma as any).soul.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;

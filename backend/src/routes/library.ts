import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../db/client';

const router = Router();
const SHARED_PROGRAMS_ROOT = process.env.SHARED_PROGRAMS_ROOT || path.resolve('./shared-programs');

// GET /api/library — list all programs, optional ?tag= filter
router.get('/', async (req, res) => {
  try {
    const { tag, language, q } = req.query as Record<string, string>;
    const all = await prisma.sharedProgram.findMany({ orderBy: { usageCount: 'desc' } });

    let results = all.map(p => ({
      ...p,
      tags: JSON.parse(p.tags || '[]') as string[],
    }));

    if (tag)      results = results.filter(p => p.tags.includes(tag));
    if (language) results = results.filter(p => p.language === language);
    if (q)        results = results.filter(p =>
      p.name.includes(q) || p.description.toLowerCase().includes(q.toLowerCase())
    );

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/library/:name — get metadata + source code
router.get('/:name', async (req, res) => {
  try {
    const program = await prisma.sharedProgram.findUnique({ where: { name: req.params.name } });
    if (!program) return res.status(404).json({ error: 'Program not found' });

    const filePath = path.join(SHARED_PROGRAMS_ROOT, program.filename);
    const code = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;

    res.json({ ...program, tags: JSON.parse(program.tags || '[]'), code });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/library/:name — delete a program
router.delete('/:name', async (req, res) => {
  try {
    const program = await prisma.sharedProgram.findUnique({ where: { name: req.params.name } });
    if (!program) return res.status(404).json({ error: 'Program not found' });

    const filePath = path.join(SHARED_PROGRAMS_ROOT, program.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await prisma.sharedProgram.delete({ where: { name: req.params.name } });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;

import { Router } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.resolve('./workspaces');

function safePath(botId: string, filePath = ''): string {
  const base = path.join(WORKSPACE_ROOT, botId);
  const resolved = path.resolve(base, filePath.replace(/^\/+/, ''));
  if (!resolved.startsWith(base)) throw new Error('Path traversal denied');
  return resolved;
}

function readDirTree(dir: string, depth = 0): unknown {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  return items.map((item) => {
    const full = path.join(dir, item.name);
    if (item.isDirectory() && depth < 3) {
      return { name: item.name, type: 'dir', children: readDirTree(full, depth + 1) };
    }
    const stat = fs.statSync(full);
    return { name: item.name, type: 'file', size: stat.size, mtime: stat.mtime };
  });
}

// GET /api/workspace/:botId/tree
router.get('/:botId/tree', (req, res) => {
  try {
    const dir = safePath(req.params.botId);
    if (!fs.existsSync(dir)) return res.json([]);
    const tree = readDirTree(dir);
    res.json(tree);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /api/workspace/:botId/file?path=...
router.get('/:botId/file', (req, res) => {
  try {
    const filePath = safePath(req.params.botId, String(req.query.path || ''));
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return res.status(404).json({ error: 'File not found' });
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ path: req.query.path, content });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /api/workspace/:botId/screenshots
router.get('/:botId/screenshots', (req, res) => {
  try {
    const dir = safePath(req.params.botId);
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir).filter((f) => f.match(/\.(png|jpg|jpeg|webp)$/i));
    res.json(files.map((f) => `/workspace/${req.params.botId}/${f}`));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

export default router;

import { Router } from 'express';
import { prisma } from '../db/client';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectLanguage(filename: string): string {
  if (filename.endsWith('.py')) return 'python';
  if (filename.endsWith('.js') || filename.endsWith('.ts')) return 'javascript';
  if (filename.endsWith('.sh')) return 'shell';
  return 'text';
}

async function fetchGitHubJson(url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'agent-smith', 'Accept': 'application/vnd.github.v3+json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw Object.assign(new Error(`GitHub API error: ${res.status} ${res.statusText}`), { status: res.status });
  return res.json() as Promise<any>;
}

function decodeBase64(b64: string): string {
  return Buffer.from(b64.replace(/\s/g, ''), 'base64').toString('utf-8');
}

// Extract file/folder paths referenced in a SKILL.md markdown document
function extractPathsFromMarkdown(content: string): string[] {
  const paths = new Set<string>();
  // Markdown links: [text](path/to/file)
  const linkRegex = /\[.*?\]\(([^)#?\s]+)\)/g;
  let m;
  while ((m = linkRegex.exec(content)) !== null) {
    const p = m[1].trim();
    if (!p.startsWith('http') && !p.startsWith('//') && p.length > 0) paths.add(p);
  }
  // Inline code paths with code extensions or trailing slash (directory)
  const codeRegex = /`([^`\s]+(?:\.(?:py|js|ts|sh)|\/[^`\s]*))`/g;
  while ((m = codeRegex.exec(content)) !== null) {
    const p = m[1].trim();
    if (!p.startsWith('http') && p.length > 0 && !p.startsWith('#')) paths.add(p);
  }
  return Array.from(paths).filter(p => !p.includes(' ') && p.length > 1);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/skills — list all skills
router.get('/', async (_req, res) => {
  try {
    const skills = await (prisma as any).skill.findMany({
      orderBy: { name: 'asc' },
      include: { files: { select: { id: true, filename: true, language: true } } },
    });
    res.json(skills.map((s: any) => ({
      ...s,
      tags: JSON.parse(s.tags || '[]'),
      _count: { files: s.files.length },
      files: s.files,
    })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/skills/:name — get skill detail with context + files
router.get('/:name', async (req, res) => {
  try {
    const skill = await (prisma as any).skill.findUnique({
      where: { name: req.params.name },
      include: { files: true },
    });
    if (!skill) return res.status(404).json({ error: 'Skill not found' });
    res.json({ ...skill, tags: JSON.parse(skill.tags || '[]') });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/skills/import/github — import from GitHub repo URL
router.post('/import/github', async (req, res) => {
  try {
    const { repoUrl } = req.body as { repoUrl: string };
    if (!repoUrl) return res.status(400).json({ error: 'repoUrl is required' });

    // Parse owner/repo from URL
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return res.status(400).json({ error: 'Invalid GitHub URL. Expected format: https://github.com/owner/repo' });
    const [, owner, repoRaw] = match;
    const repo = repoRaw.replace(/\.git$/, '');

    // Fetch repo root contents
    let contents: any[];
    try {
      contents = await fetchGitHubJson(`https://api.github.com/repos/${owner}/${repo}/contents/`);
    } catch (e: any) {
      if (e.status === 404) return res.status(404).json({ error: `Repository "${owner}/${repo}" not found or is private` });
      throw e;
    }

    if (!Array.isArray(contents)) return res.status(422).json({ error: 'Unexpected GitHub API response' });

    // Derive skill name from repo
    const skillName = repo.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let skillDescription = `Imported from ${owner}/${repo}`;

    // Find SKILL.md first, fall back to README.md
    const skillMdEntry = contents.find((f: any) => f.type === 'file' && f.name === 'SKILL.md')
      || contents.find((f: any) => f.type === 'file' && f.name.toLowerCase() === 'skill.md');
    const readmeFallback = contents.find((f: any) => f.type === 'file' && f.name.toLowerCase() === 'readme.md');
    const contextEntry = skillMdEntry || readmeFallback;

    if (!contextEntry) return res.status(422).json({ error: 'No SKILL.md or README.md found in repository root' });

    const contextData = await fetchGitHubJson(contextEntry.url);
    const contextContent = decodeBase64(contextData.content);

    // Extract description from first non-empty line after the H1 heading
    const descMatch = contextContent.match(/^#[^\n]*\n+([^\n#]+)/m);
    if (descMatch) skillDescription = descMatch[1].trim().slice(0, 200);

    // Collect root-level code files (.py, .js, .ts, .sh) — skip large files
    const codeExtensions = ['.py', '.js', '.ts', '.sh'];
    const skillFiles: Array<{ filename: string; language: string; content: string }> = [];
    const addedPaths = new Set<string>();

    const rootCodeEntries = contents.filter((f: any) =>
      f.type === 'file' &&
      codeExtensions.some(ext => f.name.endsWith(ext)) &&
      f.size <= 50000
    );
    for (const entry of rootCodeEntries) {
      try {
        const fileData = await fetchGitHubJson(entry.url);
        skillFiles.push({ filename: entry.name, language: detectLanguage(entry.name), content: decodeBase64(fileData.content) });
        addedPaths.add(entry.name);
      } catch { /* skip */ }
    }

    // Also fetch files from paths/folders referenced in SKILL.md
    const referencedPaths = extractPathsFromMarkdown(contextContent);
    for (const refPath of referencedPaths) {
      try {
        const data = await fetchGitHubJson(`https://api.github.com/repos/${owner}/${repo}/contents/${refPath}`);
        if (Array.isArray(data)) {
          // Directory — fetch code files inside it
          for (const entry of data) {
            if (entry.type === 'file' && codeExtensions.some((ext: string) => entry.name.endsWith(ext)) && entry.size <= 50000) {
              const fullPath = `${refPath.replace(/\/$/, '')}/${entry.name}`;
              if (!addedPaths.has(fullPath)) {
                try {
                  const fileData = await fetchGitHubJson(entry.url);
                  skillFiles.push({ filename: fullPath, language: detectLanguage(entry.name), content: decodeBase64(fileData.content) });
                  addedPaths.add(fullPath);
                } catch { /* skip */ }
              }
            }
          }
        } else if (data.type === 'file' && codeExtensions.some((ext: string) => refPath.endsWith(ext)) && data.size <= 50000) {
          // Individual file
          if (!addedPaths.has(refPath)) {
            skillFiles.push({ filename: refPath, language: detectLanguage(refPath), content: decodeBase64(data.content) });
            addedPaths.add(refPath);
          }
        }
      } catch { /* skip missing or inaccessible refs */ }
    }

    // Upsert skill (re-import updates existing)
    const existing = await (prisma as any).skill.findUnique({ where: { name: skillName } });
    let skill: any;

    if (existing) {
      // Delete old files and recreate
      await (prisma as any).skillFile.deleteMany({ where: { skillId: existing.id } });
      skill = await (prisma as any).skill.update({
        where: { name: skillName },
        data: {
          description: skillDescription,
          repoUrl: repoUrl,
          context: contextContent,
          tags: JSON.stringify([]),
          updatedAt: new Date(),
          files: { create: skillFiles },
        },
        include: { files: true },
      });
    } else {
      skill = await (prisma as any).skill.create({
        data: {
          name: skillName,
          description: skillDescription,
          repoUrl: repoUrl,
          context: contextContent,
          tags: JSON.stringify([]),
          files: { create: skillFiles },
        },
        include: { files: true },
      });
    }

    res.json({ ...skill, tags: JSON.parse(skill.tags || '[]') });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/skills — create skill manually
router.post('/', async (req, res) => {
  try {
    const { name, description, context, tags = [], files = [], repoUrl } = req.body as {
      name: string;
      description: string;
      context: string;
      tags?: string[];
      files?: Array<{ filename: string; language: string; content: string }>;
      repoUrl?: string;
    };

    if (!name || !description || !context) {
      return res.status(400).json({ error: 'name, description, and context are required' });
    }

    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const skill = await (prisma as any).skill.create({
      data: {
        name: safeName,
        description,
        repoUrl: repoUrl || null,
        context,
        tags: JSON.stringify(tags),
        files: { create: files.map(f => ({ filename: f.filename, language: f.language || detectLanguage(f.filename), content: f.content })) },
      },
      include: { files: true },
    });

    res.status(201).json({ ...skill, tags: JSON.parse(skill.tags || '[]') });
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A skill with this name already exists' });
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/skills/:name — update skill metadata
router.patch('/:name', async (req, res) => {
  try {
    const { description, context, tags } = req.body as {
      description?: string;
      context?: string;
      tags?: string[];
    };

    const skill = await (prisma as any).skill.update({
      where: { name: req.params.name },
      data: {
        ...(description !== undefined && { description }),
        ...(context !== undefined && { context }),
        ...(tags !== undefined && { tags: JSON.stringify(tags) }),
      },
      include: { files: true },
    });

    res.json({ ...skill, tags: JSON.parse(skill.tags || '[]') });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Skill not found' });
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/skills/:name — delete skill + cascade files
router.delete('/:name', async (req, res) => {
  try {
    await (prisma as any).skill.delete({ where: { name: req.params.name } });
    res.json({ deleted: true });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Skill not found' });
    res.status(500).json({ error: String(err) });
  }
});

export default router;

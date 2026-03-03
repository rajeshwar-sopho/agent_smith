import { Router } from 'express';

const router = Router();

export interface ModelInfo {
  id: string;
  name: string;
  provider: 'claude' | 'gemini';
  description: string;
  tier: 'fast' | 'balanced' | 'powerful';
}

const MODELS: ModelInfo[] = [
  // ─── Anthropic Claude ─────────────────────────────────────────────────────
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'claude',
    description: 'Fastest & most affordable. Great for simple tasks.',
    tier: 'fast',
  },
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    provider: 'claude',
    description: 'Best balance of speed and intelligence.',
    tier: 'balanced',
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'claude',
    description: 'Latest Sonnet — faster and smarter than 4.5.',
    tier: 'balanced',
  },
  {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    provider: 'claude',
    description: 'Most powerful Claude model for complex reasoning.',
    tier: 'powerful',
  },

  // ─── Google Gemini ────────────────────────────────────────────────────────
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'gemini',
    description: 'Fast, cost-effective multimodal model.',
    tier: 'fast',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    description: 'Best price-performance with adaptive thinking.',
    tier: 'balanced',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'gemini',
    description: 'Most capable Gemini model for complex reasoning.',
    tier: 'powerful',
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash (Preview)',
    provider: 'gemini',
    description: 'Next-gen Flash — preview access, fast & multimodal.',
    tier: 'fast',
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro (Preview)',
    provider: 'gemini',
    description: 'Next-gen Pro — preview access, most capable Gemini.',
    tier: 'powerful',
  },
];

// GET /api/models
router.get('/', (_req, res) => {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;

  const available = MODELS.map(m => ({
    ...m,
    available: m.provider === 'claude' ? hasAnthropic : hasGemini,
  }));

  res.json(available);
});

export default router;

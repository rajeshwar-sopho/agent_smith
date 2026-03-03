const BASE_URL = import.meta.env.VITE_API_URL || '';

export interface Bot {
  id: string;
  name: string;
  model: 'claude' | 'gemini';
  status: 'idle' | 'planning' | 'researching' | 'executing' | 'waiting_for_human' | 'done' | 'failed';
  containerId: string | null;
  soulId: string | null;
  soul?: Soul | null;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number };
  tasks?: Task[];
  questions?: HumanQuestion[];
}

export interface Task {
  id: string;
  botId: string;
  title: string;
  description: string;
  status: 'pending' | 'planning' | 'executing' | 'waiting' | 'done' | 'failed';
  plan: string | null;
  result: string | null;
  tokenUsage: number;
  createdAt: string;
  updatedAt: string;
  subtasks?: Subtask[];
  logs?: Log[];
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  status: 'pending' | 'doing' | 'done' | 'failed';
  order: number;
}

export interface Log {
  id: string;
  botId: string;
  taskId: string | null;
  level: 'info' | 'warn' | 'error' | 'tool';
  message: string;
  meta: string | null;
  createdAt: string;
}

export interface HumanQuestion {
  id: string;
  botId: string;
  taskId: string | null;
  question: string;
  context: string | null;
  answer: string | null;
  status: 'pending' | 'answered';
  createdAt: string;
  answeredAt: string | null;
}

export interface FileNode {
  name: string;
  type: 'file' | 'dir';
  size?: number;
  mtime?: string;
  children?: FileNode[];
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Bots
  getBots: () => req<Bot[]>('/bots'),
  getBot: (id: string) => req<Bot>(`/bots/${id}`),
  createBot: (data: { name: string; model: string; soulId?: string }) =>
    req<Bot>('/bots', { method: 'POST', body: JSON.stringify(data) }),
  deleteBot: (id: string) => req<{ deleted: boolean }>(`/bots/${id}`, { method: 'DELETE' }),
  restartBot: (id: string) => req<Bot>(`/bots/${id}/restart`, { method: 'POST' }),

  // Tasks
  getTasks: (botId: string) => req<Task[]>(`/tasks?botId=${botId}`),
  getTask: (id: string) => req<Task>(`/tasks/${id}`),
  createTask: (data: { botId: string; title: string; description: string }) =>
    req<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  deleteTask: (id: string) => req<{ deleted: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
  retryTask: (id: string) => req<Task>(`/tasks/${id}/retry`, { method: 'POST' }),

  // Logs
  getLogs: (botId: string, taskId?: string) =>
    req<Log[]>(`/logs?botId=${botId}${taskId ? `&taskId=${taskId}` : ''}&limit=200`),

  // Workspace
  getFileTree: (botId: string) => req<FileNode[]>(`/workspace/${botId}/tree`),
  getFile: (botId: string, path: string) =>
    req<{ path: string; content: string }>(`/workspace/${botId}/file?path=${encodeURIComponent(path)}`),
  getScreenshots: (botId: string) => req<string[]>(`/workspace/${botId}/screenshots`),
  cleanWorkspace: (botId: string) =>
    req<{ cleaned: boolean; filesRemoved: number }>(`/workspace/${botId}/clean`, { method: 'POST' }),

  // Human questions
  getQuestions: (botId: string) => req<HumanQuestion[]>(`/questions?botId=${botId}`),
  getModels: () => req<ModelInfo[]>('/models'),

  // Library
  getLibrary: (params?: { tag?: string; language?: string; q?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v))).toString() : '';
    return req<SharedProgram[]>('/library' + qs);
  },
  getLibraryProgram: (name: string) => req<SharedProgram>('/library/' + name),
  deleteLibraryProgram: (name: string) => req<{ deleted: boolean }>('/library/' + name, { method: 'DELETE' }),

  // Souls
  getSouls: () => req<Soul[]>('/souls'),
  getSoul: (id: string) => req<Soul>(`/souls/${id}`),
  createSoul: (data: { name: string; description: string; content: string; isDefault?: boolean }) =>
    req<Soul>('/souls', { method: 'POST', body: JSON.stringify(data) }),
  updateSoul: (id: string, data: Partial<{ name: string; description: string; content: string; isDefault: boolean }>) =>
    req<Soul>(`/souls/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSoul: (id: string) => req<{ deleted: boolean }>(`/souls/${id}`, { method: 'DELETE' }),

  answerQuestion: (id: string, answer: string) =>
    req<HumanQuestion>(`/questions/${id}/answer`, { method: 'POST', body: JSON.stringify({ answer }) }),

  // Memory
  getMemories: (botId: string) => req<Memory[]>(`/bots/${botId}/memories`),
  deleteMemory: (id: string) => req<{ success: boolean }>(`/memories/${id}`, { method: 'DELETE' }),

  // Skills
  getSkills: () => req<Skill[]>('/skills'),
  getSkill: (name: string) => req<Skill>(`/skills/${name}`),
  createSkill: (data: { name: string; description: string; context: string; tags?: string[]; files?: { filename: string; language: string; content: string }[] }) =>
    req<Skill>('/skills', { method: 'POST', body: JSON.stringify(data) }),
  deleteSkill: (name: string) => req<{ deleted: boolean }>(`/skills/${name}`, { method: 'DELETE' }),
  importSkillFromGitHub: (repoUrl: string) => req<Skill>('/skills/import/github', { method: 'POST', body: JSON.stringify({ repoUrl }) }),
};

export interface ModelInfo {
  id: string;
  name: string;
  provider: 'claude' | 'gemini';
  description: string;
  tier: 'fast' | 'balanced' | 'powerful';
  available: boolean;
}

export interface Soul {
  id: string;
  name: string;
  description: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { bots: number };
}

export interface Memory {
  id: string;
  botId: string;
  taskId: string | null;
  type: 'task_outcome' | 'error_pattern' | 'insight';
  title: string;
  content: string;
  keywords: string;
  createdAt: string;
}

export interface SkillFile {
  id: string;
  skillId: string;
  filename: string;
  language: string;
  content: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  repoUrl: string | null;
  context: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  files?: SkillFile[];
  _count?: { files: number };
}

export interface SharedProgram {
  id: string;
  name: string;
  description: string;
  language: string;
  filename: string;
  tags: string[];
  usageCount: number;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  code?: string | null;
}

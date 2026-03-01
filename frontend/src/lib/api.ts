const BASE_URL = import.meta.env.VITE_API_URL || '';

export interface Bot {
  id: string;
  name: string;
  model: 'claude' | 'gemini';
  status: 'idle' | 'planning' | 'researching' | 'executing' | 'waiting_for_human' | 'done' | 'failed';
  containerId: string | null;
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
  createBot: (data: { name: string; model: string }) =>
    req<Bot>('/bots', { method: 'POST', body: JSON.stringify(data) }),
  deleteBot: (id: string) => req<{ deleted: boolean }>(`/bots/${id}`, { method: 'DELETE' }),
  restartBot: (id: string) => req<Bot>(`/bots/${id}/restart`, { method: 'POST' }),

  // Tasks
  getTasks: (botId: string) => req<Task[]>(`/tasks?botId=${botId}`),
  getTask: (id: string) => req<Task>(`/tasks/${id}`),
  createTask: (data: { botId: string; title: string; description: string }) =>
    req<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  deleteTask: (id: string) => req<{ deleted: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),

  // Logs
  getLogs: (botId: string, taskId?: string) =>
    req<Log[]>(`/logs?botId=${botId}${taskId ? `&taskId=${taskId}` : ''}&limit=200`),

  // Workspace
  getFileTree: (botId: string) => req<FileNode[]>(`/workspace/${botId}/tree`),
  getFile: (botId: string, path: string) =>
    req<{ path: string; content: string }>(`/workspace/${botId}/file?path=${encodeURIComponent(path)}`),
  getScreenshots: (botId: string) => req<string[]>(`/workspace/${botId}/screenshots`),

  // Human questions
  getQuestions: (botId: string) => req<HumanQuestion[]>(`/questions?botId=${botId}`),
  getModels: () => req<ModelInfo[]>('/models'),

  answerQuestion: (id: string, answer: string) =>
    req<HumanQuestion>(`/questions/${id}/answer`, { method: 'POST', body: JSON.stringify({ answer }) }),
};

export interface ModelInfo {
  id: string;
  name: string;
  provider: 'claude' | 'gemini';
  description: string;
  tier: 'fast' | 'balanced' | 'powerful';
  available: boolean;
}

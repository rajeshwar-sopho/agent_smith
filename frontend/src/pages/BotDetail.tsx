import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, RefreshCw, Trash2, FolderOpen, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { api, Bot, Task, Log, HumanQuestion, FileNode } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import { useSubscribeToBot } from '../hooks/useWebSocket';
import { formatDistanceToNow } from 'date-fns';

export default function BotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [bot, setBot] = useState<Bot | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [pendingQuestions, setPendingQuestions] = useState<HumanQuestion[]>([]);
  const [taskInput, setTaskInput] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'logs' | 'tasks' | 'files' | 'screenshots'>('logs');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);

  const loadAll = useCallback(async () => {
    if (!id) return;
    const [botData, logsData, tasksData, treeData, screenshotsData, questionsData] = await Promise.all([
      api.getBot(id),
      api.getLogs(id),
      api.getTasks(id),
      api.getFileTree(id),
      api.getScreenshots(id),
      api.getQuestions(id),
    ]);
    setBot(botData);
    setLogs(logsData);
    setTasks(tasksData);
    setFileTree(treeData);
    setScreenshots(screenshotsData);
    setPendingQuestions(questionsData.filter(q => q.status === 'pending'));
  }, [id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useSubscribeToBot(id || null, useCallback((msg) => {
    if (msg.type === 'log') {
      setLogs(prev => [...prev, {
        id: Date.now().toString(), botId: id!,
        taskId: (msg.payload as { taskId?: string }).taskId ?? null,
        level: (msg.payload as { level: string }).level as Log['level'],
        message: (msg.payload as { message: string }).message,
        meta: null,
        createdAt: (msg.payload as { ts: string }).ts,
      }]);
    }
    if (msg.type === 'bot:status') {
      setBot(prev => prev ? { ...prev, status: (msg.payload as { status: Bot['status'] }).status } : prev);
    }
    if (msg.type === 'human:question') {
      setPendingQuestions(prev => [...prev, msg.payload as HumanQuestion]);
    }
    if (msg.type === 'task:done' || msg.type === 'task:failed') {
      loadAll();
    }
  }, [id, loadAll]));

  // Auto-scroll only when viewing the selected task's logs
  useEffect(() => {
    if (activeTab === 'logs') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  const handleSubmitTask = async () => {
    if (!taskInput.trim() || !id) return;
    setSubmitting(true);
    try {
      const newTask = await api.createTask({ botId: id, title: taskInput.trim(), description: taskDesc.trim() || taskInput.trim() });
      setTaskInput('');
      setTaskDesc('');
      // Auto-select the new task and switch to logs tab
      setSelectedTaskId(newTask.id);
      setActiveTab('logs');
      loadAll();
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileClick = async (path: string) => {
    if (!id) return;
    const file = await api.getFile(id, path);
    setSelectedFile(file);
  };

  const handleTaskSelect = (taskId: string) => {
    setSelectedTaskId(prev => prev === taskId ? null : taskId);
    setActiveTab('logs');
  };

  // Filter logs by selected task
  const visibleLogs = selectedTaskId
    ? logs.filter(l => l.taskId === selectedTaskId)
    : [];

  const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? null;

  if (!bot) return <div style={{ padding: 48, color: '#475569', textAlign: 'center' }}>Loading bot...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', gap: 16,
        background: '#0c0c15', flexShrink: 0,
      }}>
        <button onClick={() => navigate('/bots')} style={{
          background: 'none', border: 'none', color: '#475569', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div style={{ fontSize: 20 }}>{bot.model.startsWith('gemini') ? '✨' : '🧠'}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#f1f5f9' }}>{bot.name}</div>
            <div style={{ fontSize: 11, color: '#475569', fontFamily: 'DM Mono' }}>{bot.model}</div>
          </div>
        </div>
        <StatusBadge status={bot.status} />
        <button onClick={() => api.restartBot(bot.id).then(loadAll)} style={{
          background: '#1e293b', border: 'none', color: '#64748b', padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
        }}>
          <RefreshCw size={14} />
        </button>
        <button onClick={async () => { if (confirm('Delete this bot?')) { await api.deleteBot(bot.id); navigate('/bots'); } }} style={{
          background: '#f43f5e15', border: 'none', color: '#f43f5e', padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
        }}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* Human question banner */}
      {pendingQuestions.length > 0 && pendingQuestions.map(q => (
        <QuestionBanner key={q.id} question={q} onAnswer={() => loadAll()} />
      ))}

      {/* 3-panel layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: Task input + task list */}
        <div style={{
          width: 280, borderRight: '1px solid #1e293b', display: 'flex',
          flexDirection: 'column', background: '#0c0c15', flexShrink: 0,
        }}>
          <div style={{ padding: 16, borderBottom: '1px solid #1e293b' }}>
            <div style={{ fontSize: 11, color: '#475569', fontFamily: 'DM Mono', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              New Task
            </div>
            <input
              placeholder="Task title..."
              value={taskInput}
              onChange={e => setTaskInput(e.target.value)}
              style={{
                width: '100%', background: '#13131c', border: '1px solid #1e293b',
                borderRadius: 8, padding: '8px 12px', color: '#f1f5f9', fontSize: 13,
                outline: 'none', marginBottom: 8,
              }}
            />
            <textarea
              placeholder="Description (optional)..."
              value={taskDesc}
              onChange={e => setTaskDesc(e.target.value)}
              rows={3}
              style={{
                width: '100%', background: '#13131c', border: '1px solid #1e293b',
                borderRadius: 8, padding: '8px 12px', color: '#f1f5f9', fontSize: 13,
                outline: 'none', resize: 'none', fontFamily: 'inherit',
              }}
            />
            <button onClick={handleSubmitTask} disabled={submitting || !taskInput.trim()} style={{
              width: '100%', marginTop: 8, background: '#8b5cf6', color: 'white',
              border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: submitting || !taskInput.trim() ? 0.5 : 1, cursor: 'pointer',
            }}>
              <Send size={14} />
              {submitting ? 'Submitting...' : 'Run Task'}
            </button>
          </div>

          {/* Task list — click to select and view logs */}
          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            <div style={{ fontSize: 11, color: '#475569', fontFamily: 'DM Mono', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Tasks ({tasks.length})
            </div>
            {tasks.length === 0 ? (
              <div style={{ fontSize: 12, color: '#334155', textAlign: 'center', marginTop: 24 }}>No tasks yet</div>
            ) : tasks.map(task => {
              const isSelected = selectedTaskId === task.id;
              return (
                <div
                  key={task.id}
                  onClick={() => handleTaskSelect(task.id)}
                  style={{
                    background: isSelected ? '#8b5cf615' : '#13131c',
                    border: `1px solid ${isSelected ? '#8b5cf6' : '#1e293b'}`,
                    borderRadius: 8, padding: '10px 12px', marginBottom: 8,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => !isSelected && ((e.currentTarget as HTMLElement).style.borderColor = '#334155')}
                  onMouseLeave={e => !isSelected && ((e.currentTarget as HTMLElement).style.borderColor = '#1e293b')}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: isSelected ? '#c4b5fd' : '#e2e8f0', marginBottom: 4 }}>
                    {task.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <StatusBadge status={task.status} size="sm" />
                    <span style={{ fontSize: 10, color: '#475569' }}>
                      {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  {task.tokenUsage > 0 && (
                    <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>
                      {task.tokenUsage.toLocaleString()} tokens
                    </div>
                  )}
                  {isSelected && (
                    <div style={{ fontSize: 10, color: '#8b5cf6', marginTop: 4 }}>
                      → viewing logs
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Center: Activity feed */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Tabs */}
          <div style={{
            display: 'flex', gap: 0, borderBottom: '1px solid #1e293b',
            background: '#0c0c15', flexShrink: 0, alignItems: 'center',
          }}>
            {(['logs', 'tasks', 'files', 'screenshots'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: '12px 18px', border: 'none', background: 'none',
                color: activeTab === tab ? '#f1f5f9' : '#475569',
                borderBottom: activeTab === tab ? '2px solid #8b5cf6' : '2px solid transparent',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
              }}>
                {tab}
              </button>
            ))}
            {/* Selected task pill in header */}
            {activeTab === 'logs' && selectedTask && (
              <div style={{
                marginLeft: 'auto', marginRight: 16, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  fontSize: 11, color: '#8b5cf6', background: '#8b5cf615',
                  border: '1px solid #8b5cf630', borderRadius: 20, padding: '3px 10px',
                  fontFamily: 'DM Mono', maxWidth: 180, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {selectedTask.title}
                </span>
                <button
                  onClick={() => setSelectedTaskId(null)}
                  title="Clear selection"
                  style={{
                    background: 'none', border: 'none', color: '#475569',
                    cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Logs tab */}
          {activeTab === 'logs' && (
            <div style={{ flex: 1, overflow: 'auto', padding: 16, fontFamily: 'DM Mono', fontSize: 12 }}>
              {!selectedTaskId ? (
                <div style={{ textAlign: 'center', marginTop: 64, color: '#334155' }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>🗂</div>
                  <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>No task selected</div>
                  <div style={{ fontSize: 12, color: '#334155' }}>Click a task on the left to view its logs</div>
                </div>
              ) : visibleLogs.length === 0 ? (
                <div style={{ color: '#334155', textAlign: 'center', marginTop: 48 }}>
                  No logs yet for this task
                </div>
              ) : (
                <>
                  {visibleLogs.map((log, i) => (
                    <div key={log.id || i} style={{
                      display: 'flex', gap: 12, marginBottom: 6, lineHeight: 1.5,
                      color: log.level === 'error' ? '#f43f5e' : log.level === 'tool' ? '#f97316' : log.level === 'warn' ? '#f59e0b' : '#94a3b8',
                    }}>
                      <span style={{ color: '#334155', flexShrink: 0 }}>
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                      <span style={{
                        padding: '0 5px', borderRadius: 3, fontSize: 10, alignSelf: 'center', flexShrink: 0,
                        background: log.level === 'error' ? '#f43f5e20' : log.level === 'tool' ? '#f9731620' : '#1e293b',
                        color: log.level === 'error' ? '#f43f5e' : log.level === 'tool' ? '#f97316' : '#475569',
                      }}>
                        {log.level}
                      </span>
                      <span style={{ wordBreak: 'break-all' }}>{log.message}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </>
              )}
            </div>
          )}

          {/* Tasks tab */}
          {activeTab === 'tasks' && (
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              {tasks.length === 0 ? (
                <div style={{ color: '#334155', textAlign: 'center', marginTop: 48, fontSize: 13 }}>No tasks yet</div>
              ) : tasks.map(task => (
                <div key={task.id} style={{
                  background: '#13131c', border: '1px solid #1e293b', borderRadius: 10,
                  padding: 16, marginBottom: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9' }}>{task.title}</div>
                      <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{task.description}</div>
                    </div>
                    <StatusBadge status={task.status} size="sm" />
                  </div>
                  {task.result && (
                    <div style={{
                      background: '#0f172a', borderRadius: 6, padding: '10px 12px',
                      fontSize: 12, color: '#94a3b8', fontFamily: 'DM Mono',
                      maxHeight: 200, overflow: 'auto',
                    }}>
                      {task.result}
                    </div>
                  )}
                  <button
                    onClick={() => { setSelectedTaskId(task.id); setActiveTab('logs'); }}
                    style={{
                      marginTop: 10, background: 'none', border: '1px solid #1e293b',
                      color: '#64748b', borderRadius: 6, padding: '4px 10px',
                      fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono',
                    }}
                  >
                    View logs →
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Files tab */}
          {activeTab === 'files' && (
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              <div style={{ width: 220, borderRight: '1px solid #1e293b', overflow: 'auto', padding: 12 }}>
                <div style={{ fontSize: 11, color: '#475569', fontFamily: 'DM Mono', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Workspace
                </div>
                {fileTree.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#334155' }}>Empty</div>
                ) : <FileTree nodes={fileTree} onFileClick={handleFileClick} />}
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                {selectedFile ? (
                  <>
                    <div style={{ fontSize: 11, color: '#475569', fontFamily: 'DM Mono', marginBottom: 10 }}>{selectedFile.path}</div>
                    <pre style={{
                      background: '#0f172a', borderRadius: 8, padding: 16,
                      fontSize: 12, color: '#94a3b8', overflow: 'auto',
                      fontFamily: 'DM Mono', whiteSpace: 'pre-wrap',
                    }}>{selectedFile.content}</pre>
                  </>
                ) : (
                  <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 48 }}>
                    Select a file to view its contents
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Screenshots tab */}
          {activeTab === 'screenshots' && (
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              {screenshots.length === 0 ? (
                <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 48 }}>
                  No screenshots yet (Phase 3 feature — browser tools)
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                  {screenshots.map(url => (
                    <a key={url} href={url} target="_blank" rel="noopener">
                      <img src={url} alt="Screenshot" style={{ width: '100%', borderRadius: 8, border: '1px solid #1e293b' }} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FileTree({ nodes, onFileClick, prefix = '' }: { nodes: FileNode[]; onFileClick: (p: string) => void; prefix?: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  return (
    <>
      {nodes.map(node => {
        const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
        const isExpanded = expanded.has(fullPath);
        return (
          <div key={fullPath}>
            <div onClick={() => {
              if (node.type === 'dir') setExpanded(prev => { const s = new Set(prev); s.has(fullPath) ? s.delete(fullPath) : s.add(fullPath); return s; });
              else onFileClick(fullPath);
            }} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
              borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#94a3b8',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#1a1a2a'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              {node.type === 'dir'
                ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
                : <FileText size={12} />}
              {node.name}
            </div>
            {node.type === 'dir' && isExpanded && node.children && (
              <div style={{ paddingLeft: 14 }}>
                <FileTree nodes={node.children} onFileClick={onFileClick} prefix={fullPath} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function QuestionBanner({ question, onAnswer }: { question: HumanQuestion; onAnswer: () => void }) {
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!answer.trim()) return;
    setLoading(true);
    await api.answerQuestion(question.id, answer.trim());
    onAnswer();
  };

  return (
    <div style={{
      background: '#f9731615', border: '1px solid #f9731640',
      padding: '14px 24px', flexShrink: 0, display: 'flex', gap: 16, alignItems: 'flex-start',
    }}>
      <div style={{ fontSize: 18 }}>🤔</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#f97316', marginBottom: 4 }}>Bot needs your input</div>
        <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 10 }}>{question.question}</div>
        {question.context && (
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>{question.context}</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={answer} onChange={e => setAnswer(e.target.value)}
            placeholder="Your answer..."
            onKeyDown={e => e.key === 'Enter' && submit()}
            style={{
              flex: 1, background: '#0f0f13', border: '1px solid #f9731640',
              borderRadius: 6, padding: '8px 12px', color: '#f1f5f9', fontSize: 13, outline: 'none',
            }}
          />
          <button onClick={submit} disabled={loading || !answer.trim()} style={{
            background: '#f97316', color: 'white', border: 'none',
            padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            {loading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
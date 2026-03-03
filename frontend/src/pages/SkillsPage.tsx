import React, { useEffect, useState } from 'react';
import { api, Skill, SkillFile } from '../lib/api';
import { Zap, Trash2, Plus, X, Github, ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<Skill | null>(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  useEffect(() => { load(); }, []);

  async function load() {
    const data = await api.getSkills();
    setSkills(data);
  }

  async function handleSelect(skill: Skill) {
    const detail = await api.getSkill(skill.name);
    setSelected(detail);
  }

  async function handleDelete(name: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete skill "${name}"? This cannot be undone.`)) return;
    await api.deleteSkill(name);
    setSkills(prev => prev.filter(s => s.name !== name));
    if (selected?.name === name) setSelected(null);
  }

  const filtered = skills.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase()) ||
    (Array.isArray(s.tags) ? s.tags : []).some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const langColor: Record<string, string> = {
    python: '#3b82f6',
    javascript: '#f59e0b',
    shell: '#10b981',
    text: '#64748b',
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left panel */}
      <div style={{
        width: 320, borderRight: '1px solid #1e293b', display: 'flex',
        flexDirection: 'column', background: '#0c0c15', flexShrink: 0,
      }}>
        {/* Header */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={16} color="#8b5cf6" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Skills</span>
              <span style={{
                fontSize: 11, color: '#8b5cf6', background: '#8b5cf615',
                border: '1px solid #8b5cf630', borderRadius: 20, padding: '1px 8px', fontFamily: 'DM Mono',
              }}>
                {skills.length}
              </span>
            </div>
            <button
              onClick={() => setShowModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: '#8b5cf6', color: 'white', border: 'none',
                borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Plus size={13} /> Add Skill
            </button>
          </div>
          <input
            placeholder="Search skills..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', background: '#13131c', border: '1px solid #1e293b',
              borderRadius: 7, padding: '7px 12px', color: '#f1f5f9', fontSize: 12,
              outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Skill list */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: '#334155' }}>
              <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>⚡</div>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>
                {skills.length === 0 ? 'No skills installed' : 'No matching skills'}
              </div>
              <div style={{ fontSize: 12 }}>
                {skills.length === 0 ? 'Add a skill from GitHub or create one manually' : 'Try a different search term'}
              </div>
            </div>
          ) : filtered.map(skill => {
            const isSelected = selected?.name === skill.name;
            const tags = Array.isArray(skill.tags) ? skill.tags : [];
            const fileCount = skill._count?.files ?? (skill.files?.length ?? 0);
            return (
              <div
                key={skill.name}
                onClick={() => handleSelect(skill)}
                style={{
                  background: isSelected ? '#8b5cf615' : '#13131c',
                  border: `1px solid ${isSelected ? '#8b5cf6' : '#1e293b'}`,
                  borderRadius: 9, padding: '11px 13px', marginBottom: 8, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => !isSelected && ((e.currentTarget as HTMLElement).style.borderColor = '#334155')}
                onMouseLeave={e => !isSelected && ((e.currentTarget as HTMLElement).style.borderColor = '#1e293b')}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 13, fontWeight: 600, color: isSelected ? '#c4b5fd' : '#e2e8f0', marginBottom: 3 }}>
                      {skill.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, marginBottom: 6,
                      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                    }}>
                      {skill.description}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                      {tags.slice(0, 3).map(tag => (
                        <span key={tag} style={{
                          fontSize: 10, color: '#8b5cf6', background: '#8b5cf615',
                          border: '1px solid #8b5cf630', borderRadius: 4, padding: '1px 6px',
                        }}>
                          {tag}
                        </span>
                      ))}
                      {fileCount > 0 && (
                        <span style={{ fontSize: 10, color: '#475569', fontFamily: 'DM Mono', marginLeft: 2 }}>
                          {fileCount} file{fileCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={e => handleDelete(skill.name, e)}
                    style={{ background: 'none', border: 'none', color: '#334155', cursor: 'pointer', padding: 2, flexShrink: 0 }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#f43f5e'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#334155'}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel — skill detail */}
      <div style={{ flex: 1, overflow: 'auto', background: '#0d0d18' }}>
        {!selected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
            <Zap size={40} color="#1e293b" />
            <div style={{ fontSize: 14, color: '#334155' }}>Select a skill to view details</div>
            <div style={{ fontSize: 12, color: '#1e293b' }}>Skills provide context and code files for your agents</div>
          </div>
        ) : (
          <div style={{ padding: 28, maxWidth: 860 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginBottom: 5 }}>
                  {selected.name}
                </div>
                <div style={{ fontSize: 13, color: '#64748b', maxWidth: 560 }}>{selected.description}</div>
                {selected.repoUrl && (
                  <a
                    href={selected.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      marginTop: 8, fontSize: 12, color: '#8b5cf6', textDecoration: 'none',
                    }}
                  >
                    <Github size={12} /> {selected.repoUrl.replace('https://github.com/', '')}
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
              <button
                onClick={e => handleDelete(selected.name, e)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: '#f43f5e15', border: '1px solid #f43f5e30',
                  color: '#f43f5e', borderRadius: 7, padding: '7px 13px',
                  fontSize: 12, cursor: 'pointer', flexShrink: 0,
                }}
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>

            {/* Tags */}
            {selected.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
                {selected.tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: 11, color: '#8b5cf6', background: '#8b5cf615',
                    border: '1px solid #8b5cf630', borderRadius: 5, padding: '3px 9px',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Files */}
            {selected.files && selected.files.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'DM Mono', marginBottom: 10 }}>
                  Code Files ({selected.files.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selected.files.map((file: SkillFile) => {
                    const isExpanded = expandedFiles.has(file.id);
                    return (
                      <div key={file.id} style={{ background: '#13131c', border: '1px solid #1e293b', borderRadius: 8 }}>
                        <div
                          onClick={() => setExpandedFiles(prev => {
                            const s = new Set(prev);
                            s.has(file.id) ? s.delete(file.id) : s.add(file.id);
                            return s;
                          })}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 14px', cursor: 'pointer',
                          }}
                        >
                          {isExpanded ? <ChevronDown size={13} color="#475569" /> : <ChevronRight size={13} color="#475569" />}
                          <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#e2e8f0', flex: 1 }}>{file.filename}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 600,
                            color: langColor[file.language] || '#64748b',
                            background: `${langColor[file.language] || '#64748b'}15`,
                            border: `1px solid ${langColor[file.language] || '#64748b'}30`,
                            borderRadius: 4, padding: '1px 7px', fontFamily: 'DM Mono',
                          }}>
                            {file.language}
                          </span>
                        </div>
                        {isExpanded && (
                          <pre style={{
                            margin: 0, padding: '12px 16px',
                            borderTop: '1px solid #1e293b',
                            fontSize: 11, color: '#94a3b8',
                            fontFamily: 'DM Mono', lineHeight: 1.6,
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            maxHeight: 400, overflow: 'auto',
                          }}>
                            {file.content}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Context */}
            <div>
              <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'DM Mono', marginBottom: 10 }}>
                Context / Instructions
              </div>
              <pre style={{
                background: '#13131c', border: '1px solid #1e293b', borderRadius: 10,
                padding: '18px 20px', fontSize: 12, color: '#94a3b8',
                fontFamily: 'DM Mono', lineHeight: 1.7,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
                maxHeight: 600, overflow: 'auto',
              }}>
                {selected.context}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Add Skill Modal */}
      {showModal && (
        <AddSkillModal
          onClose={() => setShowModal(false)}
          onCreated={(skill) => {
            setSkills(prev => [...prev, skill].sort((a, b) => a.name.localeCompare(b.name)));
            setSelected(skill);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Add Skill Modal ──────────────────────────────────────────────────────────

function AddSkillModal({ onClose, onCreated }: { onClose: () => void; onCreated: (skill: Skill) => void }) {
  const [tab, setTab] = useState<'github' | 'manual'>('github');
  const [githubUrl, setGithubUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  // Manual form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [files, setFiles] = useState<Array<{ filename: string; language: string; content: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function handleGitHubImport() {
    if (!githubUrl.trim()) return;
    setImporting(true);
    setImportError('');
    try {
      const skill = await api.importSkillFromGitHub(githubUrl.trim());
      onCreated(skill);
    } catch (err: any) {
      setImportError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  async function handleManualCreate() {
    if (!name.trim() || !description.trim() || !context.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      const skill = await api.createSkill({ name: name.trim(), description: description.trim(), context: context.trim(), tags, files });
      onCreated(skill);
    } catch (err: any) {
      setSaveError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function addFile() {
    setFiles(prev => [...prev, { filename: '', language: 'python', content: '' }]);
  }

  function updateFile(idx: number, field: string, value: string) {
    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#0c0c15', border: '1px solid #1e293b',
    borderRadius: 7, padding: '9px 12px', color: '#f1f5f9', fontSize: 13,
    outline: 'none', fontFamily: 'inherit',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: '#475569', textTransform: 'uppercase' as const,
    letterSpacing: 0.8, fontFamily: 'DM Mono', marginBottom: 6, display: 'block',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#13131c', border: '1px solid #1e293b', borderRadius: 14,
        width: 580, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
      }}>
        {/* Modal header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={16} color="#8b5cf6" /> Add Skill
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', padding: '0 22px' }}>
          {(['github', 'manual'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none', padding: '11px 16px',
              color: tab === t ? '#f1f5f9' : '#475569',
              borderBottom: tab === t ? '2px solid #8b5cf6' : '2px solid transparent',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
            }}>
              {t === 'github' ? <><Github size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />From GitHub</> : '+ Create Manually'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: '20px 22px', overflow: 'auto', flex: 1 }}>
          {tab === 'github' ? (
            <div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
                Import a skill from a public GitHub repository. The repo should contain a <code style={{ color: '#8b5cf6', background: '#8b5cf615', padding: '1px 5px', borderRadius: 3 }}>README.md</code> with instructions and optionally code files.
              </div>
              <label style={labelStyle}>GitHub Repository URL</label>
              <input
                value={githubUrl}
                onChange={e => setGithubUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGitHubImport()}
                placeholder="https://github.com/owner/repo"
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: '#334155', marginTop: 6 }}>
                Tip: add a <code style={{ color: '#64748b' }}>skill.json</code> to the repo root to set name, description, and tags
              </div>
              {importError && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#f43f5e15', border: '1px solid #f43f5e30', borderRadius: 7, fontSize: 12, color: '#f43f5e' }}>
                  {importError}
                </div>
              )}
              <button
                onClick={handleGitHubImport}
                disabled={importing || !githubUrl.trim()}
                style={{
                  marginTop: 16, width: '100%', background: importing ? '#1e293b' : '#8b5cf6',
                  color: importing ? '#475569' : 'white', border: 'none',
                  borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: !githubUrl.trim() ? 0.5 : 1,
                }}
              >
                {importing ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Importing...</> : <><Github size={14} /> Import from GitHub</>}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Skill Name (slug)</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. stripe-api, web-scraping" style={inputStyle} />
                <div style={{ fontSize: 11, color: '#334155', marginTop: 4 }}>Lowercase with hyphens. Will be normalized automatically.</div>
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this skill provides..." style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Tags (comma-separated)</label>
                <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="api, http, automation" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Context / Instructions</label>
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder="Instructions, examples, and guidance for the agent..."
                  rows={6}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>
              {/* File entries */}
              {files.length > 0 && (
                <div>
                  <label style={labelStyle}>Code Files</label>
                  {files.map((file, idx) => (
                    <div key={idx} style={{ background: '#0c0c15', border: '1px solid #1e293b', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input
                          value={file.filename}
                          onChange={e => updateFile(idx, 'filename', e.target.value)}
                          placeholder="filename.py"
                          style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: 12 }}
                        />
                        <select
                          value={file.language}
                          onChange={e => updateFile(idx, 'language', e.target.value)}
                          style={{ ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}
                        >
                          <option value="python">Python</option>
                          <option value="javascript">JavaScript</option>
                          <option value="shell">Shell</option>
                          <option value="text">Text</option>
                        </select>
                        <button onClick={() => removeFile(idx)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}>
                          <X size={14} />
                        </button>
                      </div>
                      <textarea
                        value={file.content}
                        onChange={e => updateFile(idx, 'content', e.target.value)}
                        placeholder="File content..."
                        rows={4}
                        style={{ ...inputStyle, resize: 'vertical', fontSize: 11, fontFamily: 'DM Mono', lineHeight: 1.5 }}
                      />
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={addFile}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: '1px dashed #334155',
                  color: '#475569', borderRadius: 7, padding: '8px 14px',
                  fontSize: 12, cursor: 'pointer', width: 'fit-content',
                }}
              >
                <Plus size={12} /> Add Code File
              </button>
              {saveError && (
                <div style={{ padding: '10px 14px', background: '#f43f5e15', border: '1px solid #f43f5e30', borderRadius: 7, fontSize: 12, color: '#f43f5e' }}>
                  {saveError}
                </div>
              )}
              <button
                onClick={handleManualCreate}
                disabled={saving || !name.trim() || !description.trim() || !context.trim()}
                style={{
                  background: '#8b5cf6', color: 'white', border: 'none',
                  borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: (!name.trim() || !description.trim() || !context.trim()) ? 0.5 : 1,
                }}
              >
                {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : <><Plus size={14} /> Create Skill</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

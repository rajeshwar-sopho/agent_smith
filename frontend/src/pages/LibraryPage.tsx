import React, { useEffect, useState } from 'react';
import { BookOpen, Search, Trash2, Copy, Check, Code2, Tag } from 'lucide-react';
import { api, SharedProgram } from '../lib/api';

const LANG_COLOR: Record<string, string> = {
  python: '#3b82f6',
  javascript: '#f59e0b',
};

const LANG_ICON: Record<string, string> = {
  python: '🐍',
  javascript: '⚡',
};

export default function LibraryPage() {
  const [programs, setPrograms] = useState<SharedProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [selected, setSelected] = useState<SharedProgram | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getLibrary({ q: search || undefined, language: langFilter || undefined });
      setPrograms(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search, langFilter]);

  const handleSelect = async (prog: SharedProgram) => {
    if (selected?.name === prog.name) { setSelected(null); return; }
    const full = await api.getLibraryProgram(prog.name);
    setSelected(full);
  };

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete "${name}" from the library?`)) return;
    setDeletingName(name);
    try {
      await api.deleteLibraryProgram(name);
      if (selected?.name === name) setSelected(null);
      await load();
    } finally {
      setDeletingName(null);
    }
  };

  const allTags = Array.from(new Set(programs.flatMap(p => p.tags))).slice(0, 20);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left panel — list */}
      <div style={{
        width: 340, borderRight: '1px solid #1e293b', display: 'flex',
        flexDirection: 'column', background: '#0c0c15', flexShrink: 0,
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <BookOpen size={18} color="#8b5cf6" />
            <h1 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Shared Library</h1>
            <span style={{
              marginLeft: 'auto', fontSize: 11, color: '#475569',
              background: '#1e293b', padding: '2px 8px', borderRadius: 10,
            }}>
              {programs.length} programs
            </span>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search programs..."
              style={{
                width: '100%', background: '#13131c', border: '1px solid #1e293b',
                borderRadius: 8, padding: '8px 12px 8px 30px', color: '#f1f5f9',
                fontSize: 13, outline: 'none',
              }}
            />
          </div>

          {/* Language filter */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {['', 'python', 'javascript'].map(lang => (
              <button key={lang} onClick={() => setLangFilter(lang)} style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid',
                borderColor: langFilter === lang ? '#8b5cf6' : '#1e293b',
                background: langFilter === lang ? '#8b5cf615' : 'transparent',
                color: langFilter === lang ? '#8b5cf6' : '#475569',
                fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono',
              }}>
                {lang || 'all'}{lang && ` ${LANG_ICON[lang]}`}
              </button>
            ))}
          </div>
        </div>

        {/* Program list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 12px' }}>
          {loading ? (
            <div style={{ color: '#475569', textAlign: 'center', padding: 32, fontSize: 13 }}>Loading...</div>
          ) : programs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#334155' }}>
              <Code2 size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div style={{ fontSize: 13, color: '#475569' }}>No programs yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Agents will save reusable code here automatically</div>
            </div>
          ) : programs.map(prog => {
            const isSelected = selected?.name === prog.name;
            return (
              <div
                key={prog.name}
                onClick={() => handleSelect(prog)}
                style={{
                  background: isSelected ? '#8b5cf615' : '#13131c',
                  border: `1px solid ${isSelected ? '#8b5cf6' : '#1e293b'}`,
                  borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => !isSelected && ((e.currentTarget as HTMLElement).style.borderColor = '#334155')}
                onMouseLeave={e => !isSelected && ((e.currentTarget as HTMLElement).style.borderColor = '#1e293b')}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{LANG_ICON[prog.language] || '📄'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: isSelected ? '#c4b5fd' : '#e2e8f0',
                      fontFamily: 'DM Mono',
                    }}>
                      {prog.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>
                      {prog.description}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(prog.name); }}
                    disabled={deletingName === prog.name}
                    style={{
                      background: 'none', border: 'none', color: '#334155',
                      cursor: 'pointer', padding: 2, flexShrink: 0,
                      opacity: deletingName === prog.name ? 0.5 : 1,
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 10, fontFamily: 'DM Mono', padding: '1px 6px',
                    borderRadius: 4, background: (LANG_COLOR[prog.language] || '#64748b') + '20',
                    color: LANG_COLOR[prog.language] || '#64748b',
                  }}>
                    {prog.language}
                  </span>
                  {prog.tags.slice(0, 3).map(tag => (
                    <span key={tag} style={{
                      fontSize: 10, color: '#475569', background: '#1e293b',
                      padding: '1px 6px', borderRadius: 4,
                    }}>
                      {tag}
                    </span>
                  ))}
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#334155' }}>
                    used {prog.usageCount}×
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel — code viewer */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155' }}>
            <div style={{ textAlign: 'center' }}>
              <BookOpen size={48} style={{ margin: '0 auto 16px', opacity: 0.15 }} />
              <div style={{ fontSize: 14, color: '#475569' }}>Select a program to view its code</div>
              {allTags.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 11, color: '#334155', marginBottom: 8, fontFamily: 'DM Mono', textTransform: 'uppercase', letterSpacing: 1 }}>Tags in library</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 400 }}>
                    {allTags.map(tag => (
                      <button key={tag} onClick={() => setSearch(tag)} style={{
                        background: '#1e293b', border: '1px solid #334155', color: '#64748b',
                        padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <Tag size={9} /> {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Code header */}
            <div style={{
              padding: '16px 24px', borderBottom: '1px solid #1e293b',
              background: '#0c0c15', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
            }}>
              <span style={{ fontSize: 20 }}>{LANG_ICON[selected.language] || '📄'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', fontFamily: 'DM Mono' }}>
                  {selected.name}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {selected.description}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 11, color: '#475569', textAlign: 'right' }}>
                  <div>used {selected.usageCount}×</div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#334155' }}>
                    {selected.filename}
                  </div>
                </div>
                {selected.code && (
                  <button
                    onClick={() => handleCopy(selected.code!, selected.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: copiedId === selected.id ? '#10b98120' : '#1e293b',
                      border: '1px solid', borderColor: copiedId === selected.id ? '#10b981' : '#334155',
                      color: copiedId === selected.id ? '#10b981' : '#94a3b8',
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    {copiedId === selected.id ? <Check size={13} /> : <Copy size={13} />}
                    {copiedId === selected.id ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>
            </div>

            {/* Tags row */}
            {selected.tags.length > 0 && (
              <div style={{
                padding: '8px 24px', borderBottom: '1px solid #0f172a',
                display: 'flex', gap: 6, flexWrap: 'wrap', background: '#0c0c15', flexShrink: 0,
              }}>
                {selected.tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: 11, color: '#475569', background: '#1e293b',
                    padding: '2px 8px', borderRadius: 10,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <Tag size={9} /> {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Code */}
            <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
              {selected.code ? (
                <pre style={{
                  background: '#0f172a', borderRadius: 10, padding: 20,
                  fontSize: 12, color: '#94a3b8', fontFamily: 'DM Mono',
                  lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  border: '1px solid #1e293b',
                }}>
                  {selected.code}
                </pre>
              ) : (
                <div style={{ color: '#334155', textAlign: 'center', marginTop: 48 }}>
                  Code file not found on disk
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useState, useCallback } from 'react';
import { Sparkles, Plus, Trash2, Star, Bot, Save, Edit2, X } from 'lucide-react';
import { api, Soul } from '../lib/api';

const DEFAULT_SOUL_TEMPLATE = `# Soul: [Name]

## Identity
Describe who this agent is and what it stands for.

## Core Values
- **Value 1.** Explanation.
- **Value 2.** Explanation.
- **Value 3.** Explanation.

## Behavioural Traits
- Trait and what it means in practice.
- Trait and what it means in practice.

## Decision Framework
When facing hard choices, ask: *"[Guiding question]?"*

## Growth
Update this soul only when a task creates a drastic, irreversible shift in purpose or operating environment.
`;

export default function SoulsPage() {
  const [souls, setSouls] = useState<Soul[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Soul | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editDefault, setEditDefault] = useState(false);

  const load = useCallback(async (keepSelected?: string) => {
    setLoading(true);
    try {
      const data = await api.getSouls();
      setSouls(data);
      if (keepSelected) {
        const fresh = data.find(s => s.id === keepSelected);
        if (fresh) setSelected(fresh);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const startCreate = () => {
    setCreating(true); setEditing(false); setSelected(null);
    setEditName(''); setEditDesc(''); setEditContent(DEFAULT_SOUL_TEMPLATE); setEditDefault(false);
  };

  const startEdit = (soul: Soul) => {
    setEditing(true); setCreating(false);
    setEditName(soul.name); setEditDesc(soul.description);
    setEditContent(soul.content); setEditDefault(soul.isDefault);
  };

  const cancelEdit = () => { setEditing(false); setCreating(false); };

  const handleSave = async () => {
    if (!editName.trim() || !editDesc.trim() || !editContent.trim()) return;
    setSaving(true);
    try {
      if (creating) {
        const soul = await api.createSoul({ name: editName.trim(), description: editDesc.trim(), content: editContent, isDefault: editDefault });
        setCreating(false);
        await load(soul.id);
      } else if (editing && selected) {
        await api.updateSoul(selected.id, { name: editName.trim(), description: editDesc.trim(), content: editContent, isDefault: editDefault });
        setEditing(false);
        await load(selected.id);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (soul: Soul) => {
    await api.updateSoul(soul.id, { isDefault: true });
    await load(soul.id);
  };

  const handleDelete = async (soul: Soul) => {
    if (!confirm(`Delete soul "${soul.name}"? This cannot be undone.`)) return;
    setDeleting(soul.id);
    try {
      await api.deleteSoul(soul.id);
      if (selected?.id === soul.id) { setSelected(null); setEditing(false); }
      await load();
    } catch (e: any) {
      alert(e.message || 'Could not delete soul');
    } finally {
      setDeleting(null);
    }
  };

  const isEditorOpen = editing || creating;
  const canSave = editName.trim() && editDesc.trim() && editContent.trim();

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Left panel */}
      <div style={{ width: 300, borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', background: '#0c0c15', flexShrink: 0 }}>
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Sparkles size={18} color="#8b5cf6" />
            <h1 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Souls</h1>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569', background: '#1e293b', padding: '2px 8px', borderRadius: 10 }}>
              {souls.length}
            </span>
          </div>
          <button onClick={startCreate} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, background: '#8b5cf620', border: '1px dashed #8b5cf650',
            borderRadius: 10, padding: '10px', color: '#8b5cf6', fontSize: 13,
            cursor: 'pointer', marginBottom: 16,
          }}>
            <Plus size={14} /> New Soul
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 12px' }}>
          {loading ? (
            <div style={{ color: '#475569', textAlign: 'center', padding: 32, fontSize: 13 }}>Loading...</div>
          ) : souls.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#334155' }}>
              <Sparkles size={32} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
              <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>No souls yet. Create one to give your agents identity.</div>
            </div>
          ) : souls.map(soul => {
            const isSel = selected?.id === soul.id && !isEditorOpen;
            return (
              <div key={soul.id} onClick={() => { setSelected(soul); cancelEdit(); }}
                style={{
                  background: isSel ? '#8b5cf615' : '#13131c',
                  border: `1px solid ${isSel ? '#8b5cf6' : '#1e293b'}`,
                  borderRadius: 10, padding: '12px 14px', marginBottom: 8, cursor: 'pointer',
                }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      {soul.isDefault && <Star size={11} color="#f59e0b" fill="#f59e0b" />}
                      <span style={{ fontSize: 13, fontWeight: 600, color: isSel ? '#c4b5fd' : '#e2e8f0' }}>{soul.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{soul.description}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); handleDelete(soul); }}
                    disabled={deleting === soul.id}
                    style={{ background: 'none', border: 'none', color: '#334155', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  {soul.isDefault ? (
                    <span style={{ fontSize: 10, color: '#f59e0b', background: '#f59e0b15', padding: '1px 7px', borderRadius: 4, fontFamily: 'DM Mono' }}>default</span>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); handleSetDefault(soul); }}
                      style={{ fontSize: 10, color: '#475569', background: 'transparent', border: '1px solid #1e293b', padding: '1px 7px', borderRadius: 4, cursor: 'pointer', fontFamily: 'DM Mono' }}>
                      set default
                    </button>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#334155', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Bot size={9} /> {soul._count?.bots ?? 0} bot{(soul._count?.bots ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0c0c15' }}>
        {isEditorOpen ? (
          <>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <Sparkles size={16} color="#8b5cf6" />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{creating ? 'New Soul' : `Editing: ${selected?.name}`}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={cancelEdit} style={{ background: 'none', border: '1px solid #1e293b', color: '#64748b', padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <X size={13} /> Cancel
                </button>
                <button onClick={handleSave} disabled={!canSave || saving} style={{
                  background: canSave && !saving ? '#8b5cf6' : '#8b5cf640', border: 'none', color: 'white',
                  padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: canSave && !saving ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Save size={13} /> {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
              <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {(['Name', 'Description'] as const).map(label => (
                  <label key={label}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontFamily: 'DM Mono', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
                    <input
                      value={label === 'Name' ? editName : editDesc}
                      onChange={e => label === 'Name' ? setEditName(e.target.value) : setEditDesc(e.target.value)}
                      placeholder={label === 'Name' ? 'e.g. Pragmatic Engineer' : 'One-line summary shown when picking a soul'}
                      autoFocus={label === 'Name'}
                      style={{ width: '100%', background: '#13131c', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 14px', color: '#f1f5f9', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </label>
                ))}
                <label>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontFamily: 'DM Mono', textTransform: 'uppercase', letterSpacing: 1 }}>Soul Content (Markdown)</div>
                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 8, lineHeight: 1.5 }}>
                    Injected verbatim at the top of every system prompt. Write it in first person — as if the agent is reading their own identity document.
                  </div>
                  <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={22}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: '14px 16px', color: '#94a3b8', fontSize: 12, fontFamily: 'DM Mono', lineHeight: 1.7, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setEditDefault(v => !v)}>
                  <div style={{ width: 36, height: 20, borderRadius: 10, background: editDefault ? '#8b5cf6' : '#1e293b', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 3, left: editDefault ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>Set as default soul</div>
                    <div style={{ fontSize: 11, color: '#475569' }}>New bots automatically use this soul unless another is chosen</div>
                  </div>
                </label>
              </div>
            </div>
          </>
        ) : selected ? (
          <>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <Sparkles size={16} color="#8b5cf6" />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {selected.isDefault && <Star size={13} color="#f59e0b" fill="#f59e0b" />}
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{selected.name}</span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{selected.description}</div>
              </div>
              <span style={{ fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Bot size={12} /> {selected._count?.bots ?? 0} bot{(selected._count?.bots ?? 0) !== 1 ? 's' : ''}
              </span>
              {!selected.isDefault && (
                <button onClick={() => handleSetDefault(selected)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f59e0b15', border: '1px solid #f59e0b40', color: '#f59e0b', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
                  <Star size={13} /> Set Default
                </button>
              )}
              <button onClick={() => startEdit(selected)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
                <Edit2 size={13} /> Edit
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
              <pre style={{ background: '#0f172a', borderRadius: 10, padding: 24, fontSize: 13, color: '#94a3b8', fontFamily: 'DM Mono', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid #1e293b', maxWidth: 800 }}>
                {selected.content}
              </pre>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <Sparkles size={48} style={{ margin: '0 auto 16px', opacity: 0.12 }} />
              <div style={{ fontSize: 14, color: '#475569', marginBottom: 6 }}>Select a soul to view it</div>
              <div style={{ fontSize: 12, color: '#334155', maxWidth: 320, lineHeight: 1.6 }}>
                Souls define an agent's identity, values, and decision-making style. They are injected at the top of every task's system prompt.
              </div>
              <button onClick={startCreate} style={{ marginTop: 20, background: '#8b5cf620', border: '1px solid #8b5cf640', color: '#8b5cf6', padding: '8px 20px', borderRadius: 8, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={14} /> Create your first soul
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ModelInfo } from '../lib/api';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

const TIER_ICONS: Record<string, string> = { fast: '⚡', balanced: '⚖️', powerful: '🔥' };
const PROVIDER_COLOR: Record<string, string> = { claude: '#8b5cf6', gemini: '#0ea5e9' };

export default function CreateBotModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('claude-sonnet-4-6');
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.getModels().then(m => {
      setModels(m);
      const first = m.find(x => x.available);
      if (first) setSelectedModel(first.id);
    }).finally(() => setLoadingModels(false));
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const bot = await api.createBot({ name: name.trim(), model: selectedModel });
      onCreated();
      navigate(`/bots/${bot.id}`);
    } finally {
      setLoading(false);
    }
  };

  const claudeModels = models.filter(m => m.provider === 'claude');
  const geminiModels = models.filter(m => m.provider === 'gemini');
  const selectedInfo = models.find(m => m.id === selectedModel);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: '#00000090',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#13131c', border: '1px solid #1e293b', borderRadius: 16,
          padding: 32, width: 480, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, color: '#f1f5f9' }}>
          Create a Bot
        </h2>

        {/* Name */}
        <label style={{ display: 'block', marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Bot Name</div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Research Assistant"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            style={{
              width: '100%', background: '#0f0f13', border: '1px solid #1e293b',
              borderRadius: 8, padding: '10px 14px', color: '#f1f5f9', fontSize: 14, outline: 'none',
            }}
          />
        </label>

        {/* Model picker */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Model</div>

          {loadingModels ? (
            <div style={{ color: '#475569', fontSize: 13, padding: '12px 0' }}>
              Loading available models...
            </div>
          ) : (
            <>
              {[
                { label: '🧠 Anthropic Claude', color: '#8b5cf6', items: claudeModels },
                { label: '✨ Google Gemini',    color: '#0ea5e9', items: geminiModels },
              ].map(({ label, color, items }) => (
                <div key={label} style={{ marginBottom: 14 }}>
                  <div style={{
                    fontSize: 10, fontFamily: 'DM Mono', textTransform: 'uppercase',
                    letterSpacing: 1, color: '#475569', marginBottom: 6,
                  }}>
                    {label}
                    {items.length > 0 && !items[0].available && (
                      <span style={{ marginLeft: 8, color: '#f43f5e' }}>— API key missing</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map(m => {
                      const isSelected = selectedModel === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => m.available && setSelectedModel(m.id)}
                          disabled={!m.available}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 14px', borderRadius: 8, border: '1px solid',
                            borderColor: isSelected ? color : '#1e293b',
                            background: isSelected ? color + '18' : '#0f0f13',
                            cursor: m.available ? 'pointer' : 'not-allowed',
                            opacity: m.available ? 1 : 0.4,
                            textAlign: 'left', width: '100%', transition: 'all 0.15s',
                          }}
                        >
                          <span style={{ fontSize: 16 }}>{TIER_ICONS[m.tier]}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? color : '#e2e8f0' }}>
                                {m.name}
                              </span>
                              <span style={{
                                fontSize: 10, fontFamily: 'DM Mono', color: '#475569',
                                background: '#1e293b', padding: '1px 6px', borderRadius: 4,
                              }}>
                                {m.id}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                              {m.description}
                            </div>
                          </div>
                          {isSelected && (
                            <span style={{ color, fontSize: 16, flexShrink: 0 }}>✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}

          {selectedInfo && (
            <div style={{
              marginTop: 10, background: '#0f172a', borderRadius: 8, padding: '8px 12px',
              fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>Selected:</span>
              <span style={{
                color: PROVIDER_COLOR[selectedInfo.provider] || '#94a3b8',
                fontWeight: 600, fontFamily: 'DM Mono',
              }}>
                {selectedInfo.id}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid #1e293b', color: '#64748b',
            padding: '10px 20px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading || !selectedModel}
            style={{
              background: '#8b5cf6', color: 'white', border: 'none',
              padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              opacity: !name.trim() || loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Creating...' : 'Create Bot'}
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import { api, Bot as BotType } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import CreateBotModal from '../components/CreateBotModal';
import { useWebSocket } from '../hooks/useWebSocket';

export default function BotsPage() {
  const [bots, setBots] = useState<BotType[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadBots = async () => {
    try { setBots(await api.getBots()); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadBots(); }, []);

  useWebSocket((msg) => {
    if (['bot:created', 'bot:deleted', 'bot:updated', 'bot:status'].includes(msg.type)) loadBots();
  });

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm('Delete this bot and all its data?')) return;
    await api.deleteBot(id);
  };

  const handleRestart = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    await api.restartBot(id);
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>Bots</h1>
          <p style={{ color: '#64748b', marginTop: 4, fontSize: 14 }}>{bots.length} bots total</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#8b5cf6', color: 'white', padding: '10px 18px',
            borderRadius: 10, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer',
          }}
        >
          <Plus size={16} /> New Bot
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#475569', textAlign: 'center', padding: 48 }}>Loading...</div>
      ) : (
        <div style={{ background: '#13131c', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
          {bots.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#475569' }}>
              No bots yet.{' '}
              <button
                onClick={() => setShowCreate(true)}
                style={{ color: '#8b5cf6', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Create one!
              </button>
            </div>
          ) : bots.map((bot, i) => (
            <div
              key={bot.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px',
                borderBottom: i < bots.length - 1 ? '1px solid #0f172a' : 'none',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#1a1a2a'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: bot.model.startsWith('gemini') ? '#0ea5e920' : '#8b5cf620',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
              }}>
                {bot.model.startsWith('gemini') ? '✨' : '🧠'}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9' }}>{bot.name}</div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 2, fontFamily: 'DM Mono' }}>
                  {bot.model} · {bot._count?.tasks || 0} tasks · {bot.containerId ? 'containerized' : 'no container'}
                </div>
              </div>

              <StatusBadge status={bot.status} />

              <div style={{ display: 'flex', gap: 8 }}>
                <Link
                  to={`/bots/${bot.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: '#1e293b', color: '#94a3b8', padding: '6px 12px',
                    borderRadius: 8, fontSize: 12, fontWeight: 500, textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={13} /> Open
                </Link>
                <button
                  onClick={(e) => handleRestart(bot.id, e)}
                  title="Restart"
                  style={{
                    background: '#1e293b', color: '#94a3b8', border: 'none',
                    padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={(e) => handleDelete(bot.id, e)}
                  title="Delete"
                  style={{
                    background: '#f43f5e15', color: '#f43f5e', border: 'none',
                    padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', cursor: 'pointer',
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateBotModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadBots(); }}
        />
      )}
    </div>
  );
}

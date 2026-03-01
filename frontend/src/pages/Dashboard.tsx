import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, Zap, Clock, AlertCircle, Plus } from 'lucide-react';
import { api, Bot as BotType } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import CreateBotModal from '../components/CreateBotModal';
import { useWebSocket } from '../hooks/useWebSocket';

export default function Dashboard() {
  const [bots, setBots] = useState<BotType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadBots = async () => {
    try {
      const data = await api.getBots();
      setBots(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBots(); }, []);

  useWebSocket((msg) => {
    if (['bot:created', 'bot:deleted', 'bot:updated', 'bot:status'].includes(msg.type)) {
      loadBots();
    }
  });

  const stats = {
    total: bots.length,
    active: bots.filter(b => ['executing', 'planning', 'researching'].includes(b.status)).length,
    waiting: bots.filter(b => b.status === 'waiting_for_human').length,
    failed: bots.filter(b => b.status === 'failed').length,
  };

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>Mission Control</h1>
          <p style={{ color: '#64748b', marginTop: 4, fontSize: 14 }}>All bots at a glance</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
            color: 'white', padding: '10px 18px', borderRadius: 10,
            fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer',
          }}
        >
          <Plus size={16} />
          New Bot
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <StatCard label="Total Bots"    value={stats.total}   icon={<Bot size={20} />}         color="#8b5cf6" />
        <StatCard label="Active"        value={stats.active}  icon={<Zap size={20} />}         color="#10b981" />
        <StatCard label="Awaiting Input" value={stats.waiting} icon={<Clock size={20} />}      color="#f97316" />
        <StatCard label="Failed"        value={stats.failed}  icon={<AlertCircle size={20} />} color="#f43f5e" />
      </div>

      {/* Bot Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#475569', padding: 48 }}>Loading bots...</div>
      ) : bots.length === 0 ? (
        <EmptyState onCreateClick={() => setShowCreate(true)} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {bots.map(bot => <BotCard key={bot.id} bot={bot} />)}
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

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div style={{
      background: '#13131c',
      border: `1px solid ${color}30`,
      borderRadius: 12,
      padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: '#475569', fontSize: 13 }}>{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function BotCard({ bot }: { bot: BotType }) {
  return (
    <Link to={`/bots/${bot.id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: '#13131c', border: '1px solid #1e293b',
          borderRadius: 12, padding: 20, cursor: 'pointer',
          transition: 'border-color 0.2s, transform 0.1s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.borderColor = '#334155';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.borderColor = '#1e293b';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: bot.model.startsWith('gemini') ? '#0ea5e920' : '#8b5cf620',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>
              {bot.model.startsWith('gemini') ? '✨' : '🧠'}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9' }}>{bot.name}</div>
              <div style={{ fontSize: 11, color: '#475569', fontFamily: 'DM Mono' }}>
                {bot.model}
              </div>
            </div>
          </div>
          <StatusBadge status={bot.status} size="sm" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569' }}>
          <span>{bot._count?.tasks || 0} tasks</span>
          {bot.status === 'waiting_for_human' && (
            <span style={{ color: '#f97316', fontWeight: 600 }}>⚠ Needs your input</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: 80, color: '#475569' }}>
      <Bot size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#64748b' }}>No bots yet</div>
      <div style={{ marginBottom: 24 }}>Create your first bot to get started</div>
      <button
        onClick={onCreateClick}
        style={{
          background: '#8b5cf6', color: 'white', padding: '10px 24px',
          borderRadius: 8, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer',
        }}
      >
        Create a Bot
      </button>
    </div>
  );
}

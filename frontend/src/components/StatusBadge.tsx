import React from 'react';

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  idle:               { label: 'Idle',        color: '#475569', dot: '#475569' },
  planning:           { label: 'Planning',    color: '#f59e0b', dot: '#f59e0b' },
  researching:        { label: 'Researching', color: '#0ea5e9', dot: '#0ea5e9' },
  executing:          { label: 'Executing',   color: '#8b5cf6', dot: '#8b5cf6' },
  waiting_for_human:  { label: 'Waiting',     color: '#f97316', dot: '#f97316' },
  done:               { label: 'Done',        color: '#10b981', dot: '#10b981' },
  failed:             { label: 'Failed',      color: '#f43f5e', dot: '#f43f5e' },
  pending:            { label: 'Pending',     color: '#64748b', dot: '#64748b' },
  cancelled:          { label: 'Cancelled',   color: '#94a3b8', dot: '#94a3b8' },
};

const PULSE_STATUSES = new Set(['planning', 'executing', 'researching']);

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: '#64748b', dot: '#64748b' };
  const pulse = PULSE_STATUSES.has(status);

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: cfg.color + '20',
      color: cfg.color,
      padding: size === 'sm' ? '2px 8px' : '4px 10px',
      borderRadius: 20,
      fontSize: size === 'sm' ? 10 : 12,
      fontWeight: 600,
      fontFamily: 'DM Mono, monospace',
      border: `1px solid ${cfg.color}40`,
    }}>
      <span style={{
        width: 6, height: 6,
        borderRadius: '50%',
        background: cfg.dot,
        animation: pulse ? 'pulse 1.5s infinite' : 'none',
        flexShrink: 0,
      }} />
      {cfg.label}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </span>
  );
}

import React, { useState } from 'react';
import { Key, Save } from 'lucide-react';

export default function Settings() {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: 32, maxWidth: 600 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#f1f5f9' }}>Settings</h1>
      <p style={{ color: '#64748b', marginBottom: 32, fontSize: 14 }}>
        Configure API keys and preferences. Keys are stored in your .env file on the server.
      </p>

      <div style={{ background: '#13131c', border: '1px solid #1e293b', borderRadius: 12, padding: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Key size={16} /> API Keys
        </h2>

        <label style={{ display: 'block', marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Anthropic API Key (Claude)</div>
          <input type="password" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-..."
            style={{
              width: '100%', background: '#0f0f13', border: '1px solid #1e293b',
              borderRadius: 8, padding: '10px 14px', color: '#f1f5f9', fontSize: 13, outline: 'none',
            }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Google Gemini API Key</div>
          <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)}
            placeholder="AIza..."
            style={{
              width: '100%', background: '#0f0f13', border: '1px solid #1e293b',
              borderRadius: 8, padding: '10px 14px', color: '#f1f5f9', fontSize: 13, outline: 'none',
            }}
          />
        </label>

        <div style={{ background: '#f97316' + '15', border: '1px solid #f9731640', borderRadius: 8, padding: 14, marginBottom: 20, fontSize: 12, color: '#94a3b8' }}>
          ⚠️ Keys entered here are for reference. Set them in your <code style={{ fontFamily: 'DM Mono', color: '#f97316' }}>.env</code> file on the server for actual use.
        </div>

        <button onClick={handleSave} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: saved ? '#10b981' : '#8b5cf6', color: 'white',
          border: 'none', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        }}>
          <Save size={14} />
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      <div style={{ background: '#13131c', border: '1px solid #1e293b', borderRadius: 12, padding: 24, marginTop: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 16 }}>Stack Info</h2>
        {[
          ['Frontend', 'React + Vite, port 3000'],
          ['Backend', 'Node.js + Express + WebSocket, port 4000'],
          ['Database', 'SQLite via Prisma'],
          ['Bot Isolation', 'Docker container per bot'],
          ['Browser', 'Playwright (Phase 3)'],
          ['LLMs', 'Claude (Anthropic) + Gemini (Google)'],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #0f172a', fontSize: 13 }}>
            <span style={{ color: '#64748b' }}>{label}</span>
            <span style={{ color: '#94a3b8', fontFamily: 'DM Mono', fontSize: 12 }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

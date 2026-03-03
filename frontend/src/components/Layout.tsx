import React from 'react';
import { NavLink } from 'react-router-dom';
import { Bot, LayoutDashboard, Settings, BookOpen, Sparkles } from 'lucide-react';

interface SidebarProps {
  children: React.ReactNode;
}

export default function Layout({ children }: SidebarProps) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <nav style={{
        width: 220,
        background: '#0c0c15',
        borderRight: '1px solid #1e293b',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 12px',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '0 8px 28px', borderBottom: '1px solid #1e293b', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #8b5cf6, #f97316)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={18} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>BotOrchestrator</div>
              <div style={{ fontSize: 10, color: '#475569', fontFamily: 'DM Mono' }}>v1.0</div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <div style={{ flex: 1 }}>
          <NavItem to="/"        icon={<LayoutDashboard size={16} />} label="Dashboard" />
          <NavItem to="/bots"    icon={<Bot size={16} />}             label="Bots" />
          <NavItem to="/library" icon={<BookOpen size={16} />}        label="Library" />
          <NavItem to="/souls"   icon={<Sparkles size={16} />}        label="Souls" />
        </div>

        {/* Bottom */}
        <div style={{ borderTop: '1px solid #1e293b', paddingTop: 12 }}>
          <NavItem to="/settings" icon={<Settings size={16} />} label="Settings" />
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink to={to} end style={({ isActive }) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '9px 12px',
      borderRadius: 8,
      marginBottom: 2,
      fontSize: 13,
      fontWeight: 500,
      color: isActive ? '#f1f5f9' : '#64748b',
      background: isActive ? '#1e293b' : 'transparent',
      textDecoration: 'none',
      transition: 'all 0.15s',
    })}>
      {icon}
      {label}
    </NavLink>
  );
}

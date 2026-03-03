import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import BotsPage from './pages/BotsPage';
import BotDetail from './pages/BotDetail';
import LibraryPage from './pages/LibraryPage';
import SoulsPage from './pages/SoulsPage';
import SkillsPage from './pages/SkillsPage';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/bots" element={<BotsPage />} />
        <Route path="/bots/:id" element={<BotDetail />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/souls" element={<SoulsPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}

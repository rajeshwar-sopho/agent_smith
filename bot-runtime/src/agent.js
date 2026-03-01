/**
 * Bot Agent Runtime
 * Runs inside the bot's Docker container.
 * Connects to the backend via WebSocket and receives tasks.
 * This is the 'agent loop' described in Phase 2 of the roadmap.
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const BOT_ID = process.env.BOT_ID;
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:4000';
const WORKSPACE = '/workspace';
const WS_URL = BACKEND_URL.replace('http', 'ws').replace('https', 'wss') + '/ws';

if (!BOT_ID) {
  console.error('BOT_ID env var required');
  process.exit(1);
}

console.log(`[Bot ${BOT_ID}] Starting agent runtime...`);
console.log(`[Bot ${BOT_ID}] Backend: ${BACKEND_URL}`);

function log(message, level = 'info') {
  const entry = { botId: BOT_ID, level, message, ts: new Date().toISOString() };
  console.log(`[${level.toUpperCase()}] ${message}`);
  // Also send to backend via REST
  fetch(`${BACKEND_URL}/api/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {});
}

// ─── Tool implementations (run inside container) ──────────────────────────────

const tools = {
  read_file: ({ path: filePath }) => {
    const full = path.resolve(WORKSPACE, filePath);
    if (!full.startsWith(WORKSPACE)) return { error: 'Path traversal denied' };
    if (!fs.existsSync(full)) return { error: 'File not found' };
    return { content: fs.readFileSync(full, 'utf-8') };
  },

  write_file: ({ path: filePath, content }) => {
    const full = path.resolve(WORKSPACE, filePath);
    if (!full.startsWith(WORKSPACE)) return { error: 'Path traversal denied' };
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
    log(`Wrote file: ${filePath}`, 'tool');
    return { success: true };
  },

  list_dir: ({ path: dirPath = '' }) => {
    const full = path.resolve(WORKSPACE, dirPath);
    if (!full.startsWith(WORKSPACE)) return { error: 'Path traversal denied' };
    if (!fs.existsSync(full)) return { items: [] };
    const items = fs.readdirSync(full, { withFileTypes: true }).map(d => ({
      name: d.name,
      type: d.isDirectory() ? 'dir' : 'file',
    }));
    return { items };
  },

  execute_code: ({ code, language = 'python', filename }) => {
    return new Promise((resolve) => {
      const fname = filename || `run_${Date.now()}.${language === 'python' ? 'py' : 'js'}`;
      const full = path.join(WORKSPACE, fname);
      fs.writeFileSync(full, code);
      log(`Executing ${fname}...`, 'tool');
      const cmd = language === 'python' ? `python3 "${full}"` : `node "${full}"`;
      exec(cmd, { timeout: 30000, cwd: WORKSPACE }, (err, stdout, stderr) => {
        resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: err ? err.code || 1 : 0 });
      });
    });
  },
};

// ─── WebSocket connection ─────────────────────────────────────────────────────

function connect() {
  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    log('Connected to backend', 'info');
    // Subscribe to our bot's events
    ws.send(JSON.stringify({ type: 'subscribe', botId: BOT_ID }));
  });

  ws.on('message', async (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'task:run' && msg.payload?.taskId) {
      log(`Received task: ${msg.payload.title}`, 'info');
      // Tools are handled server-side in agent.ts for now
      // This runtime is for future extension where bot runs its own agent loop
    }
  });

  ws.on('close', () => {
    log('Disconnected from backend, reconnecting in 5s...', 'warn');
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`, 'error');
  });
}

// Start with a delay to let backend come up
setTimeout(connect, 3000);

// Keep alive
setInterval(() => {
  log('🤖 Bot runtime heartbeat', 'info');
}, 60000);

log('Bot agent runtime initialized', 'info');

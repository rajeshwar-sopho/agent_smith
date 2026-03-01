# 🤖 BotOrchestrator

A self-hosted AI agent orchestration platform. Create, manage, and watch autonomous bots powered by Claude or Gemini tackle tasks in isolated Docker containers — with a real-time dashboard and human-in-the-loop controls.

## Architecture

```
bot-orchestrator/
├── backend/           # Node.js + Express + WebSocket + Prisma (SQLite)
├── frontend/          # React + Vite dashboard
├── bot-runtime/       # Agent process running inside each bot container
├── k8s/               # Kubernetes manifests
├── scripts/           # Setup and deployment scripts
└── docker-compose.yml # Local development
```

### Stack
| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + React Router |
| Backend | Node.js + Express + WebSocket (ws) |
| Database | SQLite via Prisma |
| Bot Isolation | Docker container per bot |
| Browser (Phase 3) | Playwright headless Chromium |
| LLMs | Claude (Anthropic) + Gemini (Google) |
| Deployment | Docker Compose / Kubernetes |

### Bot Lifecycle States
```
idle → planning → researching → executing → waiting_for_human → done / failed
```

---

## 🚀 Quick Start (Local)

### Prerequisites
- Docker 24+
- Node.js 20+

### 1. Clone and configure
```bash
git clone <your-repo>
cd bot-orchestrator
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY and/or GEMINI_API_KEY
```

### 2. One-command setup
```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

Or manually:
```bash
# Build bot runtime image
docker build -t bot-orchestrator-runtime:latest ./bot-runtime

# Start everything
docker-compose up --build
```

### 3. Open the dashboard
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **Health check**: http://localhost:4000/health

---

## 🛠️ Development (without Docker)

```bash
# Install all dependencies
npm install

# Backend: set up database
cd backend
cp ../.env.example .env
npx prisma db push
npx prisma generate

# Run both in dev mode
cd ..
npm run dev
```

---

## 📦 Creating Your First Bot

1. Open http://localhost:3000
2. Click **New Bot**
3. Enter a name (e.g. "Research Assistant") and pick Claude or Gemini
4. A Docker container starts automatically
5. Open the bot → type a task → click **Run Task**
6. Watch the live activity feed as the bot works
7. If the bot needs input, a banner appears — answer and it resumes

---

## 🐳 Docker Compose Reference

```bash
# Start all services
docker-compose up --build

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop everything
docker-compose down

# Stop and delete all data
docker-compose down -v
```

---

## ☸️ Kubernetes Deployment

### 1. Build and push images
```bash
export REGISTRY=your-registry.io
export TAG=v1.0.0
chmod +x scripts/deploy-k8s.sh
./scripts/deploy-k8s.sh
```

### 2. Set your API keys
```bash
kubectl create secret generic bot-orchestrator-secrets \
  --namespace=bot-orchestrator \
  --from-literal=ANTHROPIC_API_KEY=sk-ant-... \
  --from-literal=GEMINI_API_KEY=AIza...
```

### 3. Update the Ingress hostname
Edit `k8s/05-ingress.yaml` and replace `bot-orchestrator.yourdomain.com` with your domain.

### 4. Apply manifests
```bash
kubectl apply -f k8s/
```

---

## 🗺️ Roadmap

| Phase | Feature | Status |
|---|---|---|
| Phase 0 | Architecture decisions | ✅ Done |
| Phase 1 | Bot management UI + Backend | ✅ Done |
| Phase 2 | Bot execution engine (LLM + tools) | ✅ Done |
| Phase 3 | Browser / research capability | 🚧 Scaffold ready |
| Phase 4 | Human-in-the-loop | ✅ Done |
| Phase 5 | Polish + error handling | 🔄 Ongoing |

---

## 🔧 API Reference

### Bots
| Method | Path | Description |
|---|---|---|
| GET | `/api/bots` | List all bots |
| POST | `/api/bots` | Create a bot |
| GET | `/api/bots/:id` | Get bot details |
| DELETE | `/api/bots/:id` | Delete bot + container |
| POST | `/api/bots/:id/restart` | Restart bot container |

### Tasks
| Method | Path | Description |
|---|---|---|
| GET | `/api/tasks?botId=` | List tasks for a bot |
| POST | `/api/tasks` | Create and run a task |
| GET | `/api/tasks/:id` | Get task with logs |

### Workspace
| Method | Path | Description |
|---|---|---|
| GET | `/api/workspace/:botId/tree` | File tree |
| GET | `/api/workspace/:botId/file?path=` | Read a file |
| GET | `/api/workspace/:botId/screenshots` | List screenshots |

### Human-in-the-Loop
| Method | Path | Description |
|---|---|---|
| GET | `/api/questions?botId=` | Get pending questions |
| POST | `/api/questions/:id/answer` | Submit an answer |

### WebSocket Events
Connect to `ws://localhost:4000/ws`, then subscribe:
```json
{ "type": "subscribe", "botId": "bot-id-here" }
```

Events received:
- `bot:status` — status changed
- `bot:created` / `bot:deleted`
- `log` — real-time log line
- `human:question` — bot needs input
- `task:done` / `task:failed`

---

## 📄 License
MIT

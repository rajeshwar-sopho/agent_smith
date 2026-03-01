#!/usr/bin/env bash
set -e

echo "🤖 BotOrchestrator Setup Script"
echo "================================"

# Check requirements
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required. Install from https://docker.com"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js 20+ is required."; exit 1; }

NODE_VERSION=$(node -v | cut -d. -f1 | tr -d 'v')
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 18+ required (found $(node -v))"; exit 1
fi

echo "✅ Docker: $(docker --version)"
echo "✅ Node: $(node -v)"

# Copy .env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "📝 Created .env from .env.example — please fill in your API keys!"
  echo "   Edit .env and add ANTHROPIC_API_KEY and/or GEMINI_API_KEY"
  echo ""
fi

# Build bot runtime image first
echo "🐳 Building bot runtime Docker image..."
docker build -t bot-orchestrator-runtime:latest ./bot-runtime

# Start services
echo "🚀 Starting BotOrchestrator..."
docker-compose up --build -d

echo ""
echo "✅ BotOrchestrator is running!"
echo "   Frontend: http://localhost:3001"
echo "   Backend:  http://localhost:4000"
echo "   API docs: http://localhost:4000/health"
echo ""
echo "📋 Useful commands:"
echo "   docker-compose logs -f backend    # Backend logs"
echo "   docker-compose logs -f frontend   # Frontend logs"
echo "   docker-compose down               # Stop everything"
echo "   docker-compose down -v            # Stop + delete volumes"

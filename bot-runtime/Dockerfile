FROM node:20-slim

# Install Python and Playwright dependencies (Phase 3)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    wget \
    gnupg \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Install Playwright Chromium (Phase 3 — browser tools)
RUN npx playwright install-deps chromium 2>/dev/null || true
RUN npx playwright install chromium 2>/dev/null || true

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY src ./src

# Create workspace directory
RUN mkdir -p /workspace

ENV NODE_ENV=production
ENV WORKSPACE=/workspace

CMD ["node", "src/agent.js"]

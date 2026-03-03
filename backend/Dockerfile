FROM node:20-alpine AS builder

# Prisma needs openssl to generate and run the query engine
RUN apk add --no-cache openssl openssl-dev

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner

# Runtime also needs openssl for Prisma query engine
RUN apk add --no-cache openssl python3 py3-pip

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

# Create workspaces and data directories
RUN mkdir -p /workspaces /app/data

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_URL=file:/app/data/bot-orchestrator.db
ENV WORKSPACE_ROOT=/workspaces

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]

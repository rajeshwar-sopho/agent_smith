import { WebSocketServer, WebSocket } from 'ws';

type WSEvent = {
  type: string;
  botId?: string;
  payload: unknown;
};

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  // Map of botId → Set of connected clients subscribed to that bot
  private subscriptions = new Map<string, Set<WebSocket>>();

  init(wss: WebSocketServer) {
    this.wss = wss;
    wss.on('connection', (ws) => {
      console.log('WS client connected');

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          // Client sends { type: 'subscribe', botId: '...' }
          if (msg.type === 'subscribe' && msg.botId) {
            if (!this.subscriptions.has(msg.botId)) {
              this.subscriptions.set(msg.botId, new Set());
            }
            this.subscriptions.get(msg.botId)!.add(ws);
          }
          if (msg.type === 'unsubscribe' && msg.botId) {
            this.subscriptions.get(msg.botId)?.delete(ws);
          }
        } catch (e) {
          // ignore
        }
      });

      ws.on('close', () => {
        // Clean up all subscriptions for this ws
        for (const [, clients] of this.subscriptions) {
          clients.delete(ws);
        }
      });
    });
  }

  /** Broadcast event to all subscribers of a bot */
  emitToBot(botId: string, event: WSEvent) {
    const payload = JSON.stringify(event);
    const clients = this.subscriptions.get(botId);
    if (clients) {
      for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  }

  /** Broadcast to ALL connected clients */
  broadcast(event: WSEvent) {
    const payload = JSON.stringify(event);
    this.wss?.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }

  /** Emit a log event for a bot */
  log(botId: string, taskId: string | null, message: string, level = 'info', meta?: unknown) {
    this.emitToBot(botId, {
      type: 'log',
      botId,
      payload: { taskId, message, level, meta, ts: new Date().toISOString() },
    });
  }

  /** Emit a bot status change */
  statusChange(botId: string, status: string) {
    this.broadcast({
      type: 'bot:status',
      botId,
      payload: { status },
    });
  }
}

export const wsManager = new WebSocketManager();

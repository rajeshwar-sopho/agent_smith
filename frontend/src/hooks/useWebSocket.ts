import { useEffect, useRef, useCallback } from 'react';

type WSMessage = { type: string; botId?: string; payload: unknown };
type Handler = (msg: WSMessage) => void;

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws`;

let globalWs: WebSocket | null = null;
const handlers = new Set<Handler>();

function getWs(): WebSocket {
  if (globalWs && (globalWs.readyState === WebSocket.OPEN || globalWs.readyState === WebSocket.CONNECTING)) {
    return globalWs;
  }

  const ws = new WebSocket(WS_URL);
  globalWs = ws;

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handlers.forEach((h) => h(msg));
    } catch {}
  };

  ws.onclose = () => {
    globalWs = null;
    setTimeout(() => getWs(), 2000);
  };

  return ws;
}

export function useWebSocket(handler: Handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const h: Handler = (msg) => handlerRef.current(msg);
    handlers.add(h);
    getWs();
    return () => { handlers.delete(h); };
  }, []);
}

export function useSubscribeToBot(botId: string | null, handler: Handler) {
  useEffect(() => {
    if (!botId) return;
    const ws = getWs();

    const subscribe = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'subscribe', botId }));
      }
    };

    if (ws.readyState === WebSocket.OPEN) {
      subscribe();
    } else {
      ws.addEventListener('open', subscribe);
    }

    return () => {
      // Always remove the open listener to avoid subscribe firing after unmount
      ws.removeEventListener('open', subscribe);
      // Only send unsubscribe if the socket is actually open
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe', botId }));
      }
    };
  }, [botId]);

  useWebSocket(useCallback((msg) => {
    if (!botId || msg.botId === botId) handler(msg);
  }, [botId, handler]));
}
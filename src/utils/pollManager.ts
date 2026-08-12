type Loader = () => void;

const loaders = new Set<Loader>();
let fallbackTimer: ReturnType<typeof setInterval> | null = null;
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const FALLBACK_INTERVAL = 30000;
const WS_URL = location.protocol === 'https:' ? `wss://${location.host}/ws` : `ws://${location.host}/ws`;

function tick() {
  if (document.hidden) return;
  loaders.forEach(fn => fn());
}

function ensureFallback() {
  if (fallbackTimer || loaders.size === 0) return;
  fallbackTimer = setInterval(tick, FALLBACK_INTERVAL);
}

function maybeStopFallback() {
  if (loaders.size > 0 || !fallbackTimer) return;
  clearInterval(fallbackTimer);
  fallbackTimer = null;
}

function connectWS() {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };

    ws.onmessage = () => {
      tick();
    };

    ws.onclose = () => {
      ws = null;
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };
  } catch {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (loaders.size > 0) connectWS();
  }, 5000);
}

let closeTimer: ReturnType<typeof setTimeout> | null = null;

export function registerLoader(loader: Loader): () => void {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  loaders.add(loader);
  ensureFallback();
  connectWS();
  return () => {
    loaders.delete(loader);
    maybeStopFallback();
    if (loaders.size === 0) {
      closeTimer = setTimeout(() => {
        if (loaders.size === 0 && ws) { ws.close(); ws = null; }
        closeTimer = null;
      }, 2000);
    }
  };
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    tick();
    connectWS();
  }
});

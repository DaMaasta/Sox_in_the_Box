const { WebSocketServer } = require('ws');

let wss = null;

function init(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', () => {});
  });

  // Heartbeat: close dead connections every 30s
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  console.log('WebSocket server ready on /ws');
}

function broadcast(type, data) {
  if (!wss) return;
  const msg = JSON.stringify({ type, ...data });
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

module.exports = { init, broadcast };

/**
 * Token-gated WebSocket proxy: app → gateway → go2rtc MSE (/api/ws?src=…).
 */
import { WebSocketServer, WebSocket } from 'ws';

export function attachMseProxy(server, { getSession, go2rtcBase, streamName, pokeGo2rtcStream }) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let pathname;
    let token;
    let sessionId;
    try {
      const host = req.headers.host || 'localhost';
      const url = new URL(req.url || '/', `http://${host}`);
      pathname = url.pathname;
      token = url.searchParams.get('token') || '';
      const match = pathname.match(/^\/api\/mse\/([^/]+)\/ws$/);
      if (!match) {
        return;
      }
      sessionId = match[1];
    } catch {
      socket.destroy();
      return;
    }

    if (!getSession(sessionId, token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (clientWs) => {
      void pokeGo2rtcStream?.(3000);

      const upstreamUrl = `${go2rtcBase.replace(/^http/i, 'ws')}/api/ws?src=${encodeURIComponent(streamName)}`;
      const upstream = new WebSocket(upstreamUrl);
      const pendingClient = [];

      const flushClient = () => {
        while (pendingClient.length && upstream.readyState === WebSocket.OPEN) {
          const item = pendingClient.shift();
          upstream.send(item.data, { binary: item.isBinary });
        }
      };

      clientWs.on('message', (data, isBinary) => {
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(data, { binary: isBinary });
          return;
        }
        pendingClient.push({ data, isBinary });
      });

      upstream.on('open', () => {
        flushClient();
        upstream.on('message', (data, isBinary) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data, { binary: isBinary });
          }
        });
      });

      upstream.on('error', () => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(1011, 'upstream error');
        }
      });

      clientWs.on('error', () => {
        upstream.close();
      });

      clientWs.on('close', () => {
        upstream.close();
      });

      upstream.on('close', () => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close();
        }
      });

      const connectTimeout = setTimeout(() => {
        if (upstream.readyState !== WebSocket.OPEN) {
          clientWs.close(1011, 'upstream timeout');
          upstream.close();
        }
      }, 12_000);
      upstream.on('open', () => clearTimeout(connectTimeout));
      upstream.on('close', () => clearTimeout(connectTimeout));
    });
  });
}

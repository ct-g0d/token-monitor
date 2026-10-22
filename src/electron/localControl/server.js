'use strict';

const http = require('node:http');
const path = require('node:path');
const { generateToken, constantTimeCompare, writeControlFile, removeControlFile } = require('./token');
const { sanitizeResponse } = require('./redact');

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB limit

function sendJsonResponse(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Connection': 'close'
  });
  res.end(payload);
}

function createLocalControlServer({ dispatcher, token, homedir }) {
  const server = http.createServer(async (req, res) => {
    // Ensure every response requests connection close and sockets do not stay open
    res.setHeader('Connection', 'close');
    res.on('finish', () => {
      try {
        req.socket?.destroy();
      } catch (_) {}
    });

    // 1. Origin check: any Origin header indicates a browser cross-origin request
    if (req.headers.origin !== undefined) {
      return sendJsonResponse(res, 403, {
        ok: false,
        error: { code: 'FORBIDDEN_ORIGIN', message: 'Origin header is forbidden' }
      });
    }

    // 2. Host check: DNS rebinding protection
    const address = server.address();
    const port = address ? address.port : 0;
    const host = String(req.headers.host || '').trim().toLowerCase();
    const validHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!validHosts.has(host)) {
      return sendJsonResponse(res, 400, {
        ok: false,
        error: { code: 'INVALID_HOST', message: `Invalid Host header: ${host}` }
      });
    }

    // 3. Endpoint check: only /rpc
    const pathname = (req.url || '').split('?')[0];
    if (pathname !== '/rpc') {
      return sendJsonResponse(res, 404, {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Not found' }
      });
    }

    // 4. Method check: only POST
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJsonResponse(res, 405, {
        ok: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST method is allowed' }
      });
    }

    // 5. Authorization Bearer check
    const authHeader = String(req.headers.authorization || '').trim();
    if (!authHeader.startsWith('Bearer ')) {
      return sendJsonResponse(res, 401, {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' }
      });
    }
    const providedToken = authHeader.slice(7).trim();
    if (!constantTimeCompare(providedToken, token)) {
      return sendJsonResponse(res, 401, {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid bearer token' }
      });
    }

    // 6. Body accumulation with 1 MiB limit
    let bodyBytes = 0;
    const chunks = [];
    let exceeded = false;

    req.on('data', (chunk) => {
      if (exceeded) return;
      bodyBytes += chunk.length;
      if (bodyBytes > MAX_BODY_BYTES) {
        exceeded = true;
        req.pause();
        return sendJsonResponse(res, 413, {
          ok: false,
          error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload exceeds 1 MiB limit' }
        });
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      if (exceeded) return;

      let payload;
      try {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        payload = rawBody ? JSON.parse(rawBody) : {};
      } catch (err) {
        return sendJsonResponse(res, 400, {
          ok: false,
          error: { code: 'INVALID_JSON', message: `Malformed JSON: ${err.message}` }
        });
      }

      const { method, params } = payload;
      if (!method || typeof method !== 'string') {
        return sendJsonResponse(res, 400, {
          ok: false,
          error: { code: 'INVALID_REQUEST', message: 'Field "method" is required and must be a string' }
        });
      }

      try {
        const result = await dispatcher.execute(method, params);
        const sanitized = sanitizeResponse(result, homedir);
        return sendJsonResponse(res, 200, {
          ok: true,
          result: sanitized
        });
      } catch (error) {
        const statusCode = error.code === 'METHOD_NOT_FOUND' ? 404 : 200;
        return sendJsonResponse(res, statusCode, {
          ok: false,
          error: {
            code: error.code || 'HANDLER_ERROR',
            message: error.message || 'Execution error'
          }
        });
      }
    });
  });

  return server;
}

function startLocalControlServer(options = {}) {
  const {
    dispatcher,
    token = generateToken(),
    userDataPath,
    appVersion = '1.1.0',
    port = 0,
    homedir
  } = options;

  const server = createLocalControlServer({ dispatcher, token, homedir });
  const openSockets = new Set();
  server.on('connection', (socket) => {
    socket.unref();
    openSockets.add(socket);
    socket.on('close', () => {
      openSockets.delete(socket);
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      server.unref(); // Prevent server from holding process open
      const assignedPort = server.address().port;
      let stateFilePath = null;

      if (userDataPath) {
        stateFilePath = path.join(userDataPath, 'local-control.json');
        try {
          writeControlFile(stateFilePath, {
            port: assignedPort,
            token,
            pid: process.pid,
            version: appVersion
          });
        } catch (err) {
          server.close();
          return reject(err);
        }
      }

      function close() {
        return new Promise((resClose) => {
          if (stateFilePath) {
            try {
              removeControlFile(stateFilePath);
            } catch (_) {}
          }
          for (const socket of openSockets) {
            try {
              socket.destroy();
            } catch (_) {}
          }
          openSockets.clear();
          if (typeof server.closeAllConnections === 'function') {
            try {
              server.closeAllConnections();
            } catch (_) {}
          }
          const timer = setTimeout(() => {
            resClose();
          }, 1000);
          timer.unref();
          server.close(() => {
            clearTimeout(timer);
            resClose();
          });
        });
      }

      resolve({
        server,
        port: assignedPort,
        token,
        stateFilePath,
        close
      });
    });

    server.on('error', reject);
  });
}

module.exports = {
  createLocalControlServer,
  startLocalControlServer,
  MAX_BODY_BYTES
};

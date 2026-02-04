/**
 * Dust-GitLab MCP Server
 * HTTP/SSE endpoint wrapping GitLab MCP server for Dust.tt
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { config } from 'dotenv';
import { MCPWrapper } from './mcp-wrapper.js';

config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    hasAuth: !!req.headers.authorization,
    contentType: req.headers['content-type']
  });
  next();
});

let globalMCPWrapper: MCPWrapper | null = null;
let wrapperCreationPromise: Promise<MCPWrapper> | null = null;

// Session management for MCP Streamable HTTP protocol (2025-03-26+)
// Dust.tt uses protocol version 2025-06-18 which expects this header
const sessionStore = new Map<string, { createdAt: Date; lastActivity: Date }>();

async function getOrCreateMCPWrapper(): Promise<MCPWrapper> {
  // If already running, return it
  if (globalMCPWrapper?.isRunning()) {
    return globalMCPWrapper;
  }

  // If creation is in progress, wait for the same promise (prevents race condition)
  if (wrapperCreationPromise) {
    console.log('[MCP] Waiting for existing wrapper creation...');
    return wrapperCreationPromise;
  }

  // Start creation and store promise so concurrent requests wait for it
  wrapperCreationPromise = (async () => {
    console.log('[MCP] Creating new wrapper...');
    const wrapper = new MCPWrapper(
      process.env.GITLAB_PERSONAL_ACCESS_TOKEN!,
      process.env.GITLAB_API_URL!
    );
    await wrapper.start();
    globalMCPWrapper = wrapper;
    console.log('[MCP] Wrapper started successfully');
    return wrapper;
  })();

  try {
    return await wrapperCreationPromise;
  } finally {
    wrapperCreationPromise = null;
  }
}

// Validate required env vars
['GITLAB_PERSONAL_ACCESS_TOKEN', 'GITLAB_API_URL', 'MCP_AUTH_SECRET'].forEach(v => {
  if (!process.env[v]) {
    console.error(`Missing: ${v}`);
    process.exit(1);
  }
});

// Auth middleware - properly validates Bearer token format
function auth(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[Auth] Missing or malformed Authorization header:', authHeader ? 'present but wrong format' : 'missing');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.substring(7);
  if (token !== process.env.MCP_AUTH_SECRET) {
    console.log('[Auth] Invalid token');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  console.log('[Auth] Token valid');
  next();
}

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', mcpRunning: globalMCPWrapper?.isRunning() || false });
});

// SSE endpoint
app.get('/sse', auth, async (req, res) => {
  console.log('[SSE] Auth passed, establishing connection');

  // Generate session ID per MCP Streamable HTTP spec (2025-03-26+)
  const sessionId = crypto.randomUUID();
  sessionStore.set(sessionId, { createdAt: new Date(), lastActivity: new Date() });
  console.log(`[SSE] Created session: ${sessionId}`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Mcp-Session-Id', sessionId);  // Required for protocol 2025-03-26+
  res.flushHeaders();

  res.write(`event: endpoint\ndata: /sse/messages\n\n`);
  console.log('[SSE] Sent endpoint event');

  // SSE keepalive - send comment every 15 seconds to keep connection alive
  const keepalive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
      console.log('[SSE] Sent keepalive ping');
    } catch (e) {
      console.log('[SSE] Keepalive failed, connection likely closed');
      clearInterval(keepalive);
    }
  }, 15000);

  try {
    const wrapper = await getOrCreateMCPWrapper();

    const onMessage = (msg: any) => {
      // Don't send responses via SSE - they're returned via POST response body
      // Per MCP spec: "If server returns application/json, it MUST NOT also push via SSE"
      if (msg.id !== undefined) {
        return;
      }

      // Only server-initiated notifications go via SSE
      // Enhance 404 errors with context
      if (msg.error?.message?.includes('Not Found') && !msg.error.message.includes('Tip:')) {
        msg.error.message += ' | Tip: Check project path (group/project), file path, and branch name';
      }
      console.log('[SSE] Forwarding server notification:', JSON.stringify(msg).substring(0, 100));
      res.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
    };

    const onError = (err: Error) => {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    };

    wrapper.on('message', onMessage);
    wrapper.on('error', onError);

    req.on('close', () => {
      console.log(`[SSE] Connection closed by client (session: ${sessionId})`);
      console.log('[SSE] Connection duration:', Math.round((Date.now() - sessionStore.get(sessionId)!.createdAt.getTime()) / 1000), 'seconds');
      clearInterval(keepalive);
      sessionStore.delete(sessionId);
      wrapper.removeListener('message', onMessage);
      wrapper.removeListener('error', onError);
    });
  } catch (error) {
    console.error('[SSE] Failed to initialize:', error);
    clearInterval(keepalive);
    sessionStore.delete(sessionId);
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to start MCP' })}\n\n`);
    res.end();
  }
});

// Fix common parameter issues
function fixParams(msg: any): any {
  if (msg.method !== 'tools/call') return msg;

  const args = msg.params?.arguments || {};

  // project -> project_id
  if (args.project && !args.project_id) {
    args.project_id = args.project;
    delete args.project;
  }

  // branch -> ref
  if (args.branch && !args.ref) {
    args.ref = args.branch;
    delete args.branch;
  }

  // path -> file_path
  if (args.path && !args.file_path) {
    args.file_path = args.path;
    delete args.path;
  }

  msg.params.arguments = args;
  return msg;
}

// POST endpoint - handles JSON-RPC messages per MCP Streamable HTTP spec
app.post('/sse/messages', auth, async (req, res) => {
  // Step 1: Immediately log raw body to see what Dust.tt sends
  console.log('[POST] Raw body:', JSON.stringify(req.body));
  console.log('[POST] Body type:', typeof req.body, 'Keys:', Object.keys(req.body || {}));
  console.log('[POST] Headers:', JSON.stringify({
    'content-type': req.headers['content-type'],
    'mcp-session-id': req.headers['mcp-session-id'],
    'accept': req.headers['accept']
  }));

  let msg = req.body;

  if (msg.method === 'tools/call') {
    console.log(`[Tool] ${msg.params?.name}: ${JSON.stringify(msg.params?.arguments || {})}`);
    msg = fixParams(msg);
  } else if (msg.method) {
    console.log(`[Request] ${msg.method} id=${msg.id}`);
  } else {
    // Log when there's no method - this might be the issue
    console.log('[POST] No method found in body. Has jsonrpc:', msg?.jsonrpc, 'Has id:', msg?.id);
  }

  if (msg.jsonrpc !== '2.0') {
    // Step 2: Log validation failures with full context
    console.log('[POST] Invalid JSON-RPC rejected. Body was:', JSON.stringify(msg));
    res.status(400).json({ error: 'Invalid JSON-RPC' });
    return;
  }

  try {
    const wrapper = await getOrCreateMCPWrapper();

    // Notifications (no id) and responses: just forward, return 202 Accepted
    if (msg.id === undefined) {
      // Step 3: Log notifications separately
      console.log('[Notification] method:', msg.method, 'params:', JSON.stringify(msg.params || {}).substring(0, 100));
      wrapper.sendMessage(msg);
      res.status(202).send();
      return;
    }

    // Requests (have id): wait for response and return it
    console.log(`[Request] Waiting for response to id=${msg.id}...`);
    const startTime = Date.now();
    const response = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.log(`[Timeout] No response for id=${msg.id} after 30s`);
        wrapper.removeListener('message', handler);
        reject(new Error('Timeout waiting for MCP response'));
      }, 30000);

      const handler = (response: any) => {
        // Match response by id
        if (response.id === msg.id) {
          clearTimeout(timeout);
          wrapper.removeListener('message', handler);
          resolve(response);
        }
      };

      wrapper.on('message', handler);
      wrapper.sendMessage(msg);
    });

    const elapsed = Date.now() - startTime;
    console.log(`[Response] id=${msg.id} (${elapsed}ms): ${JSON.stringify(response).substring(0, 200)}...`);

    // For initialize response, add Mcp-Session-Id header per MCP Streamable HTTP spec
    // This tells Dust.tt (protocol 2025-06-18) that we support session management
    if (msg.method === 'initialize') {
      const sessionId = crypto.randomUUID();
      res.setHeader('Mcp-Session-Id', sessionId);
      console.log(`[Response] Added Mcp-Session-Id header: ${sessionId}`);
    }

    res.json(response);
  } catch (error) {
    console.error('[Error]', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32603, message: 'Internal error' }
    });
  }
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: Function) => {
  res.status(500).json({ error: err.message });
});

app.listen(PORT, async () => {
  console.log(`✅ MCP Server on port ${PORT}`);

  // Pre-warm MCP wrapper on startup so it's ready when Dust.tt connects
  console.log('[Startup] Pre-warming MCP wrapper...');
  try {
    const wrapper = await getOrCreateMCPWrapper();
    console.log('[Startup] MCP wrapper ready, sending warm-up requests...');

    // Send initialize to warm up the server
    const initResponse = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Warm-up timeout')), 15000);
      const handler = (msg: any) => {
        if (msg.id === 'warmup-init') {
          clearTimeout(timeout);
          wrapper.removeListener('message', handler);
          resolve(msg);
        }
      };
      wrapper.on('message', handler);
      wrapper.sendMessage({
        jsonrpc: '2.0',
        id: 'warmup-init',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'dust-gitlab-warmup', version: '1.0.0' }
        }
      });
    });
    console.log('[Startup] Initialize warm-up complete');

    // Send tools/list to cache the tool list
    const toolsResponse = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Tools list timeout')), 15000);
      const handler = (msg: any) => {
        if (msg.id === 'warmup-tools') {
          clearTimeout(timeout);
          wrapper.removeListener('message', handler);
          resolve(msg);
        }
      };
      wrapper.on('message', handler);
      wrapper.sendMessage({
        jsonrpc: '2.0',
        id: 'warmup-tools',
        method: 'tools/list',
        params: {}
      });
    });
    console.log(`[Startup] Tools warm-up complete: ${toolsResponse.result?.tools?.length || 0} tools`);
    console.log('[Startup] Server fully initialized and warmed up');
  } catch (error) {
    console.error('[Startup] Failed to pre-warm MCP wrapper:', error);
    // Don't exit - let it retry on first request
  }
});

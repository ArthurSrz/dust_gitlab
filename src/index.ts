/**
 * Dust-GitLab MCP Server
 * HTTP/SSE endpoint wrapping GitLab MCP server for Dust.tt
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
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

async function getOrCreateMCPWrapper(): Promise<MCPWrapper> {
  if (!globalMCPWrapper || !globalMCPWrapper.isRunning()) {
    console.log('[MCP] Creating new wrapper...');
    globalMCPWrapper = new MCPWrapper(
      process.env.GITLAB_PERSONAL_ACCESS_TOKEN!,
      process.env.GITLAB_API_URL!
    );
    await globalMCPWrapper.start();
    console.log('[MCP] Wrapper started successfully');
  }
  return globalMCPWrapper;
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
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`event: endpoint\ndata: /sse/messages\n\n`);

  try {
    const wrapper = await getOrCreateMCPWrapper();

    const onMessage = (msg: any) => {
      // Enhance 404 errors with context
      if (msg.error?.message?.includes('Not Found') && !msg.error.message.includes('Tip:')) {
        msg.error.message += ' | Tip: Check project path (group/project), file path, and branch name';
      }
      res.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
    };

    const onError = (err: Error) => {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    };

    wrapper.on('message', onMessage);
    wrapper.on('error', onError);

    req.on('close', () => {
      wrapper.removeListener('message', onMessage);
      wrapper.removeListener('error', onError);
    });
  } catch (error) {
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
  let msg = req.body;

  if (msg.method === 'tools/call') {
    console.log(`[Tool] ${msg.params?.name}: ${JSON.stringify(msg.params?.arguments || {})}`);
    msg = fixParams(msg);
  } else if (msg.method) {
    console.log(`[Request] ${msg.method} id=${msg.id}`);
  }

  if (msg.jsonrpc !== '2.0') {
    res.status(400).json({ error: 'Invalid JSON-RPC' });
    return;
  }

  try {
    const wrapper = await getOrCreateMCPWrapper();

    // Notifications (no id) and responses: just forward, return 202 Accepted
    if (msg.id === undefined) {
      wrapper.sendMessage(msg);
      res.status(202).send();
      return;
    }

    // Requests (have id): wait for response and return it
    const response = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
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

    console.log(`[Response] id=${msg.id}: ${JSON.stringify(response).substring(0, 200)}...`);
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

app.listen(PORT, () => {
  console.log(`✅ MCP Server on port ${PORT}`);
});

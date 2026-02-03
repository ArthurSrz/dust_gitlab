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

let globalMCPWrapper: MCPWrapper | null = null;

async function getOrCreateMCPWrapper(): Promise<MCPWrapper> {
  if (!globalMCPWrapper || !globalMCPWrapper.isRunning()) {
    globalMCPWrapper = new MCPWrapper(
      process.env.GITLAB_PERSONAL_ACCESS_TOKEN!,
      process.env.GITLAB_API_URL!
    );
    await globalMCPWrapper.start();
    console.log('[MCP] Started');
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

// Auth middleware
function auth(req: Request, res: Response, next: Function) {
  const token = req.headers.authorization?.substring(7);
  if (token !== process.env.MCP_AUTH_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', mcpRunning: globalMCPWrapper?.isRunning() || false });
});

// SSE endpoint
app.get('/sse', auth, async (req, res) => {
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

// POST endpoint
app.post('/sse/messages', auth, async (req, res) => {
  let msg = req.body;

  if (msg.method === 'tools/call') {
    console.log(`[Tool] ${msg.params?.name}: ${JSON.stringify(msg.params?.arguments || {})}`);
    msg = fixParams(msg);
  }

  if (msg.jsonrpc !== '2.0') {
    res.status(400).json({ error: 'Invalid JSON-RPC' });
    return;
  }

  try {
    const wrapper = await getOrCreateMCPWrapper();
    wrapper.sendMessage(msg);
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: Function) => {
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`✅ MCP Server on port ${PORT}`);
});

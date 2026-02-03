/**
 * Dust-GitLab MCP Server
 *
 * HTTP/SSE endpoint that wraps the official GitLab MCP server for Dust.tt integration
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { MCPWrapper } from './mcp-wrapper.js';

// Load environment variables
config();

const app = express();
// Railway provides PORT environment variable, fallback to 3000 for local dev
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Global MCP wrapper instance (single-session model)
let globalMCPWrapper: MCPWrapper | null = null;
let currentSSEResponse: Response | null = null;

/**
 * Get or create the global MCP wrapper instance
 */
async function getOrCreateMCPWrapper(): Promise<MCPWrapper> {
  if (!globalMCPWrapper || !globalMCPWrapper.isRunning()) {
    console.log('[MCP] Creating new global MCP wrapper instance');

    globalMCPWrapper = new MCPWrapper(
      process.env.GITLAB_PERSONAL_ACCESS_TOKEN!,
      process.env.GITLAB_API_URL!
    );

    await globalMCPWrapper.start();
    console.log('[MCP] Global MCP wrapper started successfully');
  }

  return globalMCPWrapper;
}

// Environment variable validation
const requiredEnvVars = [
  'GITLAB_PERSONAL_ACCESS_TOKEN',
  'GITLAB_API_URL',
  'MCP_AUTH_SECRET',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Authentication middleware
function authenticateRequest(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
    });
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (token !== process.env.MCP_AUTH_SECRET) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authentication token',
    });
    return;
  }

  next();
}

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'dust-gitlab-mcp',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    mcpRunning: globalMCPWrapper?.isRunning() || false,
    sseConnected: currentSSEResponse !== null,
  });
});

// SSE endpoint for MCP protocol
app.get('/sse', authenticateRequest, async (req, res) => {
  console.log('[SSE] New connection established');

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    // Get or create global MCP wrapper
    const wrapper = await getOrCreateMCPWrapper();

    // Store current SSE connection
    currentSSEResponse = res;

    // Forward MCP messages to this SSE client
    const messageHandler = (message: any) => {
      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify(message)}\n\n`);
      // Explicitly flush to ensure immediate delivery
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    };

    const errorHandler = (error: Error) => {
      console.error('[SSE] MCP error:', error.message);
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    };

    wrapper.on('message', messageHandler);
    wrapper.on('error', errorHandler);

    console.log('[SSE] Connection established and message handlers attached');

    // Handle client disconnect
    req.on('close', () => {
      console.log('[SSE] Client disconnected');
      wrapper.removeListener('message', messageHandler);
      wrapper.removeListener('error', errorHandler);
      currentSSEResponse = null;
    });

  } catch (error) {
    console.error('[SSE] Failed to start MCP wrapper:', error);
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({
      error: 'Failed to start MCP server',
      details: error instanceof Error ? error.message : String(error)
    })}\n\n`);
    res.end();
  }
});

// POST endpoint for sending MCP messages
app.post('/sse/messages', authenticateRequest, async (req, res) => {
  // Log incoming request for debugging
  console.log('[POST] Received MCP message:', {
    method: req.body.method,
    id: req.body.id,
    hasParams: !!req.body.params,
  });

  // Body should be the JSON-RPC message directly
  const message = req.body;

  // Validate JSON-RPC format
  if (!message.jsonrpc || message.jsonrpc !== '2.0') {
    console.error('[POST] Invalid JSON-RPC format:', message);
    res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid JSON-RPC message (missing or invalid jsonrpc field)',
    });
    return;
  }

  try {
    // Get or create global MCP wrapper
    const wrapper = await getOrCreateMCPWrapper();

    // Forward message to MCP server
    console.log(`[POST] Forwarding to MCP server: ${message.method || 'notification'}`);
    wrapper.sendMessage(message);

    // Acknowledge receipt
    res.json({
      status: 'ok',
    });

  } catch (error) {
    console.error('[POST] Error handling message:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: Function) => {
  console.error('[Server Error]:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// Start server (works for both Railway and local development)
// Railway and Vercel both provide PORT via environment variable
app.listen(PORT, () => {
  console.log(`✅ Dust-GitLab MCP Server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health check: /health`);
  console.log(`   SSE endpoint: /sse`);
  console.log(`   Messages endpoint: POST /sse/messages`);
});

// Also export for Vercel serverless compatibility
export default app;

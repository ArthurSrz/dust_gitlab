/**
 * Dust-GitLab MCP Server
 *
 * HTTP/SSE endpoint that wraps the official GitLab MCP server for Dust.tt integration
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { SessionManager } from './session-manager.js';

// Load environment variables
config();

const app = express();
// Railway provides PORT environment variable, fallback to 3000 for local dev
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Session manager instance
const sessionManager = new SessionManager();

// Cleanup stale sessions every 10 minutes
setInterval(() => {
  sessionManager.cleanupStaleSessions();
}, 10 * 60 * 1000);

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
    activeSessions: sessionManager.getSessionCount(),
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
    // Create session with MCP wrapper
    const sessionId = await sessionManager.createSession(
      res,
      process.env.GITLAB_PERSONAL_ACCESS_TOKEN!,
      process.env.GITLAB_API_URL!
    );

    console.log(`[SSE] Session ${sessionId} created successfully`);

    // Send endpoint first (tells client where to POST messages)
    res.write(`event: endpoint\n`);
    res.write(`data: ${req.protocol}://${req.get('host')}/sse/messages\n\n`);

    // Then send session info
    res.write(`event: message\n`);
    res.write(`data: ${JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      result: {
        sessionId: sessionId,
        capabilities: {}
      }
    })}\n\n`);

    // Handle client disconnect
    req.on('close', async () => {
      console.log(`[SSE] Client disconnected, session ${sessionId}`);
      await sessionManager.destroySession(sessionId);
    });

  } catch (error) {
    console.error('[SSE] Failed to create session:', error);
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
  console.log('[POST] Received request:', {
    body: req.body,
    headers: {
      'content-type': req.headers['content-type'],
      'authorization': req.headers.authorization ? 'Bearer [REDACTED]' : 'none'
    }
  });

  const { sessionId, message } = req.body;

  // Validate request
  if (!sessionId) {
    console.error('[POST] Missing sessionId in request body:', req.body);
    res.status(400).json({
      error: 'Bad Request',
      message: 'Missing "sessionId" field in request body',
      receivedFields: Object.keys(req.body)
    });
    return;
  }

  if (!message) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Missing "message" field in request body',
    });
    return;
  }

  // Validate MCP message format
  if (!message.jsonrpc || message.jsonrpc !== '2.0') {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid MCP message format (missing or invalid jsonrpc field)',
    });
    return;
  }

  try {
    // Get session
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        error: 'Not Found',
        message: `Session ${sessionId} not found or expired`,
      });
      return;
    }

    // Forward message to MCP server
    console.log(`[POST] Forwarding message to session ${sessionId}:`, message.method || 'notification');
    sessionManager.sendMessage(sessionId, message);

    // Acknowledge receipt
    res.json({
      status: 'ok',
      message: 'Message forwarded to MCP server',
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

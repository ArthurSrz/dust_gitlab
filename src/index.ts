/**
 * Dust-GitLab MCP Server
 *
 * HTTP/SSE endpoint that wraps the official GitLab MCP server for Dust.tt integration
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { MCPWrapper, MCPMessage } from './mcp-wrapper.js';

// Load environment variables
config();

const app = express();
// Railway provides PORT environment variable, fallback to 3000 for local dev
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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

  // Create MCP wrapper instance
  const mcpWrapper = new MCPWrapper(
    process.env.GITLAB_PERSONAL_ACCESS_TOKEN!,
    process.env.GITLAB_API_URL!
  );

  try {
    // Start the MCP server
    await mcpWrapper.start();
    console.log('[SSE] MCP server started successfully');

    // Send initial connection event
    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({ status: 'connected' })}\n\n`);

    // Forward MCP messages to SSE client
    mcpWrapper.on('message', (message: MCPMessage) => {
      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify(message)}\n\n`);
    });

    // Handle MCP server errors
    mcpWrapper.on('error', (error: Error) => {
      console.error('[SSE] MCP server error:', error);
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    });

    // Handle MCP server exit
    mcpWrapper.on('exit', ({ code, signal }) => {
      console.log(`[SSE] MCP server exited (code: ${code}, signal: ${signal})`);
      res.write(`event: disconnected\n`);
      res.write(`data: ${JSON.stringify({ reason: 'Server process exited' })}\n\n`);
      res.end();
    });

    // Handle client disconnect
    req.on('close', async () => {
      console.log('[SSE] Client disconnected');
      await mcpWrapper.stop();
    });

  } catch (error) {
    console.error('[SSE] Failed to start MCP server:', error);
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({
      error: 'Failed to start MCP server',
      details: error instanceof Error ? error.message : String(error)
    })}\n\n`);
    res.end();
  }
});

// POST endpoint for sending MCP messages
app.post('/sse/messages', authenticateRequest, express.json(), async (req, res) => {
  const { message } = req.body;

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
    // For now, we'll need to maintain active MCP wrapper instances
    // In production, you'd want connection pooling or session management

    // This is a simplified implementation - in production you'd need:
    // 1. Session management to track active SSE connections
    // 2. Message routing to send requests to the correct MCP instance
    // 3. Timeout handling for requests without active connections

    res.status(501).json({
      error: 'Not Implemented',
      message: 'Direct message posting requires active SSE connection',
      hint: 'Use the /sse endpoint to establish a persistent connection',
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
});

// Also export for Vercel serverless compatibility
export default app;

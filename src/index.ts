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

  // CRITICAL: Send endpoint event first (for OLD HTTP+SSE transport compatibility)
  // This tells Dust.tt where to send POST requests
  res.write(`event: endpoint\n`);
  res.write(`data: /sse/messages\n\n`);
  console.log('[SSE] Sent endpoint event: /sse/messages');

  try {
    // Get or create global MCP wrapper
    const wrapper = await getOrCreateMCPWrapper();

    // Forward MCP messages to this SSE client
    const messageHandler = (message: any) => {
      // Enhance error messages for common GitLab API errors
      if (message.error) {
        const errorMsg = message.error.message || '';

        // Detect "Not Found" errors and add helpful context
        if (errorMsg.includes('Not Found') || errorMsg.includes('404')) {
          console.warn('[SSE] GitLab 404 Error - adding helpful context');
          message.error.message = errorMsg + ' | Common causes: (1) Wrong project path - use "group/project" format, (2) File does not exist - check exact path and case, (3) Directory path used instead of file path, (4) Wrong branch name, (5) No access to project';
        }
      }

      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify(message)}\n\n`);
    };

    const errorHandler = (error: Error) => {
      console.error('[SSE] MCP error:', error.message);
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    };

    wrapper.on('message', messageHandler);
    wrapper.on('error', errorHandler);

    console.log('[SSE] Connection established and message handlers attached');

    // Handle client disconnect
    req.on('close', () => {
      console.log('[SSE] Client disconnected');
      wrapper.removeListener('message', messageHandler);
      wrapper.removeListener('error', errorHandler);
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

/**
 * Fix common parameter issues in tool calls
 */
function fixToolCallParameters(message: any): any {
  if (message.method !== 'tools/call') {
    return message;
  }

  const toolName = message.params?.name;
  const args = message.params?.arguments || {};

  // Fix project -> project_id (GitLab MCP server expects project_id)
  if (args.project && !args.project_id) {
    console.log('[FIX] Translating project -> project_id');
    args.project_id = args.project;
    delete args.project;
  }

  // Fix path -> file_path (some tools use different naming)
  if (toolName === 'get_file_contents' && args.path && !args.file_path) {
    console.log('[FIX] Translating path -> file_path');
    args.file_path = args.path;
    delete args.path;
  }

  // Validate get_file_contents tool
  if (toolName === 'get_file_contents') {
    const filePath = args.file_path || args.path;

    // Check if trying to read a directory (common paths that are usually directories)
    const commonDirs = ['src', 'docs', 'test', 'tests', 'lib', 'dist', 'build', 'public', 'assets', 'components', 'pages', 'api'];
    const isDirLike = commonDirs.includes(filePath) ||
                      (filePath && !filePath.includes('.') && !filePath.includes('/'));

    if (isDirLike) {
      console.warn(`[WARN] Possible directory path in get_file_contents: "${filePath}"`);
      console.warn('[WARN] This tool only works for files. If you need directory contents, the API will return 404.');
    }

    // Ensure required parameters are present
    if (!args.project_id) {
      console.error('[ERROR] Missing required parameter: project_id');
    }
    if (!filePath) {
      console.error('[ERROR] Missing required parameter: file_path');
    }
  }

  message.params.arguments = args;
  return message;
}

// POST endpoint for sending MCP messages
app.post('/sse/messages', authenticateRequest, async (req, res) => {
  let message = req.body;

  // Enhanced logging for tool calls
  if (message.method === 'tools/call') {
    console.log('[POST] Tool Call:', {
      id: message.id,
      tool: message.params?.name,
      arguments: JSON.stringify(message.params?.arguments || {}),
    });

    // Fix common parameter issues
    message = fixToolCallParameters(message);
  } else {
    console.log('[POST] MCP Message:', {
      method: message.method,
      id: message.id,
      hasParams: !!message.params,
    });
  }

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

// Start server (Railway provides PORT via environment variable)
app.listen(PORT, () => {
  console.log(`✅ Dust-GitLab MCP Server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health check: /health`);
  console.log(`   SSE endpoint: /sse`);
  console.log(`   Messages endpoint: POST /sse/messages`);
});

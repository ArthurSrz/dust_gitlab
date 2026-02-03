/**
 * MCP Wrapper - Bridges stdio-based GitLab MCP server to HTTP/SSE transport
 *
 * This module spawns the official @modelcontextprotocol/server-gitlab as a child process
 * and manages bidirectional communication between HTTP clients and the stdio-based server.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class MCPWrapper extends EventEmitter {
  private process: ChildProcess | null = null;
  private messageBuffer = '';
  private isInitialized = false;

  constructor(
    private gitlabToken: string,
    private gitlabApiUrl: string
  ) {
    super();
  }

  /**
   * Start the GitLab MCP server as a child process
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('MCP server already running');
    }

    return new Promise((resolve, reject) => {
      // Spawn the GitLab MCP server with environment variables
      // Use npx with --no flag to suppress warnings
      this.process = spawn('npx', ['--yes', '@modelcontextprotocol/server-gitlab'], {
        env: {
          ...process.env,
          GITLAB_PERSONAL_ACCESS_TOKEN: this.gitlabToken,
          GITLAB_API_URL: this.gitlabApiUrl,
          // Suppress npm warnings
          npm_config_loglevel: 'error',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Handle stdout messages from MCP server
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleStdoutData(data);
      });

      // Handle stderr for errors, warnings, and info messages
      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString().trim();
        const lowerText = text.toLowerCase();

        // Categorize the message
        if (
          // Informational startup/status messages
          lowerText.includes('running on') ||
          lowerText.includes('starting') ||
          lowerText.includes('listening') ||
          lowerText.includes('server started') ||
          lowerText.includes('ready') ||
          lowerText.includes('initialized')
        ) {
          // Informational messages - just log
          console.log('[MCP Server Info]:', text);
        } else if (
          // Warnings
          lowerText.includes('warn') ||
          lowerText.includes('deprecated') ||
          lowerText.includes('deprecation')
        ) {
          // Warnings - log but don't emit error events
          console.warn('[MCP Server Warning]:', text);
        } else if (
          // Actual errors
          lowerText.includes('error') ||
          lowerText.includes('failed') ||
          lowerText.includes('exception') ||
          lowerText.includes('fatal') ||
          lowerText.includes('cannot') ||
          lowerText.includes('unable to')
        ) {
          // Real errors - emit error event
          console.error('[MCP Server Error]:', text);
          this.emit('error', new Error(text));
        } else {
          // Unknown stderr output - log as debug
          console.log('[MCP Server Debug]:', text);
        }
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        console.log(`[MCP Server] Exited with code ${code}, signal ${signal}`);
        this.process = null;
        this.isInitialized = false;
        this.emit('exit', { code, signal });
      });

      // Handle process errors
      this.process.on('error', (error) => {
        console.error('[MCP Server] Process error:', error);
        reject(error);
      });

      // Wait a moment for the process to initialize
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.isInitialized = true;
          resolve();
        } else {
          reject(new Error('MCP server failed to start'));
        }
      }, 1000);
    });
  }

  /**
   * Handle stdout data from the MCP server
   * MCP messages are newline-delimited JSON
   */
  private handleStdoutData(data: Buffer): void {
    this.messageBuffer += data.toString();

    // Split by newlines to handle multiple messages
    const lines = this.messageBuffer.split('\n');

    // Keep the last incomplete line in the buffer
    this.messageBuffer = lines.pop() || '';

    // Process complete lines
    for (const line of lines) {
      if (line.trim()) {
        try {
          const message: MCPMessage = JSON.parse(line);
          this.emit('message', message);
        } catch (error) {
          console.error('[MCP Wrapper] Failed to parse message:', line, error);
        }
      }
    }
  }

  /**
   * Send a message to the MCP server via stdin
   */
  sendMessage(message: MCPMessage): void {
    if (!this.process || !this.isInitialized) {
      throw new Error('MCP server not running');
    }

    const messageStr = JSON.stringify(message) + '\n';
    this.process.stdin?.write(messageStr);
  }

  /**
   * Stop the MCP server process
   */
  async stop(): Promise<void> {
    if (this.process) {
      return new Promise((resolve) => {
        this.process!.once('exit', () => {
          this.process = null;
          this.isInitialized = false;
          resolve();
        });

        this.process!.kill('SIGTERM');

        // Force kill after 5 seconds
        setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL');
          }
        }, 5000);
      });
    }
  }

  /**
   * Check if the server is running
   */
  isRunning(): boolean {
    return this.isInitialized && this.process !== null && !this.process.killed;
  }
}

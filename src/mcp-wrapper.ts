/**
 * MCP Wrapper - Bridges stdio GitLab MCP server to HTTP/SSE transport
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

export class MCPWrapper extends EventEmitter {
  private process: ChildProcess | null = null;
  private buffer = '';
  private ready = false;

  constructor(private token: string, private apiUrl: string) {
    super();
  }

  async start(): Promise<void> {
    if (this.process) throw new Error('Already running');

    return new Promise((resolve, reject) => {
      let resolved = false;

      const markReady = () => {
        if (!resolved && this.process && !this.process.killed) {
          resolved = true;
          this.ready = true;
          console.log('[MCP] Ready');
          resolve();
        }
      };

      this.process = spawn('npx', ['--yes', '@modelcontextprotocol/server-gitlab'], {
        env: {
          ...process.env,
          GITLAB_PERSONAL_ACCESS_TOKEN: this.token,
          GITLAB_API_URL: this.apiUrl,
          npm_config_loglevel: 'error',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.buffer += data.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              this.emit('message', JSON.parse(line));
            } catch (e) {
              // Not JSON - ignore (might be startup log)
            }
          }
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString().trim();
        if (!text) return;

        const lower = text.toLowerCase();

        // Detect readiness message from GitLab MCP server
        if (lower.includes('running on stdio') || lower.includes('server started')) {
          console.log('[MCP]', text);
          markReady();
          return;
        }

        // Only treat as fatal error if it's a real crash
        const isFatalError =
          lower.includes('throw err') ||
          lower.includes('cannot find module') ||
          lower.includes('fatal') ||
          lower.includes('enoent') ||
          (lower.includes('error:') && !lower.includes('gitlab'));

        if (isFatalError) {
          console.error('[MCP Fatal]', text);
          this.emit('error', new Error(text));
          if (!resolved) {
            resolved = true;
            reject(new Error(text));
          }
        } else {
          // Just log non-fatal stderr (startup info, warnings, etc.)
          console.log('[MCP]', text.substring(0, 200));
        }
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[MCP] Exited: code=${code}, signal=${signal}`);
        this.process = null;
        this.ready = false;
        this.emit('exit', { code, signal });
      });

      this.process.on('error', (err) => {
        console.error('[MCP] Process error:', err);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      // Fallback timeout - only if readiness message not detected
      setTimeout(() => {
        if (!resolved) {
          console.log('[MCP] No readiness message detected, assuming ready');
          markReady();
        }
      }, 3000);
    });
  }

  sendMessage(msg: MCPMessage): void {
    if (!this.process || !this.ready) throw new Error('Not running');
    this.process.stdin?.write(JSON.stringify(msg) + '\n');
  }

  async stop(): Promise<void> {
    if (!this.process) return;
    return new Promise((resolve) => {
      this.process!.once('exit', () => {
        this.process = null;
        this.ready = false;
        resolve();
      });
      this.process!.kill('SIGTERM');
      setTimeout(() => this.process?.kill('SIGKILL'), 5000);
    });
  }

  isRunning(): boolean {
    return this.ready && this.process !== null && !this.process.killed;
  }
}

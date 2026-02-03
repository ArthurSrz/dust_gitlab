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
      // Using official GitLab MCP server (community packages have dependency issues)
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
              console.error('[Parse error]', line);
            }
          }
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString().trim();
        if (text.toLowerCase().includes('error')) {
          console.error('[MCP]', text);
          this.emit('error', new Error(text));
        }
      });

      this.process.on('exit', (code, signal) => {
        this.process = null;
        this.ready = false;
        this.emit('exit', { code, signal });
      });

      this.process.on('error', reject);

      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.ready = true;
          resolve();
        } else {
          reject(new Error('Failed to start'));
        }
      }, 1000);
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

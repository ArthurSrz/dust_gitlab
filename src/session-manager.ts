/**
 * Session Manager - Manages active SSE connections and their MCP instances
 */

import { Response } from 'express';
import { MCPWrapper } from './mcp-wrapper.js';
import { randomBytes } from 'crypto';

interface Session {
  id: string;
  mcpWrapper: MCPWrapper;
  response: Response;
  createdAt: Date;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  /**
   * Create a new session with MCP wrapper
   */
  async createSession(
    res: Response,
    gitlabToken: string,
    gitlabApiUrl: string
  ): Promise<string> {
    const sessionId = randomBytes(16).toString('hex');

    const mcpWrapper = new MCPWrapper(gitlabToken, gitlabApiUrl);

    // Create session before starting (so it's available for message routing)
    const session: Session = {
      id: sessionId,
      mcpWrapper,
      response: res,
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    try {
      // Attach event listeners before starting
      mcpWrapper.on('message', (message) => {
        // Forward MCP messages to SSE client
        res.write(`event: message\n`);
        res.write(`data: ${JSON.stringify(message)}\n\n`);
        // Explicitly flush to ensure immediate delivery
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      });

      mcpWrapper.on('error', (error: Error) => {
        console.error(`[Session ${sessionId}] MCP error:`, error.message);
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      });

      mcpWrapper.on('exit', ({ code, signal }) => {
        console.log(`[Session ${sessionId}] MCP exited (code: ${code}, signal: ${signal})`);
        res.write(`event: disconnected\n`);
        res.write(`data: ${JSON.stringify({ reason: 'Server process exited' })}\n\n`);
        res.end();
        this.destroySession(sessionId);
      });

      // Start the MCP server
      await mcpWrapper.start();
      console.log(`[Session ${sessionId}] Created and MCP server started`);

      return sessionId;
    } catch (error) {
      // Clean up on failure
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Send a message to the MCP server for a specific session
   */
  sendMessage(sessionId: string, message: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.mcpWrapper.sendMessage(message);
  }

  /**
   * Destroy a session and clean up resources
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    console.log(`[Session ${sessionId}] Destroying session`);

    try {
      await session.mcpWrapper.stop();
    } catch (error) {
      console.error(`[Session ${sessionId}] Error stopping MCP wrapper:`, error);
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Clean up stale sessions (older than 1 hour)
   */
  cleanupStaleSessions(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.createdAt < oneHourAgo) {
        console.log(`[Session ${sessionId}] Cleaning up stale session`);
        this.destroySession(sessionId);
      }
    }
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
}

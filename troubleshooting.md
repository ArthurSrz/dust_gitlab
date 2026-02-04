# Troubleshooting Guide

## Issue: Dust.tt receives `initialize` response but never calls `tools/list`

### Symptoms
- SSE connection establishes successfully
- `initialize` request received and responded
- But `tools/list` never arrives
- No tools appear in Dust.tt interface

### Root Cause: Transport Mismatch (Old SSE vs Streamable HTTP)

**CRITICAL FINDING**: Dust.tt uses protocol version `2025-06-18` but expects **Old SSE transport**, NOT Streamable HTTP!

| Transport | POST Response | Response Delivery |
|-----------|--------------|-------------------|
| **Old SSE** (what Dust.tt expects) | `{ status: 'ok' }` immediately | ALL responses via SSE stream |
| **Streamable HTTP** (what we tried) | Waits & returns actual response | Only notifications via SSE |

### What Didn't Work (Streamable HTTP approach)
```typescript
// ❌ WRONG - waits for response and returns it in POST body
const response = await wrapper.waitForResponse(msg.id);
res.json(response);  // Dust.tt doesn't read this!

// Also wrong - filtering responses from SSE:
if (msg.id !== undefined) return;  // Dust.tt expects responses HERE
```

### Solution (Old SSE approach)
```typescript
// ✅ CORRECT - return immediately, response goes via SSE
app.post('/sse/messages', auth, async (req, res) => {
  const wrapper = await getOrCreateMCPWrapper();
  wrapper.sendMessage(msg);
  res.json({ status: 'ok' });  // Acknowledge receipt
});

// In SSE handler - forward ALL messages (including responses):
const onMessage = (msg: any) => {
  res.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
};
```

### Evidence
The working `gitlab-exist` implementation uses Old SSE transport and Dust.tt connects successfully.

### Protocol Detection Hint
Despite using protocol version `2025-06-18` in the `initialize` handshake, Dust.tt still uses the deprecated SSE transport behavior. Don't be fooled by the protocol version!

---

## Issue: 401 Unauthorized on POST but not on GET /sse

### Symptoms
- `GET /sse` works with Bearer token
- `POST /sse/messages` returns 401

### Root Cause
Auth middleware wasn't being applied to POST endpoint, or token comparison was failing.

### Solution
Ensure auth middleware is applied:
```typescript
app.post('/sse/messages', auth, async (req, res) => { ... });
```

And use strict comparison:
```typescript
const token = authHeader.substring(7);  // Extract after "Bearer "
if (token !== process.env.MCP_AUTH_SECRET) {
  res.status(401).json({ error: 'Unauthorized' });
  return;
}
```

---

## Issue: GitLab tool calls fail with "project_id: Required"

### Symptoms
- Tool calls fail with validation error
- Parameter names don't match GitLab MCP server expectations

### Root Cause
GitLab MCP server uses specific parameter names:
- `project_id` (not `project`)
- `file_path` (not `path`)
- `ref` (not `branch`)

### Solution
Auto-fix parameters in the proxy:
```typescript
function fixParams(msg: any): any {
  if (msg.method !== 'tools/call') return msg;
  const args = msg.params?.arguments || {};

  if (args.project && !args.project_id) {
    args.project_id = args.project;
    delete args.project;
  }
  // ... similar for path -> file_path, branch -> ref

  return msg;
}
```

---

## Issue: Race condition - Multiple MCP wrappers created

### Symptoms
In Railway logs, you see:
```
[MCP] Creating new wrapper...
[MCP] GitLab MCP Server running on stdio
[MCP] GitLab MCP Server running on stdio    ← TWO instances!
[MCP] Ready
[MCP] Wrapper started successfully
[MCP] Ready
[MCP] Wrapper started successfully          ← TWO wrappers!
```

### Root Cause
When multiple requests arrive simultaneously (e.g., `tools/list` and `initialize`), the async `getOrCreateMCPWrapper()` function would start creating a wrapper for each request before the first one finished.

### Solution
Store the creation promise so concurrent requests wait for the same wrapper:

```typescript
let wrapperCreationPromise: Promise<MCPWrapper> | null = null;

async function getOrCreateMCPWrapper(): Promise<MCPWrapper> {
  if (globalMCPWrapper?.isRunning()) {
    return globalMCPWrapper;
  }

  // Concurrent requests wait for the same promise
  if (wrapperCreationPromise) {
    console.log('[MCP] Waiting for existing wrapper creation...');
    return wrapperCreationPromise;
  }

  wrapperCreationPromise = (async () => {
    const wrapper = new MCPWrapper(...);
    await wrapper.start();
    globalMCPWrapper = wrapper;
    return wrapper;
  })();

  try {
    return await wrapperCreationPromise;
  } finally {
    wrapperCreationPromise = null;
  }
}
```

---

## Issue: MaxListenersExceededWarning in logs

### Symptoms
```
MaxListenersExceededWarning: Possible EventEmitter memory leak detected.
11 message listeners added to [MCPWrapper]. MaxListeners is 10.
```

### Root Cause
Each POST request adds a temporary `message` listener to wait for its matching response. With concurrent requests (common when Dust.tt sends multiple tool calls), the listener count can exceed Node's default limit of 10.

### Solution
Increase the max listeners limit in MCPWrapper constructor:

```typescript
constructor(private token: string, private apiUrl: string) {
  super();
  // Allow many concurrent request handlers
  this.setMaxListeners(50);
}
```

This is safe because:
- Listeners ARE removed after each request completes
- The accumulation is temporary during concurrent request handling
- 50 allows for reasonable burst traffic

---

## Issue: Duplicate responses causing client confusion

### ~~Previous advice (WRONG for Dust.tt)~~

~~Filter out responses from SSE stream because "If server returns application/json, it MUST NOT also push via SSE"~~

### Corrected Understanding

This MCP spec rule applies to **Streamable HTTP transport**. But Dust.tt uses **Old SSE transport** where:
- POST only returns acknowledgment (`{ status: 'ok' }`)
- ALL responses MUST go via SSE stream

### Solution for Dust.tt
Do NOT filter responses. Forward everything via SSE:

```typescript
const onMessage = (msg: any) => {
  // OLD SSE: Forward ALL messages including responses
  res.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
};
```

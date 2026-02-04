# Troubleshooting Guide

## Issue: "Error getting metadata from the remote MCP server" in Dust.tt

### Symptoms
- SSE connection establishes successfully
- Auth middleware validates token correctly
- POST requests reach server
- But Dust.tt shows "Error getting metadata from the remote MCP server"

### Root Cause
The POST endpoint was returning `{ status: 'ok' }` instead of the actual JSON-RPC response.

Per the [MCP Streamable HTTP spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports):
> If the input is a JSON-RPC *request*, the server MUST return the actual response (Content-Type: application/json) or initiate an SSE stream (Content-Type: text/event-stream).

When Dust.tt sends `initialize` or `tools/list` requests, it expects:
- A JSON-RPC response with server capabilities
- A list of available tools

Not `{ status: 'ok' }`.

### Solution
Distinguish between **requests** (have `id` field) and **notifications** (no `id`):

```typescript
// Notifications: just forward, return 202 Accepted
if (msg.id === undefined) {
  wrapper.sendMessage(msg);
  res.status(202).send();
  return;
}

// Requests: wait for response and return it
const response = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    wrapper.removeListener('message', handler);
    reject(new Error('Timeout'));
  }, 30000);

  const handler = (response) => {
    if (response.id === msg.id) {
      clearTimeout(timeout);
      wrapper.removeListener('message', handler);
      resolve(response);
    }
  };

  wrapper.on('message', handler);
  wrapper.sendMessage(msg);
});

res.json(response);
```

### Verification
In Railway logs, you should see:
```
[Request] initialize id=1
[Response] id=1: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"...
[Request] tools/list id=2
[Response] id=2: {"jsonrpc":"2.0","id":2,"result":{"tools":[...9 tools...
```

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

## Issue: Duplicate responses causing client confusion

### Symptoms
- Logs show responses are being sent correctly
- But Dust.tt still reports errors
- Responses appear to be sent twice

### Root Cause
Per MCP spec: "If the server returns application/json, it MUST NOT also push that response via SSE"

The SSE handler was broadcasting ALL messages from MCPWrapper, including responses that were ALSO being returned via POST response body.

### Solution
Filter out responses (messages with `id`) from SSE stream:

```typescript
const onMessage = (msg: any) => {
  // Don't send responses via SSE - they go via POST body
  if (msg.id !== undefined) {
    return;
  }

  // Only server-initiated notifications go via SSE
  res.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
};
```

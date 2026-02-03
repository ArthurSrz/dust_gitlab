# Troubleshooting Guide

Common issues and solutions for the Dust-GitLab MCP integration.

## Authentication Issues

### "Authentication failed" or "401 Unauthorized"

**Symptoms:**
- Cannot connect to GitLab API
- Error: "401 Unauthorized" in logs
- Error: "Invalid or expired token"

**Solutions:**

1. **Verify GitLab Token is Valid**
   ```bash
   # Test your token manually
   curl --header "PRIVATE-TOKEN: glpat-xxxxxxxxxxxxx" \
        "https://gitlab.com/api/v4/user"
   ```
   Should return your user details.

2. **Check Token Scopes**
   - Go to GitLab → Preferences → Access Tokens
   - Verify token has these scopes:
     - ✅ `api` - Full API access
     - ✅ `read_repository` - Read repository files
   - If missing scopes, create a new token

3. **Verify Token Not Expired**
   - Check expiration date in GitLab UI
   - Create new token if expired

4. **Check Environment Variables**
   ```bash
   # Local development
   cat .env | grep GITLAB_PERSONAL_ACCESS_TOKEN

   # Vercel
   vercel env ls
   ```

### "Invalid authentication token" (MCP Auth)

**Symptoms:**
- Cannot connect to `/sse` endpoint
- Dust.tt shows "Authentication failed"

**Solutions:**

1. **Verify Bearer Token Matches**
   - Check `MCP_AUTH_SECRET` in `.env` (local) or Vercel env
   - Must match the token configured in Dust.tt
   - Token is case-sensitive

2. **Check Authorization Header Format**
   ```bash
   # Correct
   curl -H "Authorization: Bearer your-secret-here" http://localhost:3000/sse

   # Wrong (missing "Bearer ")
   curl -H "Authorization: your-secret-here" http://localhost:3000/sse
   ```

## Server Startup Issues

### "Unhandled 'error' event" on SSE connection

**Symptoms:**
- Server crashes with "Unhandled 'error' event"
- Error message mentions npm warnings
- Crash occurs right after SSE connection established

**Cause:**
- npm warnings from npx being treated as errors
- Error event emitted before error listener attached

**Solution:**
✅ **Fixed in latest version** (commit 6b6dffc)

If you're on an older version:
1. Update to latest code: `git pull origin main`
2. Rebuild: `npm run build`
3. Redeploy

The fix includes:
- Error listeners attached before server startup
- npm warnings suppressed and logged separately
- Only actual errors cause error events

## Connection Issues

### "Cannot access Veltys projects"

**Symptoms:**
- `list_projects` returns empty or doesn't include Veltys projects
- `get_project` fails for Veltys project paths

**Solutions:**

1. **Verify Organization Membership**
   - Go to GitLab → Groups → Veltys
   - Check you're listed as a member
   - Minimum role required: Guest (for read-only)

2. **Check Project Visibility**
   - Private projects require membership
   - Internal projects require GitLab account
   - Public projects accessible to all

3. **Test Access Manually**
   ```bash
   curl --header "PRIVATE-TOKEN: glpat-xxxxxxxxxxxxx" \
        "https://gitlab.com/api/v4/groups/veltys/projects"
   ```

### "SSE connection drops" or "Connection timeout"

**Symptoms:**
- Connection closes unexpectedly
- Vercel logs show function timeout
- Long-running queries fail

**Solutions:**

1. **Vercel Free Tier Limits**
   - Free tier: 10 second timeout for serverless functions
   - Pro tier: 60 seconds
   - Enterprise: 900 seconds

2. **Use Pagination for Large Queries**
   ```json
   {
     "method": "list_commits",
     "params": {
       "project_id": "veltys/my-project",
       "per_page": 20,  // Smaller page size
       "page": 1
     }
   }
   ```

3. **Upgrade Vercel Plan**
   - Consider Pro plan if queries frequently timeout
   - Or implement caching layer (Redis)

### "MCP server failed to start"

**Symptoms:**
- Error in logs: "MCP server failed to start"
- SSE connection immediately closes

**Solutions:**

1. **Check Node.js Version**
   ```bash
   node --version  # Should be 18+
   ```

2. **Verify Dependencies Installed**
   ```bash
   npm install
   # Or
   npm ci  # Clean install
   ```

3. **Check for Port Conflicts (Local Only)**
   ```bash
   lsof -i :3000  # Check if port 3000 is in use
   ```

4. **Review Server Logs**
   ```bash
   # Local
   npm run dev

   # Vercel
   vercel logs
   ```

## GitLab API Issues

### "Rate limit exceeded"

**Symptoms:**
- Error: "429 Too Many Requests"
- Temporary inability to make API calls

**Solutions:**

1. **Check Current Rate Limit**
   ```bash
   curl -I --header "PRIVATE-TOKEN: glpat-xxxxxxxxxxxxx" \
        "https://gitlab.com/api/v4/user"
   # Look for headers:
   # RateLimit-Limit: 5000
   # RateLimit-Remaining: 4999
   # RateLimit-Reset: 1704067200
   ```

2. **Implement Caching**
   - Cache frequently accessed data (projects, branches)
   - Use Redis or in-memory cache
   - Set appropriate TTL (e.g., 5 minutes for projects)

3. **Reduce Query Frequency**
   - Batch operations when possible
   - Use pagination efficiently
   - Avoid polling in tight loops

4. **Upgrade GitLab Plan**
   - Free: 5,000 requests/minute
   - Premium/Ultimate: 10,000 requests/minute

### "Project not found" or "404 Not Found"

**Symptoms:**
- Cannot access specific project
- Error: "404 Project Not Found"

**Solutions:**

1. **Verify Project Path Format**
   ```json
   // Correct formats
   {"project_id": "veltys/my-project"}  // Full path
   {"project_id": "12345"}              // Numeric ID

   // Wrong
   {"project_id": "my-project"}         // Missing namespace
   ```

2. **Check Project Exists**
   ```bash
   # List all accessible projects
   curl --header "PRIVATE-TOKEN: glpat-xxxxxxxxxxxxx" \
        "https://gitlab.com/api/v4/projects?search=my-project"
   ```

3. **Verify Permissions**
   - You need at least Guest role to view project
   - Check project visibility settings

## Deployment Issues

### "Build failed" on Vercel

**Symptoms:**
- Vercel deployment fails during build step
- TypeScript compilation errors

**Solutions:**

1. **Check TypeScript Errors Locally**
   ```bash
   npm run type-check
   npm run build
   ```

2. **Verify Dependencies in package.json**
   - All dependencies listed in `dependencies` (not `devDependencies`)
   - Correct versions specified

3. **Check Vercel Build Logs**
   ```bash
   vercel logs --build
   ```

### "Module not found" in Production

**Symptoms:**
- Works locally but fails on Vercel
- Error: "Cannot find module '@modelcontextprotocol/server-gitlab'"

**Solutions:**

1. **Verify File Extensions**
   - Use `.js` extension in imports (even for `.ts` files)
   - TypeScript compiles to ES modules
   ```typescript
   // Correct
   import { MCPWrapper } from './mcp-wrapper.js';

   // Wrong
   import { MCPWrapper } from './mcp-wrapper';
   ```

2. **Check package.json type field**
   ```json
   {
     "type": "module"  // Required for ES modules
   }
   ```

3. **Rebuild and Redeploy**
   ```bash
   rm -rf dist node_modules
   npm install
   npm run build
   vercel --prod
   ```

## Dust.tt Integration Issues

### "Dust.tt cannot discover MCP tools"

**Symptoms:**
- No GitLab tools appear in Dust.tt
- Connection shows as "Connected" but tools list is empty

**Solutions:**

1. **Verify MCP Protocol Version**
   - Official GitLab server uses MCP 1.0+
   - Dust.tt must support same version

2. **Check SSE Endpoint Accessibility**
   ```bash
   curl -H "Authorization: Bearer your-secret" \
        https://your-project.vercel.app/sse
   ```

3. **Review Dust.tt Logs**
   - Check Dust.tt UI for error messages
   - Look for connection or parsing errors

4. **Test with Claude Desktop First**
   - Verify MCP server works with Claude Desktop
   - Rule out server-side issues

### "Tool execution fails" in Dust.tt

**Symptoms:**
- Tools discovered but fail when executed
- Dust agent shows error when calling GitLab operations

**Solutions:**

1. **Check Request Format**
   - Dust.tt must send valid MCP JSON-RPC messages
   - Verify parameters match API reference

2. **Review Server Logs**
   ```bash
   vercel logs --follow
   ```

3. **Test Direct API Call**
   - Bypass Dust.tt and test endpoint directly
   - Use curl or Postman to send MCP messages

## Debugging Tips

### Enable Verbose Logging

**Local development:**
```typescript
// In src/index.ts, add:
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  next();
});
```

**Environment variable:**
```bash
# .env
DEBUG=*
NODE_ENV=development
```

### Test MCP Server Standalone

Test the official GitLab server before adding HTTP wrapper:

1. Install globally:
   ```bash
   npm install -g @modelcontextprotocol/server-gitlab
   ```

2. Run directly:
   ```bash
   GITLAB_PERSONAL_ACCESS_TOKEN=glpat-xxx \
   GITLAB_API_URL=https://gitlab.com/api/v4 \
   npx @modelcontextprotocol/server-gitlab
   ```

3. Test via Claude Desktop config:
   ```json
   {
     "mcpServers": {
       "gitlab": {
         "command": "npx",
         "args": ["@modelcontextprotocol/server-gitlab"],
         "env": {
           "GITLAB_PERSONAL_ACCESS_TOKEN": "glpat-xxx",
           "GITLAB_API_URL": "https://gitlab.com/api/v4"
         }
       }
     }
   }
   ```

### Capture Network Traffic

**For local testing:**
```bash
# Use mitmproxy to inspect HTTP traffic
mitmproxy -p 8080

# Configure proxy
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080
```

## Getting Help

If none of these solutions work:

1. **Check Logs First**
   - Local: `npm run dev` output
   - Vercel: `vercel logs --follow`
   - Dust.tt: Check agent execution logs

2. **Create Minimal Reproduction**
   - Test with simplest possible query
   - Isolate the failing component

3. **Gather Information**
   - Full error message and stack trace
   - Node.js version (`node --version`)
   - Package versions (`npm list`)
   - Environment (local vs. Vercel)

4. **File an Issue**
   - Include reproduction steps
   - Attach relevant logs (redact secrets!)
   - Describe expected vs. actual behavior

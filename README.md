# Dust.tt ↔ GitLab MCP Server

Connect Dust.tt AI agents to your GitLab projects with **98 tools** for comprehensive GitLab operations. Query issues, merge requests, files, pipelines, wikis, milestones and more using natural language.

> **Powered by** [`@zereight/mcp-gitlab`](https://www.npmjs.com/package/@zereight/mcp-gitlab) - a community-maintained GitLab MCP server with enhanced functionality.

## Quick Setup (5 minutes)

### 1. Get a GitLab Personal Access Token

1. Go to [GitLab → Settings → Access Tokens](https://gitlab.com/-/user_settings/personal_access_tokens)
2. Click **Add new token**
3. Name: `dust-mcp-server`
4. Select scopes:
   - ✅ `api` (Full API access)
   - ✅ `read_repository` (Read files)
5. Click **Create** and copy the token (starts with `glpat-`)

### 2. Deploy to Railway

Railway provides free hosting with no timeout limits (perfect for SSE connections).

1. **Fork this repository** to your GitHub account

2. **Deploy to Railway:**
   - Go to [railway.app](https://railway.app)
   - Click **New Project** → **Deploy from GitHub repo**
   - Select your forked `dust_gitlab` repo
   - Railway will auto-detect and deploy

3. **Add environment variables** in Railway dashboard:
   ```
   GITLAB_PERSONAL_ACCESS_TOKEN=glpat-xxxxxxxxxxxxx
   GITLAB_API_URL=https://gitlab.com/api/v4
   MCP_AUTH_SECRET=your-random-secret-here
   NODE_ENV=production
   ```

   > 💡 For `MCP_AUTH_SECRET`, use a random string (e.g., from `openssl rand -base64 32`)

4. **Get your server URL:**
   - Railway Settings → Networking → **Generate Domain**
   - Copy the URL: `https://your-project.up.railway.app`

5. **Verify deployment:**
   ```bash
   curl https://your-project.up.railway.app/health
   ```
   Should return: `{"status":"ok","service":"dust-gitlab-mcp",...}`

### 3. Connect to Dust.tt

1. Open [Dust.tt](https://dust.tt) → **Spaces** → **Tools** → **Add Tool**
2. Select **Remote MCP Server**
3. Configure:
   - **Name**: `GitLab`
   - **URL**: `https://your-project.up.railway.app/sse`
   - **Authentication Type**: `Bearer Token`
   - **Token**: Your `MCP_AUTH_SECRET` value
4. Click **Test Connection** (should succeed in ~5 seconds)
5. Click **Save**

### 4. Test It!

In a Dust Agent, try:
- "List my GitLab projects"
- "Show open issues in project X"
- "Get the README from project Y"
- "What are the recent commits in project Z?"

## Available GitLab Tools (98 Tools)

This server uses `@zereight/mcp-gitlab` which provides **98 tools** - significantly more than the official ~40 tools.

### Core Tools (Always Available)

| Category | Tools |
|----------|-------|
| **Repository** | `get_file_contents`, `create_or_update_file`, `push_files`, `search_repositories`, `create_repository`, `fork_repository`, `create_branch`, `list_repository_tree` |
| **Issues** | `create_issue`, `list_issues`, `get_issue`, `update_issue`, `create_issue_note`, `list_issue_links` |
| **Merge Requests** | `create_merge_request`, `list_merge_requests`, `get_merge_request`, `update_merge_request`, `merge_merge_request`, `list_merge_request_diffs` |
| **Users & Groups** | `get_user`, `list_project_members`, `list_group_members`, `get_project`, `list_projects` |
| **Commits** | `list_commits`, `get_commit`, `list_commit_diffs` |
| **Branches & Tags** | `list_branches`, `get_branch`, `delete_branch`, `list_tags` |

### Optional Feature Modules

Enable these via environment variables for additional tools:

| Feature | Env Variable | Tools Added |
|---------|--------------|-------------|
| **Wiki** | `USE_GITLAB_WIKI=true` | `list_wiki_pages`, `get_wiki_page`, `create_wiki_page`, `update_wiki_page`, `delete_wiki_page` |
| **Pipelines** | `USE_PIPELINE=true` | `list_pipelines`, `get_pipeline`, `create_pipeline`, `cancel_pipeline`, `retry_pipeline`, `list_jobs`, `get_job_log` |
| **Milestones** | `USE_MILESTONE=true` | `list_milestones`, `get_milestone`, `create_milestone`, `update_milestone`, `list_milestone_issues` |

### Security Feature

| Feature | Env Variable | Description |
|---------|--------------|-------------|
| **Read-only Mode** | `GITLAB_READ_ONLY_MODE=true` | Disables all write operations - useful for restricted access scenarios |

### ✅ Directory Listing Now Supported!

Unlike the official server, `@zereight/mcp-gitlab` **supports directory listing**:
- ✅ `list_repository_tree` - Browse repository file structure
- ✅ Navigate directories and discover files
- ✅ Full repository exploration

## Local Development

Want to test locally before deploying?

```bash
# Clone and install
git clone https://github.com/YourUsername/dust_gitlab.git
cd dust_gitlab
npm install

# Create .env file
cp .env.example .env
# Edit .env and add your credentials

# Run locally
npm run dev
# Server starts at http://localhost:3000

# Test
curl http://localhost:3000/health
```

## How It Works

```
┌─────────┐    HTTPS/SSE    ┌─────────┐    stdio    ┌──────────────┐
│ Dust.tt │ ←────────────→  │ Railway │ ←────────→  │ GitLab MCP   │
└─────────┘                  └─────────┘             │ Server       │
                                                      └──────────────┘
                                                            ↓
                                                      ┌──────────────┐
                                                      │ GitLab API   │
                                                      └──────────────┘
```

This server bridges the community [`@zereight/mcp-gitlab`](https://www.npmjs.com/package/@zereight/mcp-gitlab) MCP server (stdio-based) to HTTP/SSE transport required by Dust.tt. The zereight package provides 98 tools vs ~40 in the official server, with additional features like Wiki, Pipeline, and Milestone management.

## Troubleshooting

### Connection Issues

**"Authentication failed"**
- Verify your GitLab token is valid and hasn't expired
- Check token has `api` and `read_repository` scopes
- Test token: `curl -H "PRIVATE-TOKEN: glpat-xxx" https://gitlab.com/api/v4/user`

**"Connection timeout"**
- Make sure you're using Railway (not Vercel free tier which has 10s limits)
- Check Railway logs for errors

**"Tools not discovered"**
- Ensure the SSE endpoint URL is correct: `https://your-project.up.railway.app/sse`
- Verify Bearer token matches your `MCP_AUTH_SECRET`
- Check Railway logs for connection errors

### Tool Execution Errors

**"GitLab API error: Not Found" (404)**

This means the GitLab API couldn't find what you asked for. Common causes:

1. **Wrong project path/ID or parameter name**
   - ✅ Correct: `project_id: "group/project-name"` or `project_id: "12345678"`
   - ❌ Wrong: `project-name` (missing group), `group/repo` (wrong name), `project: "..."` (wrong param name)
   - **Fix**: Go to your GitLab project → Settings → General → copy the full path
   - **Note**: Parameter must be named `project_id` (the wrapper will auto-fix `project` if used)

2. **File doesn't exist**
   - ✅ Correct: `README.md`, `src/index.ts`
   - ❌ Wrong: `readme.md` (wrong case), `/src/index.ts` (leading slash)
   - **Fix**: Browse the project in GitLab, copy the exact file path

3. **Wrong branch**
   - Default branch is usually `main` or `master`
   - **Fix**: Check the project's default branch in GitLab

4. **No access to project**
   - Your GitLab token only has access to projects you're a member of
   - **Fix**: Make sure you're a member of the project/group

**Example valid tool call:**
```
Tool: get_file_contents
Inputs:
  - project_id: "mygroup/myproject"  (or numeric ID: "12345678")
  - file_path: "README.md"
  - ref: "main"  (optional, defaults to default branch)
```

**Note**: The parameter is called `project_id` (not `project`). The wrapper will auto-fix if you use `project` instead.

**Debug tips:**
1. Check Railway logs to see the exact parameters being sent
2. Test GitLab API directly: `curl -H "PRIVATE-TOKEN: glpat-xxx" https://gitlab.com/api/v4/projects/group%2Fproject`
3. Verify project ID: `curl -H "PRIVATE-TOKEN: glpat-xxx" https://gitlab.com/api/v4/projects/group%2Fproject | jq .id`

**"GitLab API error: Unauthorized" (401)**
- GitLab token is invalid or expired
- Token doesn't have required scopes (`api`, `read_repository`)
- **Fix**: Regenerate token with correct scopes

**"GitLab API error: Forbidden" (403)**
- Token is valid but doesn't have permission for this action
- **Fix**: Check project membership and permissions

## Project Structure

```
dust_gitlab/
├── src/
│   ├── index.ts          # HTTP/SSE server
│   └── mcp-wrapper.ts    # stdio-to-SSE bridge
├── .env.example          # Environment template
├── package.json          # Dependencies
├── railway.json          # Railway deployment config
└── tsconfig.json         # TypeScript config
```

## Security

- 🔒 GitLab tokens encrypted in Railway environment variables
- 🔑 Bearer token authentication for Dust.tt requests
- 🚀 HTTPS only (Railway provides SSL automatically)
- 👤 Token scoped to your GitLab account permissions

## Package Comparison

This project uses `@zereight/mcp-gitlab` instead of the official server. Here's why:

| Feature | Official (`@modelcontextprotocol/server-gitlab`) | This Project (`@zereight/mcp-gitlab`) |
|---------|--------------------------------------------------|---------------------------------------|
| **Tools** | ~40 | **98** |
| **Directory Listing** | ❌ | ✅ `list_repository_tree` |
| **Wiki API** | ❌ | ✅ (optional) |
| **Pipeline Management** | ❌ | ✅ (optional) |
| **Milestone Tracking** | ❌ | ✅ (optional) |
| **Rate Limiting** | ❌ | ✅ Built-in |
| **Connection Pooling** | ❌ | ✅ |
| **Read-only Mode** | ❌ | ✅ |
| **Native HTTP/SSE** | ❌ | ✅ (not used - we use wrapper) |

### Enabling Optional Features

To enable additional tools, set environment variables in Railway:

```bash
# Enable Wiki tools
USE_GITLAB_WIKI=true

# Enable Pipeline management
USE_PIPELINE=true

# Enable Milestone tracking
USE_MILESTONE=true

# Restrict to read-only operations
GITLAB_READ_ONLY_MODE=true
```

After changing environment variables, Railway will automatically redeploy.

## Support

- 📖 [Model Context Protocol Documentation](https://modelcontextprotocol.io)
- 🔧 [zereight/mcp-gitlab Source](https://github.com/zereight/mcp-gitlab)
- 📦 [NPM Package](https://www.npmjs.com/package/@zereight/mcp-gitlab)
- 💬 Open an issue for bugs or questions

## License

MIT

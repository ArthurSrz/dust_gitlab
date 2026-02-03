# Dust.tt ↔ GitLab MCP Server

Connect Dust.tt AI agents to your GitLab projects. Query issues, merge requests, files, and more using natural language.

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

## Available GitLab Tools

Once connected, Dust.tt agents can use these tools:

| Tool | Description |
|------|-------------|
| `create_or_update_file` | Create or update files in a repository |
| `search_repositories` | Search for repositories by name or description |
| `create_repository` | Create a new GitLab repository |
| `get_file_contents` | Read file contents from a repository |
| `push_files` | Push multiple files to a repository |
| `create_issue` | Create a new issue |
| `create_merge_request` | Create a new merge request |
| `fork_repository` | Fork an existing repository |
| `create_branch` | Create a new branch |

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

This server bridges the official stdio-based [GitLab MCP server](https://github.com/modelcontextprotocol/servers/tree/main/src/gitlab) to HTTP/SSE transport required by Dust.tt.

## Troubleshooting

**"Authentication failed"**
- Verify your GitLab token is valid and hasn't expired
- Check token has `api` and `read_repository` scopes

**"Connection timeout"**
- Make sure you're using Railway (not Vercel free tier which has 10s limits)
- Check Railway logs for errors

**"Can't access my projects"**
- Verify you're a member of the GitLab projects/groups
- Check your GitLab token permissions

**"Tools not discovered"**
- Ensure the SSE endpoint URL is correct: `https://your-project.up.railway.app/sse`
- Verify Bearer token matches your `MCP_AUTH_SECRET`
- Check Railway logs for connection errors

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

## Support

- 📖 [Model Context Protocol Documentation](https://modelcontextprotocol.io)
- 🔧 [GitLab MCP Server Source](https://github.com/modelcontextprotocol/servers/tree/main/src/gitlab)
- 💬 Open an issue for bugs or questions

## License

MIT

# Dust-GitLab MCP Integration

HTTP/SSE wrapper for the official GitLab MCP server, enabling Dust.tt to query GitLab data (projects, issues, merge requests, commits, files).

## Architecture

```
Dust.tt → HTTPS/SSE → Railway/Vercel → stdio bridge → @modelcontextprotocol/server-gitlab → GitLab API
```

This wrapper bridges the official stdio-based GitLab MCP server to HTTP/SSE transport required by Dust.tt.

**Recommended Platform**: Railway (no timeout limits for SSE connections)
**Alternative**: Vercel (10s timeout on free tier may affect long-running queries)

## Features

- ✅ Complete GitLab API coverage (15+ operations)
- ✅ Secure Bearer token authentication
- ✅ SSE (Server-Sent Events) transport
- ✅ Easy Vercel deployment
- ✅ Environment-based configuration

## Quick Start

### Prerequisites

- Node.js 18+
- GitLab Personal Access Token with `api` scope
- (Optional) Vercel account for deployment

### Local Development

1. **Clone and install dependencies**
   ```bash
   cd /Users/arthursarazin/Documents/dust_gitlab
   npm install
   ```

2. **Create `.env` file**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your credentials:
   ```env
   GITLAB_PERSONAL_ACCESS_TOKEN=glpat-xxxxxxxxxxxxx
   GITLAB_API_URL=https://gitlab.com/api/v4
   MCP_AUTH_SECRET=your-random-secret-here
   ```

3. **Run locally**
   ```bash
   npm run dev
   ```

   Server starts at `http://localhost:3000`

4. **Test the connection**
   ```bash
   # Health check (no auth)
   curl http://localhost:3000/health

   # SSE endpoint (requires auth)
   curl -H "Authorization: Bearer your-random-secret-here" \
        http://localhost:3000/sse
   ```

### Deploy to Railway (Recommended)

Railway provides persistent processes with no timeout limits, ideal for SSE connections.

1. **Connect GitHub repository**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select `ArthurSrz/dust_gitlab`

2. **Configure environment variables** in Railway dashboard:
   - `GITLAB_PERSONAL_ACCESS_TOKEN`: Your GitLab PAT
   - `GITLAB_API_URL`: `https://gitlab.com/api/v4`
   - `MCP_AUTH_SECRET`: Random secret for Dust.tt auth
   - `NODE_ENV`: `production`

3. **Generate public domain**
   - Railway Settings → Networking → Generate Domain
   - Get URL: `https://your-project.up.railway.app`

4. **Verify deployment**
   ```bash
   curl https://your-project.up.railway.app/health
   ```

See [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for detailed instructions.

### Alternative: Deploy to Vercel

⚠️ **Note**: Vercel free tier has 10s timeout which may affect SSE connections.

1. **Install Vercel CLI**: `npm i -g vercel`
2. **Set environment variables**: `vercel env add GITLAB_PERSONAL_ACCESS_TOKEN`
3. **Deploy**: `vercel --prod`
4. **Get endpoint**: `https://your-project.vercel.app/sse`

### Connect to Dust.tt

1. Navigate to **Dust.tt → Spaces → Tools → Add Tool**
2. Select **Remote MCP Server**
3. Configure:
   - **URL**: `https://your-project.vercel.app/sse`
   - **Authentication**: Bearer token (your `MCP_AUTH_SECRET`)
4. Let Dust.tt auto-discover available GitLab tools
5. Test in a Dust Agent workflow

## Available GitLab Operations

Once connected, Dust.tt agents can use these tools:

### Projects
- `list_projects` - List all accessible projects
- `get_project` - Get project details by ID
- `search_projects` - Search projects by name

### Issues
- `list_issues` - List issues for a project
- `get_issue` - Get issue details
- `create_issue` - Create new issue
- `update_issue` - Update existing issue

### Merge Requests
- `list_merge_requests` - List merge requests
- `get_merge_request` - Get MR details
- `create_merge_request` - Create new MR

### Repository
- `list_files` - List files in repository
- `get_file_contents` - Read file contents
- `search_code` - Search code in repositories

### Commits
- `list_commits` - List commits
- `get_commit` - Get commit details
- `get_commit_diff` - Get commit diff

### Branches
- `list_branches` - List branches
- `get_branch` - Get branch details
- `create_branch` - Create new branch

### Pipelines
- `list_pipelines` - List CI/CD pipelines
- `get_pipeline_status` - Get pipeline status

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITLAB_PERSONAL_ACCESS_TOKEN` | Yes | GitLab PAT with `api` scope |
| `GITLAB_API_URL` | Yes | GitLab API URL (default: `https://gitlab.com/api/v4`) |
| `MCP_AUTH_SECRET` | Yes | Secret for Dust.tt authentication |
| `PORT` | No | Local server port (default: 3000) |
| `NODE_ENV` | No | Environment (`development` or `production`) |

### Creating GitLab Personal Access Token

1. Go to **GitLab → Preferences → Access Tokens**
2. Click **Add new token**
3. Name: `dust-mcp-server`
4. Scopes:
   - ✅ `api` - Full API access
   - ✅ `read_repository` - Read repository files
5. Copy the token (starts with `glpat-`)

## Security

- **GitLab PAT**: Stored in Vercel environment variables (encrypted at rest)
- **MCP Auth**: Bearer token validates Dust.tt requests
- **Scoped Access**: Token limited to your GitLab account permissions
- **HTTPS**: All communication encrypted in transit
- **Rate Limiting**: GitLab free tier allows 5,000 requests/minute

## Troubleshooting

### "Authentication failed"
- Verify GitLab token is valid and has correct scopes
- Check token hasn't expired

### "Cannot access Veltys projects"
- Verify you're a member of the Veltys GitLab organization
- Check token permissions

### "SSE connection drops"
- Vercel free tier has 10s timeout for serverless functions
- May need pagination for large queries

### "Rate limit exceeded"
- GitLab API has rate limits (5,000 req/min on free tier)
- Implement caching or reduce query frequency

## Development

### Project Structure

```
dust_gitlab/
├── src/
│   ├── index.ts          # Main HTTP/SSE server
│   └── mcp-wrapper.ts    # stdio-to-SSE bridge
├── dist/                 # Compiled output
├── package.json
├── tsconfig.json
├── vercel.json          # Vercel deployment config
└── .env                 # Local environment variables (not committed)
```

### Scripts

- `npm run dev` - Start local development server
- `npm run build` - Build TypeScript to JavaScript
- `npm run type-check` - Check TypeScript types

### Testing Locally

Test with Claude Desktop before deploying:

1. Add to `~/.claude/config.json`:
   ```json
   {
     "mcpServers": {
       "gitlab": {
         "command": "npx",
         "args": ["@modelcontextprotocol/server-gitlab"],
         "env": {
           "GITLAB_PERSONAL_ACCESS_TOKEN": "glpat-xxxxxxxxxxxxx",
           "GITLAB_API_URL": "https://gitlab.com/api/v4"
         }
       }
     }
   }
   ```

2. Restart Claude Desktop
3. Test commands:
   - "List all Veltys projects"
   - "Show me issues in project X"
   - "Get the contents of README.md from project Y"

## API Reference

See [API_REFERENCE.md](./API_REFERENCE.md) for detailed documentation of all available GitLab operations.

## License

MIT

## Support

For issues or questions:
- Create an issue in this repository
- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common problems

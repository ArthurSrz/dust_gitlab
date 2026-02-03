# Railway Deployment Guide

Deploy the Dust-GitLab MCP server to Railway.app for production use.

## Prerequisites

- Railway account (free tier available)
- GitLab Personal Access Token with `api` scope
- GitHub repository (already created: `ArthurSrz/dust_gitlab`)

## Deployment Steps

### 1. Create New Railway Project

1. Go to [railway.app](https://railway.app)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub account
5. Select repository: `ArthurSrz/dust_gitlab`
6. Railway will auto-detect Node.js and begin deployment

### 2. Configure Environment Variables

In the Railway dashboard, go to **Variables** tab and add:

| Variable | Value | Description |
|----------|-------|-------------|
| `GITLAB_PERSONAL_ACCESS_TOKEN` | `glpat-xxxxxxxxxxxxx` | Your GitLab PAT |
| `GITLAB_API_URL` | `https://gitlab.com/api/v4` | GitLab API endpoint |
| `MCP_AUTH_SECRET` | `<random-secret>` | Auth token for Dust.tt |
| `NODE_ENV` | `production` | Environment mode |

**To generate a secure random secret:**
```bash
# macOS/Linux
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Get Your Public URL

1. In Railway dashboard, go to **Settings** tab
2. Scroll to **Networking** section
3. Click **"Generate Domain"**
4. Your URL will be: `https://your-project.up.railway.app`

Note the URL - you'll need it for Dust.tt configuration.

### 4. Verify Deployment

Test your deployed server:

```bash
# Health check (no auth required)
curl https://your-project.up.railway.app/health

# Should return:
# {"status":"ok","service":"dust-gitlab-mcp","version":"1.0.0","timestamp":"..."}

# Test SSE endpoint (requires auth)
curl -H "Authorization: Bearer <your-MCP_AUTH_SECRET>" \
     https://your-project.up.railway.app/sse
```

### 5. Configure Dust.tt

1. Go to **Dust.tt → Spaces → Tools → Add Tool**
2. Select **"Remote MCP Server"**
3. Configure:
   - **Name**: `GitLab`
   - **URL**: `https://your-project.up.railway.app/sse`
   - **Authentication Type**: `Bearer Token`
   - **Token**: Your `MCP_AUTH_SECRET` value
4. Click **"Test Connection"**
5. Dust.tt will auto-discover available GitLab tools
6. Click **"Save"**

### 6. Test in Dust Agent

Create a test agent in Dust.tt and try these queries:

- "List all my GitLab projects"
- "Show me open issues in project veltys/my-project"
- "Get the README.md file from veltys/my-project"
- "What are the recent commits on the main branch?"

## Railway Features

### Auto-Deployment

Railway automatically deploys on git push to main branch:

```bash
git add .
git commit -m "Update server"
git push origin main
# Railway automatically detects push and redeploys
```

### Logs

View real-time logs in Railway dashboard:
1. Go to your project
2. Click **"Deployments"** tab
3. Click on the latest deployment
4. View logs in the console

Or use Railway CLI:
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to project
railway link

# View logs
railway logs --follow
```

### Scaling

Free tier limits:
- **Memory**: 512 MB
- **CPU**: Shared vCPU
- **Execution time**: No timeout (unlike Vercel's 10s)
- **Monthly usage**: 500 hours free

For higher limits, upgrade to Pro plan ($5/month).

### Custom Domain (Optional)

Add your own domain:
1. Railway dashboard → **Settings** → **Networking**
2. Click **"Custom Domain"**
3. Enter your domain (e.g., `gitlab-mcp.example.com`)
4. Add CNAME record to your DNS:
   ```
   gitlab-mcp.example.com → your-project.up.railway.app
   ```

## Environment Management

### Development vs. Production

Railway automatically sets `NODE_ENV=production`. To test locally:

```bash
# Local development
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

### Updating Environment Variables

1. Railway dashboard → **Variables** tab
2. Edit variable value
3. Railway automatically restarts the service

Or use Railway CLI:
```bash
railway variables set GITLAB_PERSONAL_ACCESS_TOKEN=glpat-newtoken
```

## Troubleshooting

### Deployment Failed

Check build logs in Railway dashboard:
1. Go to **Deployments** tab
2. Click failed deployment
3. Review build logs

Common issues:
- Missing dependencies: `npm install` should run automatically
- TypeScript errors: Run `npm run build` locally first
- Port binding: Railway provides `PORT` env var automatically

### Service Not Responding

Check logs for errors:
```bash
railway logs --follow
```

Verify environment variables are set:
```bash
railway variables
```

### Authentication Errors

Verify `MCP_AUTH_SECRET` matches between:
- Railway environment variables
- Dust.tt Remote MCP Server configuration

Test auth manually:
```bash
curl -v -H "Authorization: Bearer <your-secret>" \
     https://your-project.up.railway.app/sse
```

### GitLab API Errors

Test GitLab token manually:
```bash
curl --header "PRIVATE-TOKEN: <your-gitlab-token>" \
     "https://gitlab.com/api/v4/user"
```

Should return your GitLab user details.

## Monitoring

### Health Check

Railway can monitor your service health:
1. Dashboard → **Settings** → **Health Check**
2. Set path: `/health`
3. Railway will automatically restart if health check fails

### Uptime Monitoring (External)

Consider using external monitoring:
- [UptimeRobot](https://uptimerobot.com) (free)
- [Pingdom](https://www.pingdom.com)
- [Better Uptime](https://betteruptime.com)

Monitor URL: `https://your-project.up.railway.app/health`

## Cost Estimation

### Free Tier (Starter Plan)

- **Cost**: $0/month
- **Usage**: 500 hours/month free (16.6 hours/day)
- **Memory**: 512 MB
- **Limits**: Sufficient for development and light production use

### Pro Plan

- **Cost**: $5/month
- **Usage**: Unlimited execution time
- **Memory**: Up to 8 GB
- **Features**: Priority support, faster builds

### Typical Usage

For Dust.tt integration with moderate usage:
- ~1-2 requests/minute average
- ~100-200 MB memory usage
- Free tier should be sufficient

## Security Checklist

Before going to production:

- [ ] GitLab PAT stored securely in Railway variables
- [ ] MCP_AUTH_SECRET is strong (32+ random characters)
- [ ] HTTPS enabled (automatic with Railway)
- [ ] GitLab token has minimal required scopes (`api`, `read_repository`)
- [ ] Railway project access restricted to team members
- [ ] Regular token rotation schedule (quarterly)

## Backup & Recovery

### Configuration Backup

Save your Railway configuration:
```bash
# Export environment variables
railway variables > railway-env-backup.txt

# Add to .gitignore
echo "railway-env-backup.txt" >> .gitignore
```

### Recovery

If deployment fails, roll back:
1. Railway dashboard → **Deployments**
2. Find last working deployment
3. Click **"Redeploy"**

Or rollback via CLI:
```bash
railway rollback
```

## Next Steps

After successful deployment:

1. **Test thoroughly** with Dust.tt agents
2. **Monitor logs** for first 24 hours
3. **Set up alerts** for health check failures
4. **Document** your GitLab project structure for agents
5. **Create** example Dust workflows using GitLab tools

## Support

- **Railway docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **Project issues**: https://github.com/ArthurSrz/dust_gitlab/issues

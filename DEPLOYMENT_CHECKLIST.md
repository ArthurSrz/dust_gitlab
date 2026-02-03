# Deployment Checklist

Use this checklist to deploy the Dust-GitLab MCP server to Railway.

## Pre-Deployment

### 1. GitLab Setup
- [ ] Create GitLab Personal Access Token
  - Go to GitLab → Preferences → Access Tokens
  - Name: `dust-mcp-server`
  - Scopes: ✅ `api`, ✅ `read_repository`
  - Copy token (starts with `glpat-`)

- [ ] Verify access to Veltys organization
  - Check you're a member of Veltys GitLab group
  - Test token:
    ```bash
    curl --header "PRIVATE-TOKEN: glpat-xxx" \
         "https://gitlab.com/api/v4/groups/veltys/projects"
    ```

### 2. Generate MCP Authentication Secret
- [ ] Create strong random secret
  ```bash
  openssl rand -base64 32
  # Or
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```

- [ ] Save this secret securely (you'll need it for Dust.tt)

## Railway Deployment

### 3. Create Railway Project
- [ ] Go to [railway.app](https://railway.app)
- [ ] Sign in with GitHub account
- [ ] Click "New Project"
- [ ] Select "Deploy from GitHub repo"
- [ ] Authorize Railway to access your GitHub
- [ ] Select repository: `ArthurSrz/dust_gitlab`
- [ ] Wait for initial build to complete

### 4. Configure Environment Variables
- [ ] Go to Railway dashboard → Variables tab
- [ ] Add the following variables:

| Variable | Value | Example |
|----------|-------|---------|
| `GITLAB_PERSONAL_ACCESS_TOKEN` | Your GitLab PAT | `glpat-xxxxxxxxxxxxx` |
| `GITLAB_API_URL` | GitLab API endpoint | `https://gitlab.com/api/v4` |
| `MCP_AUTH_SECRET` | Random secret from step 2 | `a1b2c3d4e5f6g7h8i9j0...` |
| `NODE_ENV` | Environment mode | `production` |

- [ ] Click "Deploy" to restart with new variables

### 5. Generate Public URL
- [ ] Railway dashboard → Settings tab
- [ ] Scroll to "Networking" section
- [ ] Click "Generate Domain"
- [ ] Copy your URL: `https://your-project.up.railway.app`

## Verification

### 6. Test Deployment
- [ ] Test health endpoint (no auth required):
  ```bash
  curl https://your-project.up.railway.app/health
  ```
  Expected response:
  ```json
  {"status":"ok","service":"dust-gitlab-mcp","version":"1.0.0","timestamp":"..."}
  ```

- [ ] Test SSE endpoint (with auth):
  ```bash
  curl -H "Authorization: Bearer <your-MCP_AUTH_SECRET>" \
       https://your-project.up.railway.app/sse
  ```
  Should establish SSE connection (doesn't close immediately)

- [ ] Check Railway logs for any errors:
  - Railway dashboard → Deployments → Latest deployment → View logs
  - Should see: `✅ Dust-GitLab MCP Server running on port XXXX`

## Dust.tt Integration

### 7. Add Remote MCP Server to Dust.tt
- [ ] Log in to Dust.tt
- [ ] Go to your Workspace/Space
- [ ] Navigate to: Tools → Add Tool
- [ ] Select "Remote MCP Server"
- [ ] Fill in configuration:
  - **Name**: `GitLab`
  - **Description**: `Access GitLab projects, issues, MRs, and code`
  - **URL**: `https://your-project.up.railway.app/sse`
  - **Authentication Type**: `Bearer Token`
  - **Token**: Your `MCP_AUTH_SECRET` value

- [ ] Click "Test Connection"
- [ ] Verify "Connection successful"
- [ ] Wait for tool discovery to complete
- [ ] Verify GitLab tools appear in the list:
  - `list_projects`
  - `get_project`
  - `list_issues`
  - `get_file_contents`
  - etc. (15+ tools)

- [ ] Click "Save"

### 8. Test in Dust Agent
- [ ] Create a new Dust Agent (or use existing one)
- [ ] Enable GitLab tool in agent configuration
- [ ] Test with simple queries:

  **Query 1: List projects**
  ```
  List all my GitLab projects
  ```
  Expected: Agent lists your accessible GitLab projects

  **Query 2: Get issues**
  ```
  Show me open issues in project veltys/my-project
  ```
  Expected: Agent lists open issues from specified project

  **Query 3: Read file**
  ```
  Get the contents of README.md from veltys/my-project
  ```
  Expected: Agent retrieves and displays file contents

  **Query 4: Recent commits**
  ```
  What are the recent commits on the main branch of veltys/my-project?
  ```
  Expected: Agent lists recent commits

- [ ] Verify all queries work correctly
- [ ] Check Railway logs for request activity

## Post-Deployment

### 9. Documentation
- [ ] Document your Railway URL in team documentation
- [ ] Save `MCP_AUTH_SECRET` in team password manager
- [ ] Document GitLab token rotation schedule (recommended: quarterly)

### 10. Monitoring Setup (Optional)
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom)
- [ ] Configure Railway health check:
  - Dashboard → Settings → Health Check
  - Path: `/health`
  - Interval: 60 seconds

- [ ] Set up Railway email/Slack alerts
- [ ] Monitor Railway usage:
  - Dashboard → Metrics tab
  - Check memory usage (should be < 200 MB)
  - Check execution hours (free tier: 500 hours/month)

### 11. Security Checklist
- [ ] GitLab PAT has minimal required scopes (`api`, `read_repository`)
- [ ] `MCP_AUTH_SECRET` is strong (32+ characters)
- [ ] Environment variables stored securely in Railway (not in code)
- [ ] Railway project access restricted to team members only
- [ ] HTTPS enabled (automatic with Railway)
- [ ] Plan token rotation schedule (add to calendar)

## Troubleshooting

If something doesn't work, check:

1. **Railway Logs**: Dashboard → Deployments → Latest → View Logs
2. **Environment Variables**: Dashboard → Variables (verify all 4 are set)
3. **GitLab Token**: Test manually with curl
4. **MCP Auth**: Verify secret matches between Railway and Dust.tt
5. **Networking**: Ensure Railway domain is generated and accessible

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed solutions.

## Rollback Plan

If deployment fails:

1. **Railway**: Dashboard → Deployments → Find last working deployment → Redeploy
2. **Environment**: Check Railway variables match this checklist
3. **Code**: Revert to last known good commit in GitHub
4. **Support**: Create issue at https://github.com/ArthurSrz/dust_gitlab/issues

## Success Criteria

✅ All checks passed when:
- Health endpoint returns `{"status":"ok"}`
- SSE endpoint accepts authenticated connections
- Dust.tt successfully discovers 15+ GitLab tools
- Test queries in Dust agent return expected results
- Railway logs show no errors
- Memory usage stable (< 300 MB)

## Next Steps After Successful Deployment

1. **Create example Dust workflows** using GitLab tools
2. **Document common queries** for your team
3. **Set up dashboards** in Dust.tt for GitLab metrics
4. **Schedule token rotation** (every 90 days)
5. **Monitor usage** and optimize if needed

---

**Deployment Date**: ___________
**Railway URL**: ___________
**Deployed By**: ___________
**Next Token Rotation**: ___________ (90 days from deployment)

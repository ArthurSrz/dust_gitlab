# GitLab MCP Server - API Reference

This document describes all available GitLab operations exposed through the MCP server.

## Projects

### `list_projects`

List all accessible GitLab projects.

**Parameters:**
- `visibility` (optional): Filter by visibility (`public`, `internal`, `private`)
- `owned` (optional): Only projects owned by authenticated user (boolean)
- `membership` (optional): Only projects user is a member of (boolean)
- `per_page` (optional): Results per page (default: 20, max: 100)
- `page` (optional): Page number (default: 1)

**Example:**
```json
{
  "method": "list_projects",
  "params": {
    "membership": true,
    "per_page": 50
  }
}
```

### `get_project`

Get details for a specific project.

**Parameters:**
- `project_id` (required): Project ID or path (e.g., `123` or `veltys/my-project`)

**Example:**
```json
{
  "method": "get_project",
  "params": {
    "project_id": "veltys/my-project"
  }
}
```

### `search_projects`

Search for projects by name.

**Parameters:**
- `search` (required): Search query
- `per_page` (optional): Results per page (default: 20)

**Example:**
```json
{
  "method": "search_projects",
  "params": {
    "search": "frontend",
    "per_page": 10
  }
}
```

## Issues

### `list_issues`

List issues for a project.

**Parameters:**
- `project_id` (required): Project ID or path
- `state` (optional): Filter by state (`opened`, `closed`, `all`)
- `labels` (optional): Comma-separated list of label names
- `milestone` (optional): Milestone title
- `author_id` (optional): Filter by author user ID
- `assignee_id` (optional): Filter by assignee user ID
- `per_page` (optional): Results per page

**Example:**
```json
{
  "method": "list_issues",
  "params": {
    "project_id": "veltys/my-project",
    "state": "opened",
    "labels": "bug,critical"
  }
}
```

### `get_issue`

Get details for a specific issue.

**Parameters:**
- `project_id` (required): Project ID or path
- `issue_iid` (required): Issue IID (internal ID)

**Example:**
```json
{
  "method": "get_issue",
  "params": {
    "project_id": "veltys/my-project",
    "issue_iid": 42
  }
}
```

### `create_issue`

Create a new issue.

**Parameters:**
- `project_id` (required): Project ID or path
- `title` (required): Issue title
- `description` (optional): Issue description
- `labels` (optional): Comma-separated label names
- `assignee_ids` (optional): Array of user IDs to assign
- `milestone_id` (optional): Milestone ID

**Example:**
```json
{
  "method": "create_issue",
  "params": {
    "project_id": "veltys/my-project",
    "title": "Fix authentication bug",
    "description": "Users cannot login with SSO",
    "labels": "bug,priority::high"
  }
}
```

### `update_issue`

Update an existing issue.

**Parameters:**
- `project_id` (required): Project ID or path
- `issue_iid` (required): Issue IID
- `title` (optional): New title
- `description` (optional): New description
- `state_event` (optional): `close` or `reopen`
- `labels` (optional): Comma-separated label names (replaces existing)
- `add_labels` (optional): Comma-separated labels to add
- `remove_labels` (optional): Comma-separated labels to remove

**Example:**
```json
{
  "method": "update_issue",
  "params": {
    "project_id": "veltys/my-project",
    "issue_iid": 42,
    "state_event": "close",
    "add_labels": "resolved"
  }
}
```

## Merge Requests

### `list_merge_requests`

List merge requests for a project.

**Parameters:**
- `project_id` (required): Project ID or path
- `state` (optional): Filter by state (`opened`, `closed`, `merged`, `all`)
- `author_id` (optional): Filter by author
- `assignee_id` (optional): Filter by assignee
- `reviewer_id` (optional): Filter by reviewer
- `labels` (optional): Comma-separated labels
- `per_page` (optional): Results per page

**Example:**
```json
{
  "method": "list_merge_requests",
  "params": {
    "project_id": "veltys/my-project",
    "state": "opened",
    "labels": "ready-for-review"
  }
}
```

### `get_merge_request`

Get details for a specific merge request.

**Parameters:**
- `project_id` (required): Project ID or path
- `merge_request_iid` (required): MR IID

**Example:**
```json
{
  "method": "get_merge_request",
  "params": {
    "project_id": "veltys/my-project",
    "merge_request_iid": 15
  }
}
```

### `create_merge_request`

Create a new merge request.

**Parameters:**
- `project_id` (required): Project ID or path
- `source_branch` (required): Source branch name
- `target_branch` (required): Target branch name
- `title` (required): MR title
- `description` (optional): MR description
- `assignee_ids` (optional): Array of user IDs
- `reviewer_ids` (optional): Array of reviewer user IDs
- `labels` (optional): Comma-separated labels

**Example:**
```json
{
  "method": "create_merge_request",
  "params": {
    "project_id": "veltys/my-project",
    "source_branch": "feature/new-auth",
    "target_branch": "main",
    "title": "Add OAuth authentication",
    "description": "Implements OAuth2 flow with Google and GitHub providers"
  }
}
```

## Repository

### `list_files`

List files and directories in a repository path.

**Parameters:**
- `project_id` (required): Project ID or path
- `path` (optional): Directory path (default: root)
- `ref` (optional): Branch/tag/commit reference (default: default branch)
- `recursive` (optional): Recursive listing (boolean)

**Example:**
```json
{
  "method": "list_files",
  "params": {
    "project_id": "veltys/my-project",
    "path": "src/components",
    "ref": "main"
  }
}
```

### `get_file_contents`

Get contents of a file.

**Parameters:**
- `project_id` (required): Project ID or path
- `file_path` (required): Full file path
- `ref` (optional): Branch/tag/commit reference

**Example:**
```json
{
  "method": "get_file_contents",
  "params": {
    "project_id": "veltys/my-project",
    "file_path": "README.md",
    "ref": "main"
  }
}
```

**Returns:** Base64-encoded file content (automatically decoded by MCP server)

### `search_code`

Search for code in repositories.

**Parameters:**
- `search` (required): Search query
- `project_id` (optional): Limit to specific project
- `ref` (optional): Branch/tag to search
- `per_page` (optional): Results per page

**Example:**
```json
{
  "method": "search_code",
  "params": {
    "search": "function authenticate",
    "project_id": "veltys/my-project"
  }
}
```

## Commits

### `list_commits`

List commits in a repository.

**Parameters:**
- `project_id` (required): Project ID or path
- `ref_name` (optional): Branch/tag name
- `since` (optional): ISO 8601 date (e.g., `2024-01-01T00:00:00Z`)
- `until` (optional): ISO 8601 date
- `path` (optional): Filter by file path
- `per_page` (optional): Results per page

**Example:**
```json
{
  "method": "list_commits",
  "params": {
    "project_id": "veltys/my-project",
    "ref_name": "main",
    "since": "2024-01-01T00:00:00Z",
    "per_page": 50
  }
}
```

### `get_commit`

Get details for a specific commit.

**Parameters:**
- `project_id` (required): Project ID or path
- `sha` (required): Commit SHA

**Example:**
```json
{
  "method": "get_commit",
  "params": {
    "project_id": "veltys/my-project",
    "sha": "a1b2c3d4e5f6"
  }
}
```

### `get_commit_diff`

Get diff for a commit.

**Parameters:**
- `project_id` (required): Project ID or path
- `sha` (required): Commit SHA

**Example:**
```json
{
  "method": "get_commit_diff",
  "params": {
    "project_id": "veltys/my-project",
    "sha": "a1b2c3d4e5f6"
  }
}
```

## Branches

### `list_branches`

List branches in a repository.

**Parameters:**
- `project_id` (required): Project ID or path
- `search` (optional): Search term to filter branches
- `per_page` (optional): Results per page

**Example:**
```json
{
  "method": "list_branches",
  "params": {
    "project_id": "veltys/my-project",
    "search": "feature/"
  }
}
```

### `get_branch`

Get details for a specific branch.

**Parameters:**
- `project_id` (required): Project ID or path
- `branch` (required): Branch name

**Example:**
```json
{
  "method": "get_branch",
  "params": {
    "project_id": "veltys/my-project",
    "branch": "main"
  }
}
```

### `create_branch`

Create a new branch.

**Parameters:**
- `project_id` (required): Project ID or path
- `branch` (required): New branch name
- `ref` (required): Source branch/tag/commit

**Example:**
```json
{
  "method": "create_branch",
  "params": {
    "project_id": "veltys/my-project",
    "branch": "feature/new-dashboard",
    "ref": "main"
  }
}
```

## Pipelines

### `list_pipelines`

List CI/CD pipelines for a project.

**Parameters:**
- `project_id` (required): Project ID or path
- `ref` (optional): Filter by branch/tag
- `status` (optional): Filter by status (`running`, `pending`, `success`, `failed`, `canceled`, `skipped`)
- `per_page` (optional): Results per page

**Example:**
```json
{
  "method": "list_pipelines",
  "params": {
    "project_id": "veltys/my-project",
    "ref": "main",
    "status": "failed"
  }
}
```

### `get_pipeline_status`

Get status of a specific pipeline.

**Parameters:**
- `project_id` (required): Project ID or path
- `pipeline_id` (required): Pipeline ID

**Example:**
```json
{
  "method": "get_pipeline_status",
  "params": {
    "project_id": "veltys/my-project",
    "pipeline_id": 12345
  }
}
```

## Response Format

All responses follow the MCP JSON-RPC format:

**Success:**
```json
{
  "jsonrpc": "2.0",
  "id": "request_id",
  "result": {
    // GitLab API response data
  }
}
```

**Error:**
```json
{
  "jsonrpc": "2.0",
  "id": "request_id",
  "error": {
    "code": -32000,
    "message": "Error description",
    "data": {
      // Additional error details
    }
  }
}
```

## Rate Limiting

GitLab API rate limits:
- **Free tier**: 5,000 requests/minute per user
- **Premium/Ultimate**: 10,000 requests/minute per user

The MCP server does not implement client-side rate limiting. Monitor your usage through GitLab's rate limit headers in responses.

## Common Patterns

### Listing Veltys Organization Projects

```json
{
  "method": "search_projects",
  "params": {
    "search": "veltys",
    "membership": true
  }
}
```

### Finding Open Issues with Specific Labels

```json
{
  "method": "list_issues",
  "params": {
    "project_id": "veltys/my-project",
    "state": "opened",
    "labels": "bug,priority::high"
  }
}
```

### Getting Recent Commits on Main Branch

```json
{
  "method": "list_commits",
  "params": {
    "project_id": "veltys/my-project",
    "ref_name": "main",
    "since": "2024-01-01T00:00:00Z",
    "per_page": 20
  }
}
```

### Reading Configuration File

```json
{
  "method": "get_file_contents",
  "params": {
    "project_id": "veltys/my-project",
    "file_path": "config/production.yml",
    "ref": "main"
  }
}
```

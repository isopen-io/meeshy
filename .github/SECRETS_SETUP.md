# GitHub Secrets Configuration

## Required Secrets for Docker CI/CD

Configure these secrets in your GitHub repository:
**Settings > Secrets and variables > Actions > New repository secret**

### Docker Hub Authentication

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username | Your Docker Hub account username |
| `DOCKERHUB_TOKEN` | Docker Hub access token | [Create at Docker Hub](https://hub.docker.com/settings/security) |

### Creating Docker Hub Access Token

1. Go to [Docker Hub Security Settings](https://hub.docker.com/settings/security)
2. Click **New Access Token**
3. Name: `github-actions-meeshy`
4. Permissions: **Read, Write, Delete**
5. Click **Generate**
6. Copy the token immediately (it won't be shown again)

### Setting Up in GitHub

```bash
# Using GitHub CLI
gh secret set DOCKERHUB_USERNAME --body "isopen"
gh secret set DOCKERHUB_TOKEN --body "your-access-token-here"
```

Or via the GitHub UI:
1. Go to your repository on GitHub
2. Click **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Add each secret with the exact name specified above

## Workflow Triggers

### Automatic Builds

The `docker-build-push.yml` workflow triggers on:

- **Push to main/master/develop** - Builds changed services only
- **Tag push (v*.*.*)** - Builds all services with the tag version
- **Manual dispatch** - Choose services and options

### Creating a Release

Use the **Release** workflow for version bumps:

1. Go to **Actions** > **Release**
2. Click **Run workflow**
3. Select:
   - **Version type**: `patch`, `minor`, `major`, or `prerelease`
   - **Prerelease tag**: `beta`, `alpha`, `rc` (if applicable)
   - **Services**: `all` or specific services

### Manual Build

To manually trigger a build:

1. Go to **Actions** > **Docker Build & Push**
2. Click **Run workflow**
3. Select services to build
4. Choose whether to push to registry

## Local Testing

Before pushing, test builds locally:

```bash
# Build gateway locally
./scripts/docker-build.sh gateway

# Build and push all services
./scripts/docker-build.sh all --push

# Bump version then build
./scripts/bump-version.sh patch gateway
./scripts/docker-build.sh gateway --push
```

## Verification

After setup, verify with a test run:

```bash
# Check secrets are set (via GitHub CLI)
gh secret list

# Trigger a manual build
gh workflow run docker-build-push.yml \
  -f services=gateway \
  -f push_to_registry=true
```

## Troubleshooting

### "unauthorized: authentication required"
- Verify `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` are correctly set
- Regenerate the Docker Hub access token if expired

### "denied: requested access to the resource is denied"
- Ensure the Docker Hub token has write permissions
- Verify the namespace `isopen` exists and you have push access

### Build fails on ARM64
- QEMU emulation is automatic in GitHub Actions
- For local builds, ensure Docker Desktop has multi-arch enabled

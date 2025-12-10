---
name: 🔧 Installation
about: Report installation or setup issues
title: '[INSTALL] '
labels: ['installation', 'needs-triage']
assignees: ['jcnm']
---

## 🔧 Installation Issue

**A clear and concise description of the installation or setup problem.**

## 🎯 Issue Type

**What type of installation issue are you experiencing?**

- [ ] **Docker Installation**: Problems with Docker or Docker Compose
- [ ] **Local Development**: Problems with local development setup
- [ ] **Production Deployment**: Problems with production deployment
- [ ] **Dependencies**: Problems with Node.js, Python, or other dependencies
- [ ] **Database Setup**: Problems with PostgreSQL or Redis
- [ ] **Environment Variables**: Problems with configuration
- [ ] **Network Issues**: Problems with ports, connectivity, or CORS
- [ ] **Permission Issues**: Problems with file permissions or access
- [ ] **Other**: [Please specify]

## 🖥️ Environment Information

### System Information
- **OS**: [e.g. macOS 14.0, Ubuntu 22.04, Windows 11]
- **Architecture**: [e.g. x86_64, ARM64]
- **Shell**: [e.g. bash, zsh, PowerShell]
- **Package Manager**: [e.g. npm, pnpm, yarn, pip, conda]

### Software Versions
- **Node.js**: [e.g. 22.0.0]
- **Python**: [e.g. 3.12.0]
- **Docker**: [e.g. 24.0.0]
- **Docker Compose**: [e.g. 2.20.0]
- **PostgreSQL**: [e.g. 15.0]
- **Redis**: [e.g. 7.0]

### Meeshy Version
- **Version**: [e.g. 0.5.4-alpha]
- **Installation Method**: [e.g. Docker Compose, Local Development, Production]
- **Branch/Commit**: [e.g. main, develop, specific commit hash]

## 🔄 Steps to Reproduce

**Detailed steps to reproduce the installation issue:**

1. **Prerequisites**: [What you had installed before]
2. **Installation Command**: [The exact command you ran]
3. **Expected Result**: [What should have happened]
4. **Actual Result**: [What actually happened]

### Example
```bash
# Step 1: Clone repository
git clone https://github.com/jcnm/meeshy.git
cd meeshy

# Step 2: Start services
docker-compose up -d

# Step 3: Expected result
# Services should start successfully

# Step 4: Actual result
# Error: port 3000 already in use
```

## ❌ Error Messages

**Please paste any error messages or output:**

```bash
# Error output here
```

### Logs
```bash
# Docker logs
docker-compose logs

# Application logs
docker-compose logs gateway
docker-compose logs translator
docker-compose logs frontend
```

## 🔍 Investigation Steps

**What have you already tried to resolve this issue?**

- [ ] **Checked Prerequisites**: Verified all required software is installed
- [ ] **Updated Software**: Updated to latest versions
- [ ] **Cleared Cache**: Cleared Docker cache, npm cache, etc.
- [ ] **Checked Ports**: Verified ports are not in use
- [ ] **Checked Permissions**: Verified file and directory permissions
- [ ] **Checked Network**: Verified network connectivity
- [ ] **Checked Resources**: Verified sufficient disk space and memory
- [ ] **Searched Issues**: Checked existing GitHub issues
- [ ] **Read Documentation**: Reviewed installation documentation
- [ ] **Tried Alternatives**: Tried different installation methods

## 🎯 Installation Method

**Which installation method are you using?**

### Docker Compose (Recommended)
```bash
# Microservices setup
docker-compose up -d

# Unified setup
docker-compose -f docker-compose.unified.yml up -d
```

### Local Development
```bash
# Install dependencies
pnpm install

# Setup environment
cp .env.example .env

# Start development
pnpm dev
```

### Production Deployment
```bash
# Production setup
docker-compose -f docker-compose.prod.yml up -d
```

## 🔧 Configuration

### Environment Variables
```bash
# Please provide your environment variables (remove sensitive data)
NODE_ENV=development
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
# ... other variables
```

### Docker Configuration
```bash
# Docker version
docker --version
docker-compose --version

# Docker info
docker info
```

## 🚀 Expected Behavior

**What should happen after successful installation?**

- [ ] **Services Start**: All Docker containers start successfully
- [ ] **Database Ready**: PostgreSQL database is accessible
- [ ] **Cache Ready**: Redis cache is accessible
- [ ] **API Accessible**: Gateway API responds to requests
- [ ] **Frontend Accessible**: Frontend application loads in browser
- [ ] **Translation Working**: Translation service responds to requests
- [ ] **WebSocket Working**: Real-time messaging works
- [ ] **Health Checks Pass**: All health check endpoints return 200

## ❌ Current Behavior

**What is actually happening?**

- [ ] **Services Fail**: Docker containers fail to start
- [ ] **Database Issues**: Cannot connect to database
- [ ] **Cache Issues**: Cannot connect to Redis
- [ ] **API Issues**: Gateway API not responding
- [ ] **Frontend Issues**: Frontend application not loading
- [ ] **Translation Issues**: Translation service not working
- [ ] **WebSocket Issues**: Real-time messaging not working
- [ ] **Health Check Failures**: Health check endpoints failing

## 🎯 Priority

**How urgent is this installation issue?**

- [ ] **Critical**: Cannot install or run the application
- [ ] **High**: Major functionality not working
- [ ] **Medium**: Some features not working
- [ ] **Low**: Minor issues or workarounds available

## 🔗 Related Issues

**Is this issue related to other problems?**

- **Similar Issues**: [Links to similar GitHub issues]
- **Dependencies**: [Related dependency issues]
- **Environment**: [Related environment issues]

## 💡 Possible Solutions

**If you have ideas about how to fix this, please share them:**

### Workarounds
```bash
# Any workarounds you've found
```

### Alternative Methods
```bash
# Alternative installation methods you've tried
```

## 📋 Checklist

**Please confirm you have completed these steps:**

### Prerequisites
- [ ] **Docker**: Docker and Docker Compose installed
- [ ] **Node.js**: Node.js 22+ installed
- [ ] **Python**: Python 3.12+ installed (for local development)
- [ ] **Git**: Git installed
- [ ] **Ports**: Required ports available (3000, 3100, 8000, 5432, 6379)

### Installation
- [ ] **Repository**: Repository cloned successfully
- [ ] **Environment**: Environment variables configured
- [ ] **Dependencies**: Dependencies installed
- [ ] **Services**: Services started successfully
- [ ] **Health Checks**: Health checks passing

### Verification
- [ ] **Frontend**: Frontend accessible at http://localhost:3100
- [ ] **Gateway**: Gateway API accessible at http://localhost:3000
- [ ] **Translator**: Translator service accessible at http://localhost:8000
- [ ] **Database**: Database connection working
- [ ] **Cache**: Redis connection working

## 📝 Additional Context

**Add any other context about the installation issue here.**

### System Resources
- **CPU**: [e.g. 4 cores, 8 cores]
- **Memory**: [e.g. 8GB, 16GB]
- **Disk Space**: [e.g. 50GB available]
- **Network**: [e.g. Local network, VPN, Proxy]

### Previous Installations
- **Previous Versions**: [Any previous versions installed]
- **Previous Issues**: [Any previous installation issues]
- **Clean Install**: [Whether this is a clean installation]

---

**Thank you for your detailed report!** 🔧✨

<!-- 
Please ensure you have:
- [ ] Provided complete environment information
- [ ] Included error messages and logs
- [ ] Listed all investigation steps taken
- [ ] Confirmed prerequisites are met
- [ ] Used appropriate labels
-->

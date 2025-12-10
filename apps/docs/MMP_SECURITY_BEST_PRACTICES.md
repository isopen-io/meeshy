# MMP Security & Best Practices Documentation

## Overview

The Meeshy Message Publisher (MMP) v1.0.0 implements enterprise-grade security practices and follows cloud-native principles for reliable, secure message publishing.

## Security Features

### 1. Secure Credential Handling

#### Password Security
- **History Disabled**: `HISTFILE=/dev/null` and `set +o history` prevent password logging
- **Secure Transmission**: Passwords never appear in command-line arguments when using environment variables
- **Secure Cleanup**: Credential files are securely wiped using `dd if=/dev/zero` before deletion
- **No Plaintext Logging**: Passwords are never logged in verbose mode

#### File Security
- **Restrictive Permissions**: Temporary files created with `chmod 600` (owner read/write only)
- **Secure Deletion**: Uses `shred` when available, falls back to zero-overwrite
- **Cookie Protection**: Session cookies stored in secure temporary files with automatic cleanup

#### Environment Variables
```bash
# Recommended: Use environment variables
export MEESHY_PASSWORD="$(cat ~/.meeshy/password)"

# Avoid: Command-line arguments (visible in process list)
# ./mmp.sh -p "password123"  # DON'T DO THIS
```

### 2. Input Validation & Sanitization

#### URL Validation
- RFC 3986 compliance check
- Protocol verification (https:// or http://)
- Injection attack prevention (blocks special characters: `'`, `"`, `` ` ``, `$`, `(`, `)`)

```bash
# Valid URLs
https://gate.meeshy.me
http://localhost:3001

# Invalid URLs (rejected)
javascript:alert(1)
file:///etc/passwd
https://evil.com$(malicious)
```

#### Username Validation
- Alphanumeric characters, underscore, and hyphen only
- Length: 3-32 characters
- Pattern: `^[a-zA-Z0-9_-]{3,32}$`

#### Conversation ID Validation
- Alphanumeric characters, underscore, and hyphen only
- Length: 1-64 characters
- Pattern: `^[a-zA-Z0-9_-]{1,64}$`

#### Language Code Validation
- ISO 639-1 compliance
- 2-3 lowercase letters
- Pattern: `^[a-z]{2,3}$`

#### Message Sanitization
- Maximum length: 10,000 characters
- Null byte detection (prevents binary injection)
- Proper JSON escaping via `jq`

### 3. Error Handling

#### Strict Mode
```bash
set -euo pipefail  # Exit on error, undefined vars, pipe failures
IFS=$'\n\t'        # Safer word splitting
```

#### Exit Codes (sysexits.h Convention)
| Code | Meaning | Usage |
|------|---------|-------|
| 0 | Success | Operation completed successfully |
| 1 | General error | Unexpected failures |
| 64 | Usage error | Invalid command-line arguments |
| 65 | Data error | Invalid input format |
| 66 | No input | File not found |
| 67 | No user | Authentication failed |
| 69 | Unavailable | Service unavailable |
| 71 | OS error | System operation failed |
| 73 | Can't create | File creation failed |
| 74 | I/O error | File read/write failed |
| 75 | Temp fail | Temporary network failure |
| 76 | Protocol | Protocol error |
| 77 | Permission denied | Access denied |
| 78 | Config error | Configuration error |

#### Cleanup on Exit
```bash
trap cleanup EXIT SIGHUP SIGINT SIGTERM
trap 'error_handler ${LINENO} ${BASH_LINENO} "$BASH_COMMAND"' ERR
```

All temporary files are securely deleted on:
- Normal exit
- Error conditions
- Signal interruption (Ctrl+C, SIGTERM, etc.)

### 4. Network Security

#### Connection Timeouts
- **Connect Timeout**: 10 seconds (configurable via `MEESHY_CONNECT_TIMEOUT`)
- **Max Timeout**: 30 seconds (configurable via `MEESHY_MAX_TIMEOUT`)
- **Prevents**: Hanging connections in cloud/network issues

#### Retry Logic
- **Max Retries**: 3 attempts (configurable via `MEESHY_MAX_RETRIES`)
- **Exponential Backoff**: 2s, 4s, 8s delay between retries
- **Prevents**: Transient network failures causing permanent errors

#### HTTP Security Headers
- `User-Agent: MMP/1.0.0` - Identifies client for monitoring
- `Content-Type: application/json` - Prevents content-type confusion
- `Authorization: Bearer <token>` - Standard token authentication

#### Request Security
```bash
# All requests use secure curl options
curl -s -w "\n%{http_code}" \
    --connect-timeout "$CONNECT_TIMEOUT" \
    --max-time "$MAX_TIMEOUT" \
    --retry 0 \
    -X "$METHOD" \
    "$URL"
```

## Multi-Platform Compatibility

### 1. Portable Shebang
```bash
#!/usr/bin/env bash
```
Works on Linux, macOS, BSD, and cloud containers without modification.

### 2. POSIX-Compatible Commands
All commands work across platforms:
- `date -u` - UTC timestamps
- `mktemp` - Secure temp file creation
- `dd` - Low-level file operations
- `curl` - HTTP client
- `jq` - JSON processing

### 3. Terminal Detection
```bash
if [[ -t 1 ]] && command -v tput &>/dev/null; then
    # Use colors
else
    # No colors (for CI/CD pipelines)
fi
```

### 4. Dependency Checking
Script validates required tools at startup:
```bash
Required: curl, jq, date, mktemp, dd
Optional: shred (for secure deletion)
```

## Cloud-Native Design

### 1. 12-Factor App Principles

#### Configuration via Environment
All configuration through environment variables:
```bash
MEESHY_API_URL          # API endpoint
MEESHY_PASSWORD         # Credentials
MEESHY_USERNAME         # User identity
MEESHY_CONVERSATION_ID  # Default conversation
MEESHY_LANGUAGE         # Default language
MEESHY_CONNECT_TIMEOUT  # Network tuning
MEESHY_MAX_TIMEOUT      # Network tuning
MEESHY_MAX_RETRIES      # Resilience tuning
```

#### Stateless Execution
- No persistent state between runs
- All context in environment or arguments
- Idempotent operations (safe to retry)

#### Logging to stderr
- All logs go to stderr (not stdout)
- Structured, parseable output
- Log levels: INFO, SUCCESS, ERROR, WARN, DEBUG

#### Process Cleanup
- Graceful shutdown on signals
- Automatic resource cleanup
- No orphaned processes

### 2. Container-Friendly

#### Minimal Dependencies
```dockerfile
# Typical container setup
FROM alpine:3.18
RUN apk add --no-cache bash curl jq coreutils
COPY mmp.sh /usr/local/bin/
```

#### Non-Interactive Mode
```bash
# CI/CD pipeline usage
export MEESHY_PASSWORD="${SECRET_PASSWORD}"
./mmp.sh -y -f announcement.txt
```

#### Exit Code Handling
```bash
# CI/CD integration
if ! ./mmp.sh -y "Deployment successful"; then
    echo "Failed to publish notification"
    exit 1
fi
```

### 3. Monitoring & Observability

#### Verbose Mode
```bash
./mmp.sh -v -f message.txt
# Outputs:
# [DEBUG] POST https://gate.meeshy.me/api/auth/login
# [DEBUG] Response code: 200
# [DEBUG] Token: eyJhbGciOiJIUzI1NiIs...
# [DEBUG] Message ID: 507f1f77bcf86cd799439011
```

#### Structured Logging
```
[INFO] Using default POST file
[SUCCESS] Message read from: POST
[STEP] Step 1/4: Authentication...
[DEBUG] POST https://gate.meeshy.me/api/auth/login
[SUCCESS] Authentication successful (User: meeshy)
[STEP] Step 2/4: Checking permissions...
[SUCCESS] Conversation found: meeshy (type: global)
[STEP] Step 3/4: Sending message...
[SUCCESS] Message published successfully!
[STEP] Step 4/4: Cleanup...
[INFO] POST file preserved
```

## Best Practices for Usage

### 1. Credential Management

#### Development
```bash
# Store in secure file
echo "your_password" > ~/.meeshy/password
chmod 600 ~/.meeshy/password
export MEESHY_PASSWORD="$(cat ~/.meeshy/password)"
```

#### Production
```bash
# Use cloud secret management
export MEESHY_PASSWORD="$(aws secretsmanager get-secret-value \
    --secret-id meeshy-publisher-password \
    --query SecretString --output text)"

# Or use HashiCorp Vault
export MEESHY_PASSWORD="$(vault kv get -field=password secret/meeshy/publisher)"
```

#### CI/CD
```yaml
# GitHub Actions example
- name: Publish announcement
  env:
    MEESHY_PASSWORD: ${{ secrets.MEESHY_PASSWORD }}
  run: |
    ./scripts/mmp.sh -y -f announcement.txt
```

### 2. Error Handling in Scripts

```bash
#!/bin/bash
set -euo pipefail

# Publish with proper error handling
if ! ./scripts/mmp.sh -y -f announcement.txt; then
    echo "Publication failed with exit code $?"
    # Send alert, rollback, etc.
    exit 1
fi

echo "Publication successful"
```

### 3. Automated Publishing

```bash
#!/bin/bash
# Daily digest publisher

# Generate message
cat > daily-digest.txt << EOF
Daily Update - $(date +%Y-%m-%d)

Today's stats:
- Active users: $(get_active_users)
- Messages sent: $(get_message_count)

Have a great day!
EOF

# Publish
export MEESHY_PASSWORD="$(get_secure_password)"
./scripts/mmp.sh -y \
    -c daily-digest \
    -f daily-digest.txt \
    --no-cleanup

# Archive
mv daily-digest.txt "archive/digest-$(date +%Y%m%d).txt"
```

### 4. Multi-Language Publishing

```bash
#!/bin/bash
# Publish in multiple languages

declare -A announcements=(
    ["en"]="Welcome to Meeshy!"
    ["fr"]="Bienvenue sur Meeshy!"
    ["es"]="¡Bienvenido a Meeshy!"
    ["de"]="Willkommen bei Meeshy!"
)

for lang in "${!announcements[@]}"; do
    echo "${announcements[$lang]}" | \
        ./scripts/mmp.sh -y -l "$lang" -c global-announcements
done
```

### 5. Health Checks

```bash
#!/bin/bash
# Health check: Can we publish to Meeshy?

timeout 60 ./scripts/mmp.sh -y \
    -c health-check \
    "Health check at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo "✓ Meeshy publishing healthy"
    exit 0
else
    echo "✗ Meeshy publishing failed (code: $exit_code)"
    exit 1
fi
```

## Security Checklist

Before deploying MMP in production:

- [ ] Password stored securely (vault, secrets manager, or encrypted file)
- [ ] File permissions set correctly (`chmod 600` for config files)
- [ ] No passwords in shell history or process list
- [ ] Network timeouts configured for your environment
- [ ] Retry logic tuned for your reliability requirements
- [ ] Exit codes properly handled in automation scripts
- [ ] Logs monitored for errors
- [ ] Non-interactive mode used in CI/CD
- [ ] Backup created before cleanup (or `--no-cleanup` used)
- [ ] Dependencies installed and verified

## Performance Tuning

### Network Conditions

#### Fast, reliable network
```bash
export MEESHY_CONNECT_TIMEOUT=5
export MEESHY_MAX_TIMEOUT=15
export MEESHY_MAX_RETRIES=2
```

#### Slow or unreliable network
```bash
export MEESHY_CONNECT_TIMEOUT=20
export MEESHY_MAX_TIMEOUT=60
export MEESHY_MAX_RETRIES=5
```

#### Local development
```bash
export MEESHY_CONNECT_TIMEOUT=2
export MEESHY_MAX_TIMEOUT=10
export MEESHY_MAX_RETRIES=1
export MEESHY_API_URL=http://localhost:3001
```

## Troubleshooting

### Enable Verbose Mode
```bash
./mmp.sh -v -f message.txt
```

### Check Dependencies
```bash
for cmd in curl jq date mktemp dd; do
    command -v $cmd && echo "✓ $cmd" || echo "✗ $cmd MISSING"
done
```

### Test API Connectivity
```bash
curl -v --connect-timeout 10 \
    https://gate.meeshy.me/api/health 2>&1 | grep -i "connected"
```

### Validate Configuration
```bash
# Check all environment variables
env | grep MEESHY_ | grep -v PASSWORD
```

### Debug Authentication
```bash
# Test login manually
curl -X POST https://gate.meeshy.me/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"meeshy","password":"your_password"}'
```

## Migration from Legacy Scripts

### From `announcement.sh`
```bash
# Old
./announcement.sh -f POST -u meeshy -p password

# New (with security improvements)
export MEESHY_PASSWORD="password"
./mmp.sh -f POST -u meeshy
```

### From `publish-announcement.sh`
```bash
# Old
export MEESHY_PASSWORD="password"
./publish-announcement.sh fr

# New
export MEESHY_PASSWORD="password"
./mmp.sh -l fr -f POST-fr
```

## Compliance & Standards

### Standards Followed
- **POSIX.1-2008**: Core shell scripting
- **RFC 3986**: URI syntax validation
- **ISO 639-1**: Language code validation
- **sysexits.h**: Standard exit codes
- **12-Factor App**: Cloud-native principles

### Security Standards
- **CWE-78**: Command injection prevention
- **CWE-89**: SQL injection prevention (via input validation)
- **CWE-200**: Information exposure prevention
- **CWE-311**: Credential encryption
- **CWE-676**: Dangerous function usage prevention

## License

This script is part of the Meeshy project. See LICENSE file.

---

**Meeshy - Breaking language barriers** 🌍

For support: https://meeshy.me/support


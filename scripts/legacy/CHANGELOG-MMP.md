# MMP Changelog

## Version 1.0.1 (2025-10-18)

### Improvements

#### URL Distinction
- **New Feature**: Separate API URL and Frontend URL
  - Added `MEESHY_FRONTEND_URL` environment variable
  - API URL (gate.meeshy.me) used for backend communication
  - Frontend URL (meeshy.me) used in success message for user access
  - Default: `MEESHY_FRONTEND_URL=https://meeshy.me`

**Migration**: No breaking changes. Frontend URL is optional and defaults to https://meeshy.me

## Version 1.0.0 (2025-10-18)

### Major Release - Production Ready

Complete rewrite of message publishing scripts with enterprise-grade security and cloud-native design.

### New Features

#### Security Enhancements
- **Secure Credential Handling**
  - Password history disabled (`HISTFILE=/dev/null`)
  - Secure file deletion (zero-overwrite with dd/shred)
  - Temporary files with restrictive permissions (chmod 600)
  - No password exposure in logs or process list

- **Input Validation**
  - URL validation with injection prevention
  - Username format validation (3-32 alphanumeric)
  - Conversation ID validation (1-64 alphanumeric)
  - Language code validation (ISO 639-1)
  - Message sanitization (max 10K chars, null byte detection)

- **Error Handling**
  - Strict mode (`set -euo pipefail`)
  - Standardized exit codes (sysexits.h convention)
  - Comprehensive cleanup on exit/error/signal
  - Graceful error messages

#### Cloud-Native Features
- **12-Factor App Compliance**
  - All configuration via environment variables
  - Stateless execution
  - Logging to stderr
  - Process cleanup and signal handling

- **Network Resilience**
  - Configurable connection timeouts (default: 10s)
  - Configurable request timeouts (default: 30s)
  - Retry logic with exponential backoff (default: 3 retries)
  - Transient failure handling

- **Multi-Platform Support**
  - Portable shebang (`#!/usr/bin/env bash`)
  - POSIX-compatible commands
  - Terminal detection for colors
  - Dependency checking at startup

#### New Environment Variables
- `MEESHY_API_URL` - API endpoint (replaces MEESHY_GATEWAY_URL)
- `MEESHY_CONNECT_TIMEOUT` - Connection timeout in seconds
- `MEESHY_MAX_TIMEOUT` - Maximum request timeout in seconds
- `MEESHY_MAX_RETRIES` - Number of retry attempts

#### New Options
- `-a, --api-url URL` - Specify API URL (replaces -g)
- `-y, --yes` - Skip confirmation (non-interactive mode)
- `--skip-permissions` - Skip permission checks (not recommended)

#### Improvements
- **English Output** - All messages in English for international use
- **Structured Logging** - Clear log levels (INFO, SUCCESS, ERROR, WARN, DEBUG, STEP)
- **Better Error Messages** - Specific error codes and actionable messages
- **Verbose Mode** - Detailed debug output with -v flag
- **Permission Verification** - Automatic check of user access before publishing
- **Progress Indicators** - 4-step process with clear status

### Breaking Changes

#### Variable Rename
- `MEESHY_GATEWAY_URL` → `MEESHY_API_URL`
  - Old variable still supported for backward compatibility
  - Priority: MEESHY_API_URL > MEESHY_GATEWAY_URL

#### Option Rename
- `-g, --gateway URL` → `-a, --api-url URL`
  - Old option removed
  - Use new option in all scripts

#### Output Language
- French → English
  - All messages now in English
  - User-facing output internationalized

### Migration Guide

#### From announcement.sh
```bash
# Old
./announcement.sh -f POST -u meeshy -p password

# New
export MEESHY_PASSWORD="password"
./mmp.sh -f POST -u meeshy
```

#### From publish-announcement.sh
```bash
# Old
export MEESHY_PASSWORD="password"
./publish-announcement.sh fr

# New
export MEESHY_PASSWORD="password"
./mmp.sh -l fr -f POST-fr
```

#### Environment Variables
```bash
# Old
export MEESHY_GATEWAY_URL="https://gate.meeshy.me"

# New (both work, new one preferred)
export MEESHY_API_URL="https://gate.meeshy.me"
```

### Documentation

New documentation files:
- `README-MMP.md` - Quick start guide
- `MMP_MEESHY_MESSAGE_PUBLISHER.md` - Complete user documentation
- `MMP_SECURITY_BEST_PRACTICES.md` - Security and cloud best practices
- `CHANGELOG-MMP.md` - This changelog

### Exit Codes

Standardized exit codes following sysexits.h:
- 0 - Success
- 1 - General error
- 64 - Usage error (invalid arguments)
- 65 - Data error (invalid input format)
- 66 - No input (file not found)
- 67 - No user (authentication failed)
- 69 - Unavailable (service unavailable)
- 71 - OS error (system operation failed)
- 73 - Can't create (file creation failed)
- 74 - I/O error (file read/write failed)
- 75 - Temp fail (temporary network failure)
- 76 - Protocol (protocol error)
- 77 - Permission denied (access denied)
- 78 - Config error (configuration error)

### Testing

#### Validation Tests
- ✅ Message length limit (10,000 characters)
- ✅ Null byte detection in messages
- ✅ URL format validation
- ✅ Username format validation
- ✅ Language code validation
- ✅ File existence and readability
- ✅ Required dependency checking

#### Security Tests
- ✅ Password not visible in process list
- ✅ Secure file deletion
- ✅ Temporary file permissions
- ✅ Cleanup on exit/error/signal
- ✅ Input sanitization
- ✅ No credential logging

#### Functionality Tests
- ✅ File-based message publishing
- ✅ Inline message publishing
- ✅ Default POST file detection
- ✅ Backup creation
- ✅ File cleanup
- ✅ Permission verification
- ✅ Multi-language support
- ✅ Verbose mode
- ✅ Non-interactive mode

### Known Issues

None at this time.

### Deprecated

#### Scripts
- `announcement.sh` - Use `mmp.sh` instead
- `publish-announcement.sh` - Use `mmp.sh` instead

Both deprecated scripts show warnings and continue to work for backward compatibility.

### Future Enhancements

Planned for v1.1.0:
- Multi-file publishing support
- Template variable substitution
- Scheduled publishing
- Webhook notifications
- Message drafts
- Conversation creation
- Attachment support
- Markdown formatting

### Contributors

- Meeshy Development Team

### License

See LICENSE file in project root.

---

**Meeshy - Breaking language barriers** 🌍


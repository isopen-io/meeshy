#!/usr/bin/env bash

#########################################
# Meeshy Message Publisher (MMP)
# Publish messages to Meeshy platform
# with permission verification
#
# Cloud-ready, multi-platform, secure script
# Following 12-factor app principles
#########################################

set -euo pipefail  # Exit on error, undefined vars, pipe failures
IFS=$'\n\t'        # Safer word splitting

# Script metadata
readonly SCRIPT_VERSION="1.0.1"
readonly SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Security: Unset history to prevent password logging
HISTFILE=/dev/null
set +o history

# Configuration with secure defaults
readonly API_URL="${MEESHY_API_URL:-https://gate.meeshy.me}"
readonly FRONTEND_URL="${MEESHY_FRONTEND_URL:-https://meeshy.me}"
readonly USERNAME="${MEESHY_USERNAME:-meeshy}"
readonly PASSWORD="${MEESHY_PASSWORD:-}"
readonly CONVERSATION_ID="${MEESHY_CONVERSATION_ID:-meeshy}"
readonly LANGUAGE="${MEESHY_LANGUAGE:-en}"

# Timeouts for cloud/network operations
readonly CONNECT_TIMEOUT="${MEESHY_CONNECT_TIMEOUT:-10}"
readonly MAX_TIMEOUT="${MEESHY_MAX_TIMEOUT:-30}"
readonly MAX_RETRIES="${MEESHY_MAX_RETRIES:-3}"

# Colors for output (ANSI compatible)
if [[ -t 1 ]] && command -v tput &>/dev/null; then
    readonly RED=$(tput setaf 1 2>/dev/null || echo '\033[0;31m')
    readonly GREEN=$(tput setaf 2 2>/dev/null || echo '\033[0;32m')
    readonly YELLOW=$(tput setaf 3 2>/dev/null || echo '\033[1;33m')
    readonly BLUE=$(tput setaf 4 2>/dev/null || echo '\033[0;34m')
    readonly CYAN=$(tput setaf 6 2>/dev/null || echo '\033[0;36m')
    readonly MAGENTA=$(tput setaf 5 2>/dev/null || echo '\033[0;35m')
    readonly NC=$(tput sgr0 2>/dev/null || echo '\033[0m')
else
    readonly RED='' GREEN='' YELLOW='' BLUE='' CYAN='' MAGENTA='' NC=''
fi

# Global state
declare MESSAGE=""
declare POST_FILE=""
declare USE_FILE=false
declare VERBOSE=false
declare CREATE_BACKUP=true
declare CLEANUP_FILE=true
declare SKIP_CONFIRMATION=false
declare CHECK_PERMISSIONS=true
declare COOKIE_FILE=""
declare TEMP_FILES=()

# Exit codes (following sysexits.h convention)
readonly EXIT_OK=0
readonly EXIT_ERROR=1
readonly EXIT_USAGE=64
readonly EXIT_DATAERR=65
readonly EXIT_NOINPUT=66
readonly EXIT_NOUSER=67
readonly EXIT_NOHOST=68
readonly EXIT_UNAVAILABLE=69
readonly EXIT_SOFTWARE=70
readonly EXIT_OSERR=71
readonly EXIT_CANTCREAT=73
readonly EXIT_IOERR=74
readonly EXIT_TEMPFAIL=75
readonly EXIT_PROTOCOL=76
readonly EXIT_NOPERM=77
readonly EXIT_CONFIG=78

#########################################
# Error handling and cleanup
#########################################

cleanup() {
    local exit_code=$?
    
    # Remove temporary files securely
    if [[ ${#TEMP_FILES[@]} -gt 0 ]]; then
        for temp_file in "${TEMP_FILES[@]}"; do
            if [[ -f "$temp_file" ]]; then
                # Secure deletion: overwrite before removal
                dd if=/dev/zero of="$temp_file" bs=1k count=1 2>/dev/null || true
                rm -f "$temp_file" 2>/dev/null || true
            fi
        done
    fi
    
    # Remove cookie file if exists
    if [[ -n "${COOKIE_FILE:-}" ]] && [[ -f "$COOKIE_FILE" ]]; then
        dd if=/dev/zero of="$COOKIE_FILE" bs=1k count=1 2>/dev/null || true
        rm -f "$COOKIE_FILE" 2>/dev/null || true
    fi
    
    return "$exit_code"
}

error_handler() {
    local line_no=$1
    local bash_lineno=$2
    local command="$3"
    
    log_error "Error on line ${line_no}: command '${command}' failed"
    exit "$EXIT_ERROR"
}

# Set traps for cleanup and error handling
trap cleanup EXIT SIGHUP SIGINT SIGTERM
trap 'error_handler ${LINENO} ${BASH_LINENO} "$BASH_COMMAND"' ERR

#########################################
# Logging functions
#########################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

log_debug() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${MAGENTA}[DEBUG]${NC} $*" >&2
    fi
}

log_step() {
    echo -e "${CYAN}[STEP]${NC} $*" >&2
}

die() {
    local exit_code=${2:-$EXIT_ERROR}
    log_error "$1"
    exit "$exit_code"
}

#########################################
# Dependency checking
#########################################

check_dependencies() {
    local missing_deps=()
    
    # Required commands
    local required_commands=("curl" "jq" "date" "mktemp" "dd")
    
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &>/dev/null; then
            missing_deps+=("$cmd")
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_info "Install missing tools and try again"
        log_info "  macOS: brew install ${missing_deps[*]}"
        log_info "  Ubuntu/Debian: sudo apt-get install ${missing_deps[*]}"
        log_info "  RHEL/CentOS: sudo yum install ${missing_deps[*]}"
        exit "$EXIT_OSERR"
    fi
    
    log_debug "All dependencies satisfied"
}

#########################################
# Input validation and sanitization
#########################################

validate_url() {
    local url="$1"
    
    # Basic URL validation (RFC 3986 compatible)
    if [[ ! "$url" =~ ^https?:// ]]; then
        die "Invalid URL format: $url" "$EXIT_DATAERR"
    fi
    
    # Check for common injection attempts
    if [[ "$url" =~ [\'\"\`\$\(\)] ]]; then
        die "URL contains potentially dangerous characters" "$EXIT_DATAERR"
    fi
    
    return 0
}

validate_username() {
    local username="$1"
    
    # Alphanumeric, underscore, hyphen only (3-32 chars)
    if [[ ! "$username" =~ ^[a-zA-Z0-9_-]{3,32}$ ]]; then
        die "Invalid username format (3-32 alphanumeric characters)" "$EXIT_DATAERR"
    fi
    
    return 0
}

validate_conversation_id() {
    local conv_id="$1"
    
    # Alphanumeric, underscore, hyphen only (1-64 chars)
    if [[ ! "$conv_id" =~ ^[a-zA-Z0-9_-]{1,64}$ ]]; then
        die "Invalid conversation ID format" "$EXIT_DATAERR"
    fi
    
    return 0
}

validate_language() {
    local lang="$1"
    
    # ISO 639-1 language codes (2-3 letters)
    if [[ ! "$lang" =~ ^[a-z]{2,3}$ ]]; then
        die "Invalid language code (use ISO 639-1: en, fr, es, etc.)" "$EXIT_DATAERR"
    fi
    
    return 0
}

sanitize_message() {
    local message="$1"
    
    # Check message length (max 10000 chars for safety)
    if [[ ${#message} -gt 10000 ]]; then
        die "Message too long (max 10000 characters)" "$EXIT_DATAERR"
    fi
    
    # Check for null bytes (potential binary data) using tr and wc -m for multibyte chars
    # Count multibyte characters after removing nulls, compare to original length
    local cleaned_length
    cleaned_length=$(printf '%s' "$message" | tr -d '\000' | wc -m | tr -d ' ')
    if [[ "$cleaned_length" -ne "${#message}" ]]; then
        die "Message contains null bytes (binary data not allowed)" "$EXIT_DATAERR"
    fi
    
    echo "$message"
}

#########################################
# Secure file operations
#########################################

create_secure_temp() {
    local temp_file
    
    # Create temp file with restrictive permissions
    temp_file=$(mktemp) || die "Failed to create temporary file" "$EXIT_CANTCREAT"
    chmod 600 "$temp_file" || die "Failed to set temp file permissions" "$EXIT_OSERR"
    
    # Track temp file for cleanup
    TEMP_FILES+=("$temp_file")
    
    echo "$temp_file"
}

create_backup() {
    local source_file="$1"
    local timestamp
    local backup_file
    
    if [[ ! -f "$source_file" ]]; then
        log_error "Source file not found: $source_file"
        return 1
    fi
    
    # Secure timestamp generation (using UTC)
    timestamp=$(date -u +"%Y%m%d-%H%M%S") || die "Failed to generate timestamp" "$EXIT_OSERR"
    backup_file="post-${timestamp}"
    
    # Copy with original permissions
    if cp -p "$source_file" "$backup_file" 2>/dev/null; then
        log_success "Backup created: $backup_file"
        return 0
    else
        log_error "Failed to create backup"
        return 1
    fi
}

cleanup_post_file() {
    local file="$1"
    
    if [[ -f "$file" ]]; then
        # Secure deletion
        if command -v shred &>/dev/null; then
            shred -u "$file" 2>/dev/null || rm -f "$file"
        else
            dd if=/dev/zero of="$file" bs=1k count=1 2>/dev/null || true
            rm -f "$file"
        fi
        log_success "File cleaned: $file"
        return 0
    fi
    return 1
}

#########################################
# Network operations with retry logic
#########################################

http_request() {
    local method="$1"
    local url="$2"
    shift 2
    local extra_args=("$@")
    local response
    local http_code
    local retry_count=0
    local retry_delay=2
    
    validate_url "$url"
    
    while [[ $retry_count -lt $MAX_RETRIES ]]; do
        # Make request with timeouts
        response=$(curl -s -w "\n%{http_code}" \
            --connect-timeout "$CONNECT_TIMEOUT" \
            --max-time "$MAX_TIMEOUT" \
            --retry 0 \
            -X "$method" \
            "${extra_args[@]}" \
            "$url" 2>&1) && break
        
        retry_count=$((retry_count + 1))
        if [[ $retry_count -lt $MAX_RETRIES ]]; then
            log_warning "Request failed, retrying in ${retry_delay}s (attempt $((retry_count + 1))/$MAX_RETRIES)..."
            sleep "$retry_delay"
            retry_delay=$((retry_delay * 2))  # Exponential backoff
        fi
    done
    
    if [[ $retry_count -ge $MAX_RETRIES ]]; then
        die "Network request failed after $MAX_RETRIES attempts" "$EXIT_TEMPFAIL"
    fi
    
    # Extract HTTP code and body
    http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    # Return both via stdout (format: HTTP_CODE|BODY)
    echo "${http_code}|${body}"
}

#########################################
# API operations
#########################################

authenticate() {
    local username="$1"
    local password="$2"
    local result
    local http_code
    local body
    local token
    local user_id
    local user_display
    
    validate_username "$username"
    
    if [[ -z "$password" ]]; then
        die "Password is required" "$EXIT_NOUSER"
    fi
    
    log_step "Step 1/4: Authentication..."
    log_debug "POST ${API_URL}/api/auth/login"
    
    # Create request body in temp file (more secure than inline)
    local request_file
    request_file=$(create_secure_temp)
    
    jq -n \
        --arg user "$username" \
        --arg pass "$password" \
        '{username: $user, password: $pass}' > "$request_file"
    
    # Make authentication request
    result=$(http_request POST "${API_URL}/api/auth/login" \
        -H "Content-Type: application/json" \
        -H "User-Agent: MMP/${SCRIPT_VERSION}" \
        -c "$COOKIE_FILE" \
        -d "@${request_file}")
    
    # Securely remove request file
    dd if=/dev/zero of="$request_file" bs=1k count=1 2>/dev/null || true
    rm -f "$request_file"
    
    http_code="${result%%|*}"
    body="${result#*|}"
    
    log_debug "Response code: $http_code"
    
    if [[ "$http_code" != "200" ]]; then
        log_error "Authentication failed (HTTP $http_code)"
        if [[ "$VERBOSE" == "true" ]]; then
            echo "$body" | jq -r '.' 2>/dev/null || echo "$body"
        fi
        exit "$EXIT_NOUSER"
    fi
    
    # Extract token securely
    token=$(echo "$body" | jq -r '.token // .data.token // empty' 2>/dev/null)
    
    if [[ -z "$token" ]] || [[ "$token" == "null" ]]; then
        die "Authentication token not received" "$EXIT_PROTOCOL"
    fi
    
    # Extract user info
    user_id=$(echo "$body" | jq -r '.user.id // .data.user.id // empty' 2>/dev/null)
    user_display=$(echo "$body" | jq -r '.user.username // .data.user.username // empty' 2>/dev/null)
    
    log_success "Authentication successful (User: ${user_display:-$username})"
    log_debug "Token: ${token:0:20}..."
    
    # Return token and user_id (format: TOKEN|USER_ID)
    echo "${token}|${user_id}"
}

check_conversation_permissions() {
    local token="$1"
    local user_id="$2"
    local conv_id="$3"
    local result
    local http_code
    local body
    
    validate_conversation_id "$conv_id"
    
    if [[ "$CHECK_PERMISSIONS" != "true" ]]; then
        log_warning "Step 2/4: Permission check skipped"
        return 0
    fi
    
    log_step "Step 2/4: Checking permissions..."
    log_debug "GET ${API_URL}/api/conversations/${conv_id}"
    
    # Request conversation details
    result=$(http_request GET "${API_URL}/api/conversations/${conv_id}" \
        -H "Authorization: Bearer ${token}" \
        -H "User-Agent: MMP/${SCRIPT_VERSION}" \
        -b "$COOKIE_FILE")
    
    http_code="${result%%|*}"
    body="${result#*|}"
    
    log_debug "Response code: $http_code"
    
    case "$http_code" in
        404)
            die "Conversation '$conv_id' not found" "$EXIT_DATAERR"
            ;;
        403)
            die "Access denied to conversation '$conv_id'" "$EXIT_NOPERM"
            ;;
        200)
            # Success - analyze conversation details
            ;;
        *)
            log_error "Failed to retrieve conversation (HTTP $http_code)"
            if [[ "$VERBOSE" == "true" ]]; then
                echo "$body" | jq -r '.' 2>/dev/null || echo "$body"
            fi
            exit "$EXIT_UNAVAILABLE"
            ;;
    esac
    
    # Extract conversation info
    local conv_type
    local conv_title
    
    conv_type=$(echo "$body" | jq -r '.type // .data.type // empty' 2>/dev/null)
    conv_title=$(echo "$body" | jq -r '.title // .data.title // .identifier // .data.identifier // empty' 2>/dev/null)
    
    log_success "Conversation found: ${conv_title:-$conv_id} (type: ${conv_type:-unknown})"
    
    # Check membership for non-public conversations
    if [[ "$conv_type" != "global" ]] && [[ "$conv_type" != "public" ]]; then
        local is_member
        is_member=$(echo "$body" | jq -r --arg uid "$user_id" \
            '.members // .data.members // [] | map(select(.userId == $uid)) | length > 0' 2>/dev/null)
        
        if [[ "$is_member" != "true" ]]; then
            die "You are not a member of this conversation" "$EXIT_NOPERM"
        fi
        
        log_success "You are a member of this conversation"
    else
        log_success "Conversation ${conv_type}: publishing allowed for all"
    fi
    
    return 0
}

publish_message() {
    local token="$1"
    local conv_id="$2"
    local message="$3"
    local lang="$4"
    local result
    local http_code
    local body
    local message_id
    
    validate_conversation_id "$conv_id"
    validate_language "$lang"
    
    # Sanitize and escape message
    message=$(sanitize_message "$message")
    
    log_step "Step 3/4: Sending message..."
    log_debug "POST ${API_URL}/api/conversations/${conv_id}/messages"
    
    # Create request body securely
    local request_file
    request_file=$(create_secure_temp)
    
    jq -n \
        --arg content "$message" \
        --arg lang "$lang" \
        '{content: $content, originalLanguage: $lang, messageType: "text"}' > "$request_file"
    
    # Send message
    result=$(http_request POST "${API_URL}/api/conversations/${conv_id}/messages" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${token}" \
        -H "User-Agent: MMP/${SCRIPT_VERSION}" \
        -b "$COOKIE_FILE" \
        -d "@${request_file}")
    
    # Clean request file
    rm -f "$request_file"
    
    http_code="${result%%|*}"
    body="${result#*|}"
    
    log_debug "Response code: $http_code"
    
    if [[ "$http_code" == "200" ]] || [[ "$http_code" == "201" ]]; then
        log_success "Message published successfully!"
        
        if [[ "$VERBOSE" == "true" ]]; then
            message_id=$(echo "$body" | jq -r '.id // .data.id // .messageId // empty' 2>/dev/null)
            if [[ -n "$message_id" ]] && [[ "$message_id" != "null" ]]; then
                log_debug "Message ID: $message_id"
            fi
        fi
        
        return 0
    else
        log_error "Failed to send message (HTTP $http_code)"
        if [[ "$VERBOSE" == "true" ]]; then
            echo "$body" | jq -r '.' 2>/dev/null || echo "$body"
        fi
        exit "$EXIT_UNAVAILABLE"
    fi
}

#########################################
# Help and usage
#########################################

show_help() {
    cat << EOF
${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}
${CYAN}║        Meeshy Message Publisher (MMP) v${SCRIPT_VERSION}                   ║${NC}
${CYAN}║        Publish messages to Meeshy platform                     ║${NC}
${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}

${BLUE}USAGE:${NC}
    ${SCRIPT_NAME} [OPTIONS] [MESSAGE|FILE]

${BLUE}OPERATING MODES:${NC}
    1. Specific POST file: ${SCRIPT_NAME} -f my-post.txt
    2. Default POST file: ${SCRIPT_NAME} (looks for "POST" in current directory)
    3. Inline message: ${SCRIPT_NAME} "My message"

${BLUE}OPTIONS:${NC}
    -h, --help              Show this help
    -f, --file FILE         File containing message to publish
    -u, --username USER     Username (default: meeshy)
    -p, --password PASS     Password (or use MEESHY_PASSWORD)
    -c, --conversation ID   Conversation ID (default: meeshy)
    -a, --api-url URL       API URL (default: https://gate.meeshy.me)
    -l, --language LANG     Message language (default: en)
    -v, --verbose           Verbose mode
    -y, --yes               Skip confirmation (non-interactive mode)
    --no-backup             Don't create backup of POST file
    --no-cleanup            Don't delete POST file after publishing
    --skip-permissions      Skip permission check (not recommended)

${BLUE}ENVIRONMENT VARIABLES:${NC}
    MEESHY_PASSWORD         User password (required if not using -p)
    MEESHY_USERNAME         Username (default: meeshy)
    MEESHY_API_URL          API URL (default: https://gate.meeshy.me)
    MEESHY_FRONTEND_URL     Frontend URL (default: https://meeshy.me)
    MEESHY_CONVERSATION_ID  Conversation ID (default: meeshy)
    MEESHY_LANGUAGE         Message language (default: en)
    MEESHY_CONNECT_TIMEOUT  Connection timeout in seconds (default: 10)
    MEESHY_MAX_TIMEOUT      Maximum request timeout in seconds (default: 30)
    MEESHY_MAX_RETRIES      Maximum retry attempts (default: 3)

${BLUE}SECURITY AND PERMISSIONS:${NC}
    The script automatically verifies that the user:
    - Successfully authenticates
    - Has access to the specified conversation
    - Has permission to publish messages
    
${BLUE}POST FILE MANAGEMENT:${NC}
    When using a POST file:
    1. File content is read (multi-line support)
    2. Backup is created (format: post-YYYYMMDD-HHMMSS)
    3. Message is published to Meeshy
    4. Original POST file is deleted (unless --no-cleanup)

${BLUE}EXAMPLES:${NC}
    ${GREEN}# Publish from default POST file${NC}
    export MEESHY_PASSWORD="your_password"
    ${SCRIPT_NAME}

    ${GREEN}# Publish from specific file${NC}
    ${SCRIPT_NAME} -f announcement.txt

    ${GREEN}# Publish inline message${NC}
    ${SCRIPT_NAME} "New version available!"

    ${GREEN}# Publish to specific conversation${NC}
    ${SCRIPT_NAME} -c general-announcements -f post.txt

    ${GREEN}# Non-interactive mode (for automation)${NC}
    ${SCRIPT_NAME} -y -f announcement.txt

    ${GREEN}# Verbose mode${NC}
    ${SCRIPT_NAME} -v -f POST

${BLUE}EXIT CODES:${NC}
    0   Success
    1   General error
    64  Usage error
    65  Data format error
    66  Input file not found
    67  Authentication error
    69  Service unavailable
    77  Permission denied
    78  Configuration error

EOF
    exit "$EXIT_OK"
}

#########################################
# Argument parsing
#########################################

parse_arguments() {
    local current_username="$USERNAME"
    local current_password="$PASSWORD"
    local current_conv_id="$CONVERSATION_ID"
    local current_api_url="$API_URL"
    local current_language="$LANGUAGE"
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                show_help
                ;;
            -f|--file)
                [[ -z "${2:-}" ]] && die "Option -f requires an argument" "$EXIT_USAGE"
                POST_FILE="$2"
                USE_FILE=true
                shift 2
                ;;
            -u|--username)
                [[ -z "${2:-}" ]] && die "Option -u requires an argument" "$EXIT_USAGE"
                current_username="$2"
                shift 2
                ;;
            -p|--password)
                [[ -z "${2:-}" ]] && die "Option -p requires an argument" "$EXIT_USAGE"
                current_password="$2"
                shift 2
                ;;
            -c|--conversation)
                [[ -z "${2:-}" ]] && die "Option -c requires an argument" "$EXIT_USAGE"
                current_conv_id="$2"
                shift 2
                ;;
            -a|--api-url)
                [[ -z "${2:-}" ]] && die "Option -a requires an argument" "$EXIT_USAGE"
                current_api_url="$2"
                shift 2
                ;;
            -l|--language)
                [[ -z "${2:-}" ]] && die "Option -l requires an argument" "$EXIT_USAGE"
                current_language="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -y|--yes)
                SKIP_CONFIRMATION=true
                shift
                ;;
            --no-backup)
                CREATE_BACKUP=false
                shift
                ;;
            --no-cleanup)
                CLEANUP_FILE=false
                shift
                ;;
            --skip-permissions)
                CHECK_PERMISSIONS=false
                log_warning "Permission check disabled"
                shift
                ;;
            -*)
                die "Unknown option: $1\nUse --help for available options" "$EXIT_USAGE"
                ;;
            *)
                # Inline message
                if [[ "$USE_FILE" == "false" ]]; then
                    MESSAGE="$1"
                fi
                shift
                ;;
        esac
    done
    
    # Export parsed values (readonly to prevent tampering)
    declare -g -r PARSED_USERNAME="$current_username"
    declare -g -r PARSED_PASSWORD="$current_password"
    declare -g -r PARSED_CONV_ID="$current_conv_id"
    declare -g -r PARSED_API_URL="$current_api_url"
    declare -g -r PARSED_LANGUAGE="$current_language"
}

#########################################
# Main execution
#########################################

main() {
    # Check dependencies first
    check_dependencies
    
    # Parse arguments
    parse_arguments "$@"
    
    # Determine message source
    if [[ "$USE_FILE" == "false" ]] && [[ -z "$MESSAGE" ]]; then
        # Look for default POST file
        if [[ -f "POST" ]]; then
            POST_FILE="POST"
            USE_FILE=true
            log_info "Using default POST file"
        fi
    fi
    
    # Read message from file if needed
    if [[ "$USE_FILE" == "true" ]]; then
        [[ -z "$POST_FILE" ]] && die "Filename required with -f option" "$EXIT_USAGE"
        [[ ! -f "$POST_FILE" ]] && die "File not found: $POST_FILE" "$EXIT_NOINPUT"
        [[ ! -r "$POST_FILE" ]] && die "File not readable: $POST_FILE" "$EXIT_NOPERM"
        
        # Read file content
        MESSAGE=$(cat "$POST_FILE") || die "Failed to read file: $POST_FILE" "$EXIT_IOERR"
        
        [[ -z "$MESSAGE" ]] && die "File is empty: $POST_FILE" "$EXIT_DATAERR"
        
        log_success "Message read from: $POST_FILE"
        
        # Create backup if requested
        if [[ "$CREATE_BACKUP" == "true" ]]; then
            create_backup "$POST_FILE" || log_warning "Failed to create backup"
        fi
    fi
    
    # Validate requirements
    [[ -z "$MESSAGE" ]] && die "Message is required\nUse --help for usage information" "$EXIT_USAGE"
    [[ -z "$PARSED_PASSWORD" ]] && die "Password is required\nSet MEESHY_PASSWORD or use -p option" "$EXIT_CONFIG"
    
    # Validate inputs
    validate_url "$PARSED_API_URL"
    validate_username "$PARSED_USERNAME"
    validate_conversation_id "$PARSED_CONV_ID"
    validate_language "$PARSED_LANGUAGE"
    
    # Validate and sanitize message
    MESSAGE=$(sanitize_message "$MESSAGE")
    
    # Display header
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║        Meeshy Message Publisher (MMP) v${SCRIPT_VERSION}                   ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Display configuration
    log_step "Configuration:"
    echo "  ${BLUE}API URL:${NC} $PARSED_API_URL"
    echo "  ${BLUE}Username:${NC} $PARSED_USERNAME"
    echo "  ${BLUE}Conversation:${NC} $PARSED_CONV_ID"
    echo "  ${BLUE}Language:${NC} $PARSED_LANGUAGE"
    if [[ "$USE_FILE" == "true" ]]; then
        echo "  ${BLUE}Source:${NC} File $POST_FILE"
        echo "  ${BLUE}Backup:${NC} $CREATE_BACKUP"
        echo "  ${BLUE}Cleanup:${NC} $CLEANUP_FILE"
    else
        echo "  ${BLUE}Source:${NC} Inline"
    fi
    echo ""
    
    # Display message preview
    local preview
    if [[ ${#MESSAGE} -gt 200 ]]; then
        preview="${MESSAGE:0:200}..."
    else
        preview="$MESSAGE"
    fi
    
    echo -e "${YELLOW}Message preview:${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "$preview"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    log_info "Message length: ${#MESSAGE} characters"
    echo ""
    
    # Request confirmation if interactive
    if [[ "$SKIP_CONFIRMATION" == "false" ]]; then
        read -p "$(echo -e ${YELLOW}Publish this message to Meeshy? \(yes/NO\): ${NC})" confirm
        if [[ "$confirm" != "yes" ]]; then
            echo ""
            log_info "Publication cancelled"
            exit "$EXIT_OK"
        fi
        echo ""
    fi
    
    # Create secure cookie file
    COOKIE_FILE=$(create_secure_temp)
    
    # Authenticate
    local auth_result
    local auth_token
    local user_id
    
    auth_result=$(authenticate "$PARSED_USERNAME" "$PARSED_PASSWORD")
    auth_token="${auth_result%%|*}"
    user_id="${auth_result#*|}"
    
    # Check permissions
    check_conversation_permissions "$auth_token" "$user_id" "$PARSED_CONV_ID"
    
    # Publish message
    publish_message "$auth_token" "$PARSED_CONV_ID" "$MESSAGE" "$PARSED_LANGUAGE"
    
    # Cleanup
    log_step "Step 4/4: Cleanup..."
    
    if [[ "$USE_FILE" == "true" ]] && [[ "$CLEANUP_FILE" == "true" ]] && [[ -n "$POST_FILE" ]]; then
        cleanup_post_file "$POST_FILE"
    else
        log_info "POST file preserved"
    fi
    
    # Display success summary
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  Publication successful!                      ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Your message is now visible at:${NC}"
    echo -e "${GREEN}   ${FRONTEND_URL}/conversations/${PARSED_CONV_ID}${NC}"
    echo ""
    
    if [[ "$USE_FILE" == "true" ]] && [[ "$CREATE_BACKUP" == "true" ]]; then
        local backup_files
        backup_files=$(ls -t post-* 2>/dev/null | head -1 || true)
        if [[ -n "$backup_files" ]]; then
            echo -e "${BLUE}Backup created: $backup_files${NC}"
            echo ""
        fi
    fi
    
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║        Meeshy - Breaking language barriers                    ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    exit "$EXIT_OK"
}

# Execute main function with all arguments
main "$@"

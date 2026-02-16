#!/usr/bin/env bash

#########################################
# Meeshy Message Receiver (MMR)
# Retrieve and display messages from Meeshy conversations
# with time-based or count-based filtering
#
# Cloud-ready, multi-platform, secure script
# Following 12-factor app principles
#########################################

set -euo pipefail  # Exit on error, undefined vars, pipe failures
IFS=$'\n\t'        # Safer word splitting

# Script metadata
readonly SCRIPT_VERSION="1.0.0"
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
    readonly GRAY=$(tput setaf 8 2>/dev/null || echo '\033[0;90m')
    readonly BOLD=$(tput bold 2>/dev/null || echo '\033[1m')
    readonly NC=$(tput sgr0 2>/dev/null || echo '\033[0m')
else
    readonly RED='' GREEN='' YELLOW='' BLUE='' CYAN='' MAGENTA='' GRAY='' BOLD='' NC=''
fi

# Global state
declare VERBOSE=false
declare COOKIE_FILE=""
declare TEMP_FILES=()
declare OUTPUT_FORMAT="pretty"  # pretty, json, compact, raw, ai
declare SHOW_TRANSLATIONS=false
declare SHOW_METADATA=false
declare SHOW_ATTACHMENTS=false

# Filter options
declare FILTER_MODE="count"  # count, time
declare FILTER_COUNT=50
declare FILTER_TIME_VALUE=""
declare FILTER_TIME_UNIT=""
declare CLIENT_SIDE_TIME_FILTER=false

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

validate_count() {
    local count="$1"
    
    # Numeric only, 1-1000
    if [[ ! "$count" =~ ^[0-9]+$ ]]; then
        die "Invalid count (must be a number)" "$EXIT_DATAERR"
    fi
    
    if [[ "$count" -lt 1 ]] || [[ "$count" -gt 10000 ]]; then
        die "Count must be between 1 and 10000" "$EXIT_DATAERR"
    fi
    
    return 0
}

validate_time_filter() {
    local value="$1"
    local unit="$2"
    
    # Validate value is numeric
    if [[ ! "$value" =~ ^[0-9]+$ ]]; then
        die "Invalid time value (must be a number)" "$EXIT_DATAERR"
    fi
    
    # Validate unit
    case "$unit" in
        minute|minutes|min|m)
            FILTER_TIME_UNIT="minutes"
            ;;
        hour|hours|h)
            FILTER_TIME_UNIT="hours"
            ;;
        day|days|d)
            FILTER_TIME_UNIT="days"
            ;;
        week|weeks|w)
            FILTER_TIME_UNIT="weeks"
            ;;
        month|months|M)
            FILTER_TIME_UNIT="months"
            ;;
        *)
            die "Invalid time unit: $unit\nValid units: minute(s)|min|m, hour(s)|h, day(s)|d, week(s)|w, month(s)|M" "$EXIT_DATAERR"
            ;;
    esac
    
    FILTER_TIME_VALUE="$value"
    return 0
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

#########################################
# Time calculation utilities
#########################################

calculate_timestamp_from_time() {
    local value="$1"
    local unit="$2"
    local current_timestamp
    local seconds_offset
    
    # Get current timestamp
    current_timestamp=$(date +%s) || die "Failed to get current timestamp" "$EXIT_OSERR"
    
    # Calculate offset in seconds
    case "$unit" in
        minutes)
            seconds_offset=$((value * 60))
            ;;
        hours)
            seconds_offset=$((value * 3600))
            ;;
        days)
            seconds_offset=$((value * 86400))
            ;;
        weeks)
            seconds_offset=$((value * 604800))
            ;;
        months)
            seconds_offset=$((value * 2592000))  # Approximate: 30 days
            ;;
        *)
            die "Invalid time unit: $unit" "$EXIT_DATAERR"
            ;;
    esac
    
    # Calculate timestamp (current - offset)
    local target_timestamp=$((current_timestamp - seconds_offset))
    
    echo "$target_timestamp"
}

format_timestamp() {
    local timestamp="$1"
    
    # Convert to human-readable format
    if command -v gdate &>/dev/null; then
        # macOS with GNU coreutils
        gdate -d "@$timestamp" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -r "$timestamp" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "$timestamp"
    else
        # Linux
        date -d "@$timestamp" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -r "$timestamp" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "$timestamp"
    fi
}

format_relative_time() {
    local timestamp="$1"
    local current_timestamp
    local diff
    
    current_timestamp=$(date +%s)
    diff=$((current_timestamp - timestamp))
    
    if [[ $diff -lt 60 ]]; then
        echo "${diff}s ago"
    elif [[ $diff -lt 3600 ]]; then
        echo "$((diff / 60))m ago"
    elif [[ $diff -lt 86400 ]]; then
        echo "$((diff / 3600))h ago"
    elif [[ $diff -lt 604800 ]]; then
        echo "$((diff / 86400))d ago"
    else
        echo "$((diff / 604800))w ago"
    fi
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
    
    log_step "Step 1/3: Authentication..."
    log_debug "POST ${API_URL}/api/v1/auth/login"
    
    # Create request body in temp file (more secure than inline)
    local request_file
    request_file=$(create_secure_temp)
    
    jq -n \
        --arg user "$username" \
        --arg pass "$password" \
        '{username: $user, password: $pass}' > "$request_file"
    
    # Make authentication request
    result=$(http_request POST "${API_URL}/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -H "User-Agent: MMR/${SCRIPT_VERSION}" \
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

check_conversation_access() {
    local token="$1"
    local user_id="$2"
    local conv_id="$3"
    local result
    local http_code
    local body
    
    validate_conversation_id "$conv_id"
    
    log_step "Step 2/3: Verifying conversation access..."
    log_debug "GET ${API_URL}/api/v1/conversations/${conv_id}"
    
    # Request conversation details
    result=$(http_request GET "${API_URL}/api/v1/conversations/${conv_id}" \
        -H "Authorization: Bearer ${token}" \
        -H "User-Agent: MMR/${SCRIPT_VERSION}" \
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
    local member_count
    
    conv_type=$(echo "$body" | jq -r '.type // .data.type // empty' 2>/dev/null)
    conv_title=$(echo "$body" | jq -r '.title // .data.title // .identifier // .data.identifier // empty' 2>/dev/null)
    member_count=$(echo "$body" | jq -r '.members // .data.members // [] | length' 2>/dev/null)
    
    log_success "Conversation: ${conv_title:-$conv_id} (type: ${conv_type:-unknown}, members: ${member_count:-?})"
    
    return 0
}

retrieve_messages() {
    local token="$1"
    local conv_id="$2"
    local result
    local http_code
    local body
    local url
    
    validate_conversation_id "$conv_id"
    
    log_step "Step 3/3: Retrieving messages..."
    
    # Build URL with query parameters
    url="${API_URL}/api/v1/conversations/${conv_id}/messages"
    
    local query_params=()
    
    if [[ "$FILTER_MODE" == "count" ]]; then
        query_params+=("limit=${FILTER_COUNT}")
        log_debug "Fetching last ${FILTER_COUNT} messages"
    elif [[ "$FILTER_MODE" == "time" ]]; then
        # API doesn't support 'since' parameter, so we fetch more and filter client-side
        local timestamp
        timestamp=$(calculate_timestamp_from_time "$FILTER_TIME_VALUE" "$FILTER_TIME_UNIT")
        
        # Fetch more messages for client-side filtering (estimate)
        local estimated_limit
        case "$FILTER_TIME_UNIT" in
            minutes)
                estimated_limit=$((FILTER_TIME_VALUE * 10))  # ~10 msg/min estimate
                ;;
            hours)
                estimated_limit=$((FILTER_TIME_VALUE * 100))  # ~100 msg/hour estimate
                ;;
            days)
                estimated_limit=$((FILTER_TIME_VALUE * 500))  # ~500 msg/day estimate
                ;;
            weeks)
                estimated_limit=$((FILTER_TIME_VALUE * 2000))  # ~2000 msg/week estimate
                ;;
            months)
                estimated_limit=$((FILTER_TIME_VALUE * 5000))  # ~5000 msg/month estimate
                ;;
            *)
                estimated_limit=1000
                ;;
        esac
        
        # Cap at 10000
        [[ $estimated_limit -gt 10000 ]] && estimated_limit=10000
        [[ $estimated_limit -lt 50 ]] && estimated_limit=50
        
        query_params+=("limit=${estimated_limit}")
        CLIENT_SIDE_TIME_FILTER=true
        log_debug "Fetching up to ${estimated_limit} messages for client-side time filtering"
        log_debug "Will filter messages since $(format_timestamp "$timestamp") (last ${FILTER_TIME_VALUE} ${FILTER_TIME_UNIT})"
    fi
    
    # Add query parameters to URL
    if [[ ${#query_params[@]} -gt 0 ]]; then
        local query_string
        query_string=$(IFS='&'; echo "${query_params[*]}")
        url="${url}?${query_string}"
    fi
    
    log_debug "GET ${url}"
    
    # Request messages
    result=$(http_request GET "$url" \
        -H "Authorization: Bearer ${token}" \
        -H "User-Agent: MMR/${SCRIPT_VERSION}" \
        -b "$COOKIE_FILE")
    
    http_code="${result%%|*}"
    body="${result#*|}"
    
    log_debug "Response code: $http_code"
    
    if [[ "$http_code" != "200" ]]; then
        log_error "Failed to retrieve messages (HTTP $http_code)"
        if [[ "$VERBOSE" == "true" ]]; then
            echo "$body" | jq -r '.' 2>/dev/null || echo "$body"
        fi
        exit "$EXIT_UNAVAILABLE"
    fi
    
    # Apply client-side time filtering if needed
    if [[ "$CLIENT_SIDE_TIME_FILTER" == "true" ]]; then
        local timestamp
        timestamp=$(calculate_timestamp_from_time "$FILTER_TIME_VALUE" "$FILTER_TIME_UNIT")
        local timestamp_ms=$((timestamp * 1000))  # Convert to milliseconds
        
        log_debug "Applying client-side time filter: messages after $timestamp_ms"
        
        # Filter messages by timestamp - handle multiple possible response structures
        body=$(echo "$body" | jq --argjson cutoff "$timestamp_ms" '
            # Helper function to filter messages
            def filter_messages:
                map(select(
                    (.createdAt | 
                        if type == "string" then 
                            (. | sub("\\.[0-9]+Z$"; "Z") | fromdate * 1000)
                        else 
                            .
                        end
                    ) > $cutoff
                ));
            
            # Apply filter based on structure
            if type == "object" and has("data") and (.data | type == "object") and (.data | has("messages")) then
                .data.messages |= filter_messages
            elif type == "object" and has("messages") then
                .messages |= filter_messages
            elif type == "array" then
                filter_messages
            else
                .
            end
        ')
        
        local filtered_count
        filtered_count=$(echo "$body" | jq -r 'if type == "object" and has("data") and (.data | has("messages")) then .data.messages | length elif type == "object" and has("messages") then .messages | length elif type == "array" then length else 0 end')
        log_debug "Filtered to ${filtered_count} messages within time range"
    fi
    
    # Return messages JSON
    echo "$body"
}

#########################################
# Message formatting and display
#########################################

display_messages() {
    local messages_json="$1"
    local message_count
    
    # Extract messages array
    local messages
    messages=$(echo "$messages_json" | jq -r '.messages // .data.messages // .data // []' 2>/dev/null)
    
    if [[ -z "$messages" ]] || [[ "$messages" == "null" ]] || [[ "$messages" == "[]" ]]; then
        log_warning "No messages found"
        return 0
    fi
    
    message_count=$(echo "$messages" | jq -r 'length' 2>/dev/null)
    
    # Only show logs for pretty and compact formats
    if [[ "$OUTPUT_FORMAT" == "pretty" ]] || [[ "$OUTPUT_FORMAT" == "compact" ]]; then
        log_success "Retrieved ${message_count} message(s)"
        echo "" >&2
    fi
    
    case "$OUTPUT_FORMAT" in
        json)
            display_json "$messages"
            ;;
        compact)
            display_compact "$messages"
            ;;
        raw)
            display_raw "$messages"
            ;;
        ai)
            display_ai_friendly "$messages"
            ;;
        pretty|*)
            display_pretty "$messages"
            ;;
    esac
}

display_json() {
    local messages="$1"
    echo "$messages" | jq '.'
}

display_ai_friendly() {
    local messages="$1"
    
    # Create AI-friendly structured JSON with only essential data
    echo "$messages" | jq '[.[] | {
        id: .id,
        timestamp: .createdAt,
        sender: {
            id: (.sender.id // .anonymousSender.id // "unknown"),
            username: (.sender.username // .anonymousSender.username // "anonymous"),
            displayName: (.sender.displayName // ((.anonymousSender.firstName // "") + " " + (.anonymousSender.lastName // "")) // null)
        },
        content: .content,
        language: .originalLanguage,
        type: (.messageType // "text"),
        translations: [.translations[]? | {
            language: .targetLanguage,
            content: .translatedContent
        }],
        hasAttachments: ((.attachments // []) | length > 0),
        attachments: [.attachments[]? | {
            filename: .filename,
            type: .mimeType,
            size: .size,
            url: .url
        }],
        replyTo: (if .replyTo then {
            id: .replyTo.id,
            content: .replyTo.content,
            sender: (.replyTo.sender.username // .replyTo.sender.displayName // "unknown")
        } else null end),
        reactions: [.reactions[]? | {
            emoji: .emoji,
            count: .count,
            users: [.users[]? | .username]
        }]
    }]'
}

display_raw() {
    local messages="$1"
    echo "$messages" | jq -r '.[] | .content // .translatedContent // ""'
}

display_compact() {
    local messages="$1"
    local count
    count=$(echo "$messages" | jq -r 'length')
    
    for ((i=0; i<count; i++)); do
        local msg
        msg=$(echo "$messages" | jq -r ".[$i]")
        
        local msg_id=$(echo "$msg" | jq -r '.id // ""')
        local sender=$(echo "$msg" | jq -r '.sender.username // .sender.displayName // "Unknown"')
        local content=$(echo "$msg" | jq -r '.content // .translatedContent // ""')
        local timestamp=$(echo "$msg" | jq -r '.createdAt // .timestamp // 0')
        
        # Format timestamp
        local time_str
        if [[ "$timestamp" =~ ^[0-9]+$ ]]; then
            # Unix timestamp in seconds
            if [[ ${#timestamp} -gt 10 ]]; then
                # Milliseconds - convert to seconds
                timestamp=$((timestamp / 1000))
            fi
            time_str=$(format_relative_time "$timestamp")
        else
            time_str="$timestamp"
        fi
        
        # Truncate content for compact view
        local content_preview
        if [[ ${#content} -gt 80 ]]; then
            content_preview="${content:0:77}..."
        else
            content_preview="$content"
        fi
        
        echo -e "${GRAY}[${time_str}]${NC} ${CYAN}${sender}${NC}: ${content_preview}"
    done
}

display_pretty() {
    local messages="$1"
    local count
    count=$(echo "$messages" | jq -r 'length')
    
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                              Messages                                      ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    for ((i=0; i<count; i++)); do
        local msg
        msg=$(echo "$messages" | jq -r ".[$i]")
        
        local msg_id=$(echo "$msg" | jq -r '.id // ""')
        local sender=$(echo "$msg" | jq -r '.sender.username // .sender.displayName // "Unknown"')
        local sender_id=$(echo "$msg" | jq -r '.sender.id // ""')
        local content=$(echo "$msg" | jq -r '.content // .translatedContent // ""')
        local original_lang=$(echo "$msg" | jq -r '.originalLanguage // ""')
        local msg_type=$(echo "$msg" | jq -r '.messageType // "text"')
        local timestamp=$(echo "$msg" | jq -r '.createdAt // .timestamp // 0')
        local status=$(echo "$msg" | jq -r '.status // ""')
        
        # Format timestamp
        local time_str
        local relative_time
        if [[ "$timestamp" =~ ^[0-9]+$ ]]; then
            # Unix timestamp in seconds
            if [[ ${#timestamp} -gt 10 ]]; then
                # Milliseconds - convert to seconds
                timestamp=$((timestamp / 1000))
            fi
            time_str=$(format_timestamp "$timestamp")
            relative_time=$(format_relative_time "$timestamp")
        else
            time_str="$timestamp"
            relative_time=""
        fi
        
        # Display message header
        echo -e "${BOLD}${GREEN}From:${NC} ${CYAN}${sender}${NC} ${GRAY}(${relative_time})${NC}"
        echo -e "${BOLD}${GREEN}Time:${NC} ${time_str}"
        
        if [[ "$SHOW_METADATA" == "true" ]]; then
            echo -e "${BOLD}${GREEN}ID:${NC} ${msg_id}"
            echo -e "${BOLD}${GREEN}Type:${NC} ${msg_type}"
            [[ -n "$original_lang" ]] && echo -e "${BOLD}${GREEN}Language:${NC} ${original_lang}"
            [[ -n "$status" ]] && echo -e "${BOLD}${GREEN}Status:${NC} ${status}"
        fi
        
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${content}"
        
        # Display translations if requested
        if [[ "$SHOW_TRANSLATIONS" == "true" ]]; then
            local translations
            translations=$(echo "$msg" | jq -r '.translations // []')
            
            if [[ "$translations" != "[]" ]] && [[ "$translations" != "null" ]]; then
                local trans_count
                trans_count=$(echo "$translations" | jq -r 'length')
                
                if [[ $trans_count -gt 0 ]]; then
                    echo ""
                    echo -e "${MAGENTA}Translations:${NC}"
                    
                    for ((j=0; j<trans_count; j++)); do
                        local trans
                        trans=$(echo "$translations" | jq -r ".[$j]")
                        
                        local trans_lang=$(echo "$trans" | jq -r '.targetLanguage // .language // ""')
                        local trans_text=$(echo "$trans" | jq -r '.translatedContent // .content // ""')
                        
                        echo -e "  ${CYAN}[${trans_lang}]${NC} ${trans_text}"
                    done
                fi
            fi
        fi
        
        # Display attachments if requested
        if [[ "$SHOW_ATTACHMENTS" == "true" ]]; then
            local attachments
            attachments=$(echo "$msg" | jq -r '.attachments // []')
            
            if [[ "$attachments" != "[]" ]] && [[ "$attachments" != "null" ]]; then
                local att_count
                att_count=$(echo "$attachments" | jq -r 'length')
                
                if [[ $att_count -gt 0 ]]; then
                    echo ""
                    echo -e "${BLUE}Attachments (${att_count}):${NC}"
                    
                    for ((j=0; j<att_count; j++)); do
                        local att
                        att=$(echo "$attachments" | jq -r ".[$j]")
                        
                        local att_filename=$(echo "$att" | jq -r '.filename // .name // ""')
                        local att_type=$(echo "$att" | jq -r '.mimeType // .type // ""')
                        local att_size=$(echo "$att" | jq -r '.size // 0')
                        local att_url=$(echo "$att" | jq -r '.url // ""')
                        
                        echo -e "  ${YELLOW}📎${NC} ${att_filename} ${GRAY}(${att_type}, ${att_size} bytes)${NC}"
                        [[ -n "$att_url" ]] && echo -e "     ${GRAY}${att_url}${NC}"
                    done
                fi
            fi
        fi
        
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
    done
    
    echo -e "${GRAY}End of messages (${count} total)${NC}"
    echo ""
}

#########################################
# Help and usage
#########################################

show_help() {
    cat << EOF
${CYAN}╔════════════════════════════════════════════════════════════════════════════╗${NC}
${CYAN}║        Meeshy Message Receiver (MMR) v${SCRIPT_VERSION}                           ║${NC}
${CYAN}║        Retrieve and display messages from Meeshy conversations             ║${NC}
${CYAN}╚════════════════════════════════════════════════════════════════════════════╝${NC}

${BLUE}USAGE:${NC}
    ${SCRIPT_NAME} [OPTIONS]

${BLUE}FILTER MODES:${NC}
    1. By count (default): ${SCRIPT_NAME} -n 200
    2. By time period: ${SCRIPT_NAME} -t 10h
                       ${SCRIPT_NAME} -t 2d
                       ${SCRIPT_NAME} -t 1w

${BLUE}OPTIONS:${NC}
    ${BOLD}General:${NC}
    -h, --help              Show this help
    -v, --verbose           Verbose mode
    -u, --username USER     Username (default: meeshy)
    -p, --password PASS     Password (or use MEESHY_PASSWORD)
    -c, --conversation ID   Conversation ID (default: meeshy)
    -a, --api-url URL       API URL (default: https://gate.meeshy.me)
    
    ${BOLD}Filtering:${NC}
    -n, --count N           Number of messages to retrieve (default: 50, max: 10000)
    -t, --time PERIOD       Time period (e.g., 10m, 2h, 3d, 1w, 2M)
                            Units: m(inute), h(our), d(ay), w(eek), M(onth)
    
    ${BOLD}Display:${NC}
    -f, --format FORMAT     Output format: pretty (default), json, compact, raw, ai
    --show-translations     Show all available translations
    --show-metadata         Show message metadata (ID, type, status)
    --show-attachments      Show message attachments

${BLUE}ENVIRONMENT VARIABLES:${NC}
    MEESHY_PASSWORD         User password (required if not using -p)
    MEESHY_USERNAME         Username (default: meeshy)
    MEESHY_API_URL          API URL (default: https://gate.meeshy.me)
    MEESHY_FRONTEND_URL     Frontend URL (default: https://meeshy.me)
    MEESHY_CONVERSATION_ID  Conversation ID (default: meeshy)
    MEESHY_CONNECT_TIMEOUT  Connection timeout in seconds (default: 10)
    MEESHY_MAX_TIMEOUT      Maximum request timeout in seconds (default: 30)
    MEESHY_MAX_RETRIES      Maximum retry attempts (default: 3)

${BLUE}TIME PERIOD FORMATS:${NC}
    ${GREEN}Minutes:${NC} 10m, 30min, 45minutes
    ${GREEN}Hours:${NC}   2h, 5hour, 12hours
    ${GREEN}Days:${NC}    1d, 7day, 14days
    ${GREEN}Weeks:${NC}   1w, 2week, 4weeks
    ${GREEN}Months:${NC}  1M, 2month, 6months

${BLUE}OUTPUT FORMATS:${NC}
    ${GREEN}pretty${NC}  - Human-readable formatted output with colors (default)
    ${GREEN}json${NC}    - Raw JSON output (full API response)
    ${GREEN}compact${NC} - One-line per message
    ${GREEN}raw${NC}     - Message content only, no formatting
    ${GREEN}ai${NC}      - AI-friendly structured JSON (clean, essential data only)

${BLUE}AI-FRIENDLY FORMAT:${NC}
    The 'ai' format is specifically designed for AI agents and automation.
    It provides clean, structured JSON with only essential fields:
    - Consistent field names across all messages
    - Flattened sender information
    - Extracted translations as simple array
    - Simplified attachments and reactions
    - No UI decoration or verbose metadata
    
    Perfect for: RAG ingestion, context building, automated responses

${BLUE}EXAMPLES:${NC}
    ${GREEN}# Get last 50 messages (default)${NC}
    export MEESHY_PASSWORD="your_password"
    ${SCRIPT_NAME}

    ${GREEN}# Get last 200 messages${NC}
    ${SCRIPT_NAME} -n 200

    ${GREEN}# Get messages from last 10 minutes${NC}
    ${SCRIPT_NAME} -t 10m

    ${GREEN}# Get messages from last 2 hours${NC}
    ${SCRIPT_NAME} -t 2h

    ${GREEN}# Get messages from last 3 days${NC}
    ${SCRIPT_NAME} -t 3d

    ${GREEN}# Get messages from last week${NC}
    ${SCRIPT_NAME} -t 1w

    ${GREEN}# Get messages from specific conversation${NC}
    ${SCRIPT_NAME} -c tech-team -n 100

    ${GREEN}# JSON output for processing${NC}
    ${SCRIPT_NAME} -f json -n 50 | jq '.[] | .content'

    ${GREEN}# Compact view with translations${NC}
    ${SCRIPT_NAME} -f compact --show-translations -t 1h

    ${GREEN}# Detailed view with all metadata${NC}
    ${SCRIPT_NAME} --show-metadata --show-attachments -n 20

    ${GREEN}# Raw content only (pipe to file)${NC}
    ${SCRIPT_NAME} -f raw -n 100 > messages.txt
    
    ${GREEN}# AI-friendly format for agent ingestion${NC}
    ${SCRIPT_NAME} -t 2h -f ai > context.json
    
    ${GREEN}# Get clean data for RAG/LLM context${NC}
    ${SCRIPT_NAME} -n 50 -f ai | jq '.[].content' > training_data.txt

${BLUE}EXIT CODES:${NC}
    0   Success
    1   General error
    64  Usage error
    65  Data format error
    67  Authentication error
    69  Service unavailable
    77  Permission denied
    78  Configuration error

${BLUE}NOTES:${NC}
    - Time-based filtering is approximate (months = 30 days)
    - Maximum 10000 messages per request
    - Messages are returned in reverse chronological order (newest first)
    - Password is required either via -p or MEESHY_PASSWORD environment variable

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
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                show_help
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
            -n|--count)
                [[ -z "${2:-}" ]] && die "Option -n requires an argument" "$EXIT_USAGE"
                validate_count "$2"
                FILTER_MODE="count"
                FILTER_COUNT="$2"
                shift 2
                ;;
            -t|--time)
                [[ -z "${2:-}" ]] && die "Option -t requires an argument" "$EXIT_USAGE"
                local time_arg="$2"
                
                # Parse time argument (e.g., "10m", "2h", "3d")
                if [[ "$time_arg" =~ ^([0-9]+)([a-zA-Z]+)$ ]]; then
                    local value="${BASH_REMATCH[1]}"
                    local unit="${BASH_REMATCH[2]}"
                    validate_time_filter "$value" "$unit"
                    FILTER_MODE="time"
                else
                    die "Invalid time format: $time_arg\nUse format like: 10m, 2h, 3d, 1w, 2M" "$EXIT_USAGE"
                fi
                shift 2
                ;;
            -f|--format)
                [[ -z "${2:-}" ]] && die "Option -f requires an argument" "$EXIT_USAGE"
                case "$2" in
                    pretty|json|compact|raw|ai)
                        OUTPUT_FORMAT="$2"
                        ;;
                    *)
                        die "Invalid format: $2\nValid formats: pretty, json, compact, raw, ai" "$EXIT_USAGE"
                        ;;
                esac
                shift 2
                ;;
            --show-translations)
                SHOW_TRANSLATIONS=true
                shift
                ;;
            --show-metadata)
                SHOW_METADATA=true
                shift
                ;;
            --show-attachments)
                SHOW_ATTACHMENTS=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -*)
                die "Unknown option: $1\nUse --help for available options" "$EXIT_USAGE"
                ;;
            *)
                die "Unexpected argument: $1\nUse --help for usage information" "$EXIT_USAGE"
                ;;
        esac
    done
    
    # Export parsed values (readonly to prevent tampering)
    PARSED_USERNAME="$current_username"
    PARSED_PASSWORD="$current_password"
    PARSED_CONV_ID="$current_conv_id"
    PARSED_API_URL="$current_api_url"
    readonly PARSED_USERNAME PARSED_PASSWORD PARSED_CONV_ID PARSED_API_URL
}

#########################################
# Main execution
#########################################

main() {
    # Check dependencies first
    check_dependencies
    
    # Parse arguments
    parse_arguments "$@"
    
    # Validate requirements
    [[ -z "$PARSED_PASSWORD" ]] && die "Password is required\nSet MEESHY_PASSWORD or use -p option" "$EXIT_CONFIG"
    
    # Validate inputs
    validate_url "$PARSED_API_URL"
    validate_username "$PARSED_USERNAME"
    validate_conversation_id "$PARSED_CONV_ID"
    
    # Determine if we should show headers (not for json/raw/ai formats)
    local show_headers=true
    if [[ "$OUTPUT_FORMAT" == "json" ]] || [[ "$OUTPUT_FORMAT" == "raw" ]] || [[ "$OUTPUT_FORMAT" == "ai" ]]; then
        show_headers=false
    fi
    
    # Display header
    if [[ "$show_headers" == "true" ]]; then
        echo "" >&2
        echo -e "${CYAN}╔════════════════════════════════════════════════════════════════════════════╗${NC}" >&2
        echo -e "${CYAN}║        Meeshy Message Receiver (MMR) v${SCRIPT_VERSION}                           ║${NC}" >&2
        echo -e "${CYAN}╚════════════════════════════════════════════════════════════════════════════╝${NC}" >&2
        echo "" >&2
        
        # Display configuration
        log_step "Configuration:"
        echo "  ${BLUE}API URL:${NC} $PARSED_API_URL" >&2
        echo "  ${BLUE}Username:${NC} $PARSED_USERNAME" >&2
        echo "  ${BLUE}Conversation:${NC} $PARSED_CONV_ID" >&2
        echo "  ${BLUE}Format:${NC} $OUTPUT_FORMAT" >&2
        
        if [[ "$FILTER_MODE" == "count" ]]; then
            echo "  ${BLUE}Filter:${NC} Last ${FILTER_COUNT} messages" >&2
        else
            echo "  ${BLUE}Filter:${NC} Last ${FILTER_TIME_VALUE} ${FILTER_TIME_UNIT}" >&2
        fi
        
        [[ "$SHOW_TRANSLATIONS" == "true" ]] && echo "  ${BLUE}Translations:${NC} Enabled" >&2
        [[ "$SHOW_METADATA" == "true" ]] && echo "  ${BLUE}Metadata:${NC} Enabled" >&2
        [[ "$SHOW_ATTACHMENTS" == "true" ]] && echo "  ${BLUE}Attachments:${NC} Enabled" >&2
        
        echo "" >&2
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
    
    # Check conversation access
    check_conversation_access "$auth_token" "$user_id" "$PARSED_CONV_ID"
    
    # Retrieve messages
    local messages_json
    messages_json=$(retrieve_messages "$auth_token" "$PARSED_CONV_ID")
    
    # Display messages
    display_messages "$messages_json"
    
    # Display footer
    if [[ "$OUTPUT_FORMAT" == "pretty" ]]; then
        echo -e "${CYAN}╔════════════════════════════════════════════════════════════════════════════╗${NC}" >&2
        echo -e "${CYAN}║        Meeshy - Breaking language barriers                                ║${NC}" >&2
        echo -e "${CYAN}╚════════════════════════════════════════════════════════════════════════════╝${NC}" >&2
        echo "" >&2
    fi
    
    exit "$EXIT_OK"
}

# Execute main function with all arguments
main "$@"

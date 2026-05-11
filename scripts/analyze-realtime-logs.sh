#!/usr/bin/env bash
# analyze-realtime-logs.sh
#
# Parse the gateway stdout produced by Phase A real-time instrumentation
# (commits 38b42de4..b4457909) and produce per-clientMessageId timelines
# with durationMs per step. Read-only — never modifies the source log.
#
# Usage:
#   ./scripts/analyze-realtime-logs.sh <gateway-log-file> [client-message-id]
#
# Example:
#   pnpm --filter @meeshy/gateway dev 2>&1 | tee /tmp/gw.log
#   # send a message from iOS, copy its clientMessageId from the simulator console
#   ./scripts/analyze-realtime-logs.sh /tmp/gw.log cid_a1b2c3d4-...
#
# Without a filter, prints a summary table of every unique clientMessageId
# observed in the log, sorted by total handleMessage durationMs (slowest
# first).

set -euo pipefail

LOG_FILE="${1:-}"
CMID_FILTER="${2:-}"

if [[ -z "$LOG_FILE" ]]; then
  echo "Usage: $0 <gateway-log-file> [client-message-id]" >&2
  exit 2
fi
if [[ ! -r "$LOG_FILE" ]]; then
  echo "ERROR: log file not readable: $LOG_FILE" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required (brew install jq)" >&2
  exit 1
fi

# Extract every perf:* event into one JSON object per line.
# Gateway log line shape:
#   2026-05-11T11:43:02.277Z [INFO] [GWY] [MessagingService] {"msg":"perf:...","data":{...}}
# We grab the trailing JSON, then merge the wall-clock timestamp back in so we
# can preserve true chronological order across requests.
extract_events() {
  grep -E 'perf:|push\.send|push\.token\.' "$LOG_FILE" \
    | grep -oE '\{"msg":[^}]*\{[^}]*\}\}' \
    | jq -c --arg src "$LOG_FILE" '. + {_src: $src}' 2>/dev/null \
    || true
}

# Build the unique CMID list (excluding events without a clientMessageId, like
# push.send* which carry tokenId instead).
list_cmids() {
  extract_events \
    | jq -r 'select(.data.clientMessageId != null) | .data.clientMessageId' \
    | sort -u
}

# Per-cmid timeline. For each step that has start/end, compute durationMs from
# the end log; for orphan events (start without end, or vice versa), emit a
# warning marker.
timeline_for_cmid() {
  local cmid="$1"
  extract_events \
    | jq -c --arg cmid "$cmid" 'select(.data.clientMessageId == $cmid)' \
    | jq -r '
        .data
        | "\(.phase // "info")\t\(.step // .msg)\t\(.durationMs // -1)\t\(.messageId // "")\t\(.errored // false)"
      ' \
    | awk -F'\t' '
        BEGIN { totalMs = 0; print "PHASE\tSTEP\tDURATION_MS\tMESSAGE_ID\tERR" }
        $1 == "end" {
          dur = $3 + 0
          totalMs = (dur > totalMs ? dur : totalMs)
          tag = dur > 500 ? "🔴" : (dur > 100 ? "🟡" : "🟢")
          printf "%s\t%s\t%s %s\t%s\t%s\n", $1, $2, tag, dur, $4, $5
          next
        }
        { print }
        END { printf "\n(slowest step durationMs in this request: %d)\n", totalMs }
      '
}

# Push-specific events have tokenId/apnsEnv keys instead of clientMessageId.
push_summary() {
  extract_events \
    | jq -r '
        select(.msg | startswith("perf:push.") or startswith("push."))
        | "\(.msg)\t\(.data.tokenId // "")\t\(.data.apnsEnv // "")\t\(.data.durationMs // "")\t\(.data.reason // .data.errorMessage // "")"
      ' \
    | sort -u
}

# Cross-cmid summary: total saveMessage time per request, sorted desc.
summary_table() {
  extract_events \
    | jq -r '
        select(.data.step == "messaging.saveMessage" and .data.phase == "end")
        | "\(.data.durationMs)\t\(.data.clientMessageId // "?")\t\(.data.messageId // "?")"
      ' \
    | sort -k1 -nr -t$'\t' \
    | awk -F'\t' 'BEGIN { print "saveMessageMs\tclientMessageId\tmessageId" } { print }'
}

if [[ -n "$CMID_FILTER" ]]; then
  echo "═══ Timeline for $CMID_FILTER ═══"
  timeline_for_cmid "$CMID_FILTER"
  echo
  echo "═══ Push events (no cmid filter — same gateway log) ═══"
  push_summary
else
  echo "═══ Observed clientMessageIds ═══"
  list_cmids
  echo
  echo "═══ Summary: messaging.saveMessage durationMs per request (slowest first) ═══"
  summary_table
  echo
  echo "═══ Push events ═══"
  push_summary
  echo
  echo "Run again with a specific clientMessageId to see its full timeline:"
  echo "  $0 $LOG_FILE <cid_...>"
fi

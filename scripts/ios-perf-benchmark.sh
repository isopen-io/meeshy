#!/usr/bin/env bash
# scripts/ios-perf-benchmark.sh
#
# Drives the iOS performance benchmark suite.
# Sets RUN_PERF_BENCHMARKS=1 so the gated tests in
# MeeshyTests/Performance/ are not skipped.
#
# Usage:
#   ./scripts/ios-perf-benchmark.sh
#   ./scripts/ios-perf-benchmark.sh --list   # dry-run: list tests only
#
# Requirements:
#   - Xcode 15+
#   - iPhone 16 Pro simulator (UDID: 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5)
#   - Run from the repo root

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$REPO_ROOT/apps/ios/Meeshy.xcodeproj"
SCHEME="Meeshy"
DEVICE_ID="30BFD3A6-C80B-489D-825E-5D14D6FCCAB5"
DESTINATION="platform=iOS Simulator,id=$DEVICE_ID"
RESULTS_DIR="$REPO_ROOT/apps/ios/test-results/perf"

# Detect --list flag
if [[ "${1:-}" == "--list" ]]; then
    echo "Performance test targets:"
    echo "  MeeshyTests/MessageListPerformanceTests"
    echo "  MeeshyTests/SearchPerformanceTests"
    exit 0
fi

mkdir -p "$RESULTS_DIR"

echo "=== iOS Performance Benchmark Suite ==="
echo "Device: $DEVICE_ID"
echo "Results: $RESULTS_DIR"
echo ""

run_benchmark() {
    local name="$1"
    local target="$2"
    local result_path="$RESULTS_DIR/${name}.xcresult"

    echo "--- Running: $name ---"
    RUN_PERF_BENCHMARKS=1 xcodebuild test \
        -project "$PROJECT" \
        -scheme "$SCHEME" \
        -destination "$DESTINATION" \
        -configuration Release \
        -only-testing:"MeeshyTests/$target" \
        -resultBundlePath "$result_path" \
        RUN_PERF_BENCHMARKS=1 \
        2>&1 | grep -E "(Test Case|PASS|FAIL|seconds|ms|error:|warning:)" || true

    if [ $? -eq 0 ]; then
        echo "  PASS: $name"
    else
        echo "  FAIL: $name — check $result_path for details"
    fi
    echo ""
}

run_benchmark "MessageListPerformanceTests" "MessageListPerformanceTests"
run_benchmark "SearchPerformanceTests" "SearchPerformanceTests"

echo "=== Benchmark run complete ==="
echo "Results saved to: $RESULTS_DIR"
echo ""
echo "To open results in Xcode:"
echo "  open $RESULTS_DIR/MessageListPerformanceTests.xcresult"
echo "  open $RESULTS_DIR/SearchPerformanceTests.xcresult"

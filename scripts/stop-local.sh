#!/bin/bash
# Arrêt des services locaux Meeshy

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "⏹️  Arrêt des services Meeshy..."

for pidfile in "$ROOT_DIR/logs"/*.pid; do
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile")
        name=$(basename "$pidfile" .pid)
        if kill -0 "$pid" 2>/dev/null; then
            echo "  Arrêt de $name (PID: $pid)..."
            kill "$pid" 2>/dev/null || true
        fi
        rm -f "$pidfile"
    fi
done

# Kill any remaining processes on dev ports
for port in 3000 3100 8000; do
    pid=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo "  Libération du port $port..."
        kill $pid 2>/dev/null || true
    fi
done

echo "✓ Services arrêtés"

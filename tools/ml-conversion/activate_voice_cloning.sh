#!/bin/bash
# Quick activation script for voice cloning environment
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/.venv/bin/activate"
echo "Voice cloning environment activated!"
echo "Run: python voice_cloning_test.py --help"

#!/bin/bash
# Voice Cloning Environment Setup
# ================================
# Uses uv for fast package installation
#
# Usage:
#   ./setup_voice_cloning.sh              # Install Chatterbox only (default)
#   ./setup_voice_cloning.sh --xtts       # Install both Chatterbox and XTTS
#   ./setup_voice_cloning.sh --help       # Show help

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
PYTHON_VERSION="3.11"
INSTALL_XTTS=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

show_help() {
    echo "Voice Cloning Environment Setup"
    echo ""
    echo "Usage: ./setup_voice_cloning.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --xtts        Install XTTS-v2 in addition to Chatterbox"
    echo "  --python VER  Use specific Python version (default: 3.11)"
    echo "  --clean       Remove existing venv before setup"
    echo "  --help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./setup_voice_cloning.sh              # Chatterbox only"
    echo "  ./setup_voice_cloning.sh --xtts       # Both engines"
    echo "  ./setup_voice_cloning.sh --clean      # Fresh install"
    echo ""
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --xtts)
            INSTALL_XTTS=true
            shift
            ;;
        --python)
            PYTHON_VERSION="$2"
            shift 2
            ;;
        --clean)
            if [ -d "$VENV_DIR" ]; then
                print_warning "Removing existing virtual environment..."
                rm -rf "$VENV_DIR"
            fi
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

print_header "Voice Cloning Setup"

# Check for uv
if ! command -v uv &> /dev/null; then
    print_warning "uv not found. Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh

    # Add uv to PATH for this session
    export PATH="$HOME/.local/bin:$PATH"

    if ! command -v uv &> /dev/null; then
        print_error "Failed to install uv. Please install manually:"
        echo "  curl -LsSf https://astral.sh/uv/install.sh | sh"
        exit 1
    fi
    print_success "uv installed successfully"
fi

echo "Using uv version: $(uv --version)"

# Create virtual environment
print_header "Creating Virtual Environment"

if [ -d "$VENV_DIR" ]; then
    print_warning "Virtual environment already exists at $VENV_DIR"
    echo "  Use --clean to recreate it"
else
    echo "Creating venv with Python $PYTHON_VERSION..."
    uv venv --python "$PYTHON_VERSION" "$VENV_DIR"
    print_success "Virtual environment created"
fi

# Activate virtual environment
source "$VENV_DIR/bin/activate"
print_success "Virtual environment activated"

# Install core dependencies
print_header "Installing Core Dependencies"

echo "Installing from requirements_voice_cloning.txt..."
uv pip install -r "$SCRIPT_DIR/requirements_voice_cloning.txt"
print_success "Core dependencies installed"

# Install Chatterbox TTS from GitHub (for multilingual support)
print_header "Installing Chatterbox TTS (with Multilingual)"

echo "Installing from GitHub for multilingual support..."
uv pip install "chatterbox-tts @ git+https://github.com/resemble-ai/chatterbox.git"
print_success "Chatterbox TTS installed (with multilingual support)"

# Install XTTS if requested
if [ "$INSTALL_XTTS" = true ]; then
    print_header "Installing XTTS-v2"

    # Check Python version for XTTS compatibility
    PYTHON_MINOR=$(python -c "import sys; print(sys.version_info.minor)")
    if [ "$PYTHON_MINOR" -ge 12 ]; then
        print_warning "XTTS requires Python <3.12, but you have Python 3.$PYTHON_MINOR"
        print_warning "Skipping XTTS installation"
    else
        uv pip install "TTS>=0.22.0"
        print_success "XTTS-v2 installed"
    fi
fi

# Verify installation
print_header "Verifying Installation"

echo "Checking imports..."

python -c "
import sys
print(f'Python: {sys.version}')

# Check core libraries
import torch
print(f'PyTorch: {torch.__version__}')
print(f'Device: {\"cuda\" if torch.cuda.is_available() else \"mps\" if torch.backends.mps.is_available() else \"cpu\"}')

import librosa
print(f'Librosa: {librosa.__version__}')

import sounddevice
print('Sounddevice: OK')

import soundfile
print('Soundfile: OK')

# Check Chatterbox
try:
    from chatterbox.tts import ChatterboxTTS
    print('Chatterbox TTS: OK')
except ImportError as e:
    print(f'Chatterbox TTS: FAILED - {e}')

# Check Chatterbox Multilingual
try:
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    print('Chatterbox Multilingual: OK (23 languages)')
except ImportError as e:
    print(f'Chatterbox Multilingual: NOT AVAILABLE - {e}')

# Check XTTS
try:
    from TTS.api import TTS
    print('XTTS-v2: OK')
except ImportError:
    print('XTTS-v2: Not installed (optional)')

# Check Whisper
try:
    import whisper
    print('Whisper: OK')
except ImportError as e:
    print(f'Whisper: FAILED - {e}')

# Check translator
try:
    from deep_translator import GoogleTranslator
    print('Deep Translator: OK')
except ImportError as e:
    print(f'Deep Translator: FAILED - {e}')
"

print_success "Installation verified"

# Print usage instructions
print_header "Setup Complete!"

echo -e "To activate the environment:"
echo -e "  ${GREEN}source $VENV_DIR/bin/activate${NC}"
echo ""
echo -e "To run voice cloning test:"
echo -e "  ${GREEN}python voice_cloning_test.py --record 10 --targets fr${NC}"
echo ""
echo -e "To use XTTS engine:"
echo -e "  ${GREEN}python voice_cloning_test.py --record 10 --targets fr --engine xtts${NC}"
echo ""
echo -e "For help:"
echo -e "  ${GREEN}python voice_cloning_test.py --help${NC}"
echo ""

# Create activation helper
cat > "$SCRIPT_DIR/activate_voice_cloning.sh" << 'EOF'
#!/bin/bash
# Quick activation script for voice cloning environment
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/.venv/bin/activate"
echo "Voice cloning environment activated!"
echo "Run: python voice_cloning_test.py --help"
EOF
chmod +x "$SCRIPT_DIR/activate_voice_cloning.sh"

print_success "Created activate_voice_cloning.sh for quick activation"

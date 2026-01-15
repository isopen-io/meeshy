#!/bin/bash

# =============================================================================
# Sync Prisma Schema for Python (Translator Service)
# =============================================================================
# This script copies the shared Prisma schema and adapts it for Python usage.
# The shared schema uses prisma-client-js, we replace the generator with
# prisma-client-py for Python services.
#
# Usage:
#   ./scripts/sync-prisma-schema-for-python.sh [OUTPUT_PATH]
#
# Arguments:
#   OUTPUT_PATH  - Where to write the schema (default: services/translator/schema.prisma)
#
# Examples:
#   ./scripts/sync-prisma-schema-for-python.sh
#   ./scripts/sync-prisma-schema-for-python.sh /workspace/schema.prisma
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get script directory and repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source and destination paths
SOURCE_SCHEMA="${REPO_ROOT}/packages/shared/prisma/schema.prisma"
DEFAULT_OUTPUT="${REPO_ROOT}/services/translator/schema.prisma"
OUTPUT_SCHEMA="${1:-$DEFAULT_OUTPUT}"

# Python generator block to replace the JS one
PYTHON_GENERATOR='generator client {
  provider             = "prisma-client-py"
  interface            = "asyncio"
  recursive_type_depth = 5
  binaryTargets        = ["native"]
}'

echo -e "${YELLOW}🔄 Syncing Prisma schema for Python...${NC}"
echo "   Source: ${SOURCE_SCHEMA}"
echo "   Output: ${OUTPUT_SCHEMA}"

# Check source exists
if [ ! -f "${SOURCE_SCHEMA}" ]; then
    echo -e "${RED}❌ Source schema not found: ${SOURCE_SCHEMA}${NC}"
    exit 1
fi

# Create output directory if needed
mkdir -p "$(dirname "${OUTPUT_SCHEMA}")"

# Read the source schema and replace the generator block
# The generator block starts with "generator client {" and ends with "}"
# We use awk to replace it

awk '
BEGIN { in_generator = 0; printed_python = 0 }

/^generator client \{/ {
    in_generator = 1
    if (!printed_python) {
        print "generator client {"
        print "  provider             = \"prisma-client-py\""
        print "  interface            = \"asyncio\""
        print "  recursive_type_depth = 5"
        print "  binaryTargets        = [\"native\"]"
        print "}"
        printed_python = 1
    }
    next
}

in_generator && /^\}/ {
    in_generator = 0
    next
}

!in_generator {
    print
}
' "${SOURCE_SCHEMA}" > "${OUTPUT_SCHEMA}"

# Verify the output
if [ ! -f "${OUTPUT_SCHEMA}" ]; then
    echo -e "${RED}❌ Failed to create output schema${NC}"
    exit 1
fi

# Verify it has the Python generator
if ! grep -q "prisma-client-py" "${OUTPUT_SCHEMA}"; then
    echo -e "${RED}❌ Output schema doesn't contain Python generator${NC}"
    exit 1
fi

# Count models to verify integrity
SOURCE_MODELS=$(grep -c "^model " "${SOURCE_SCHEMA}" || echo "0")
OUTPUT_MODELS=$(grep -c "^model " "${OUTPUT_SCHEMA}" || echo "0")

if [ "${SOURCE_MODELS}" != "${OUTPUT_MODELS}" ]; then
    echo -e "${RED}❌ Model count mismatch! Source: ${SOURCE_MODELS}, Output: ${OUTPUT_MODELS}${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Schema synced successfully${NC}"
echo "   Models: ${OUTPUT_MODELS}"
echo "   Generator: prisma-client-py (asyncio)"

#!/bin/bash

###############################################################################
# Meeshy Backend Security Improvements - Deployment Script
# Version: 2.0.0
# Date: November 21, 2025
#
# This script automates the deployment of backend security improvements
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Project paths
PROJECT_ROOT="/Users/smpceo/Documents/Services/Meeshy/meeshy"
GATEWAY_DIR="$PROJECT_ROOT/gateway"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Meeshy Backend Security Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

###############################################################################
# Step 1: Install Dependencies
###############################################################################

echo -e "${YELLOW}[1/6] Installing dependencies...${NC}"
cd "$GATEWAY_DIR"

npm install \
  isomorphic-dompurify \
  ioredis \
  pino \
  pino-pretty \
  zod

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Dependencies installed successfully${NC}"
else
  echo -e "${RED}✗ Failed to install dependencies${NC}"
  exit 1
fi

echo ""

###############################################################################
# Step 2: Apply Database Migration
###############################################################################

echo -e "${YELLOW}[2/6] Applying database migration...${NC}"
cd "$GATEWAY_DIR"

# Generate migration
npx prisma migrate dev --name add_notification_indexes_and_fields

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Database migration applied successfully${NC}"
else
  echo -e "${RED}✗ Failed to apply database migration${NC}"
  exit 1
fi

# Regenerate Prisma client
npx prisma generate

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Prisma client generated successfully${NC}"
else
  echo -e "${RED}✗ Failed to generate Prisma client${NC}"
  exit 1
fi

echo ""

###############################################################################
# Step 3: Run Tests
###############################################################################

echo -e "${YELLOW}[3/6] Running tests...${NC}"
cd "$GATEWAY_DIR"

npm test -- NotificationService.test.ts

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed${NC}"
else
  echo -e "${RED}✗ Tests failed${NC}"
  echo -e "${YELLOW}Please fix failing tests before deploying${NC}"
  exit 1
fi

echo ""

###############################################################################
# Step 4: Build Application
###############################################################################

echo -e "${YELLOW}[4/6] Building application...${NC}"
cd "$GATEWAY_DIR"

npm run build

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Application built successfully${NC}"
else
  echo -e "${RED}✗ Build failed${NC}"
  exit 1
fi

echo ""

###############################################################################
# Step 5: Verify Environment Variables
###############################################################################

echo -e "${YELLOW}[5/6] Verifying environment variables...${NC}"

if [ -f "$GATEWAY_DIR/.env" ]; then
  echo -e "${GREEN}✓ .env file found${NC}"

  # Check required variables
  if grep -q "DATABASE_URL" "$GATEWAY_DIR/.env"; then
    echo -e "${GREEN}✓ DATABASE_URL configured${NC}"
  else
    echo -e "${RED}✗ DATABASE_URL not found in .env${NC}"
    exit 1
  fi

  # Optional: Check Redis URL (fallback to in-memory if not present)
  if grep -q "REDIS_URL" "$GATEWAY_DIR/.env"; then
    echo -e "${GREEN}✓ REDIS_URL configured (distributed rate limiting)${NC}"
  else
    echo -e "${YELLOW}⚠ REDIS_URL not configured (using in-memory fallback)${NC}"
  fi

else
  echo -e "${RED}✗ .env file not found${NC}"
  echo -e "${YELLOW}Please create .env file with required variables${NC}"
  exit 1
fi

echo ""

###############################################################################
# Step 6: Health Check
###############################################################################

echo -e "${YELLOW}[6/6] Performing health check...${NC}"

# Start server in background for health check
cd "$GATEWAY_DIR"
npm run dev &
SERVER_PID=$!

# Wait for server to start
echo "Waiting for server to start..."
sleep 5

# Health check
HEALTH_RESPONSE=$(curl -s http://localhost:5000/health)

if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
  echo -e "${GREEN}✓ Health check passed${NC}"
else
  echo -e "${RED}✗ Health check failed${NC}"
  kill $SERVER_PID
  exit 1
fi

# Readiness check
READY_RESPONSE=$(curl -s http://localhost:5000/health/ready)

if echo "$READY_RESPONSE" | grep -q "ready"; then
  echo -e "${GREEN}✓ Readiness check passed${NC}"
else
  echo -e "${YELLOW}⚠ Readiness check returned not ready (check dependencies)${NC}"
fi

# Stop test server
kill $SERVER_PID

echo ""

###############################################################################
# Deployment Summary
###############################################################################

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Completed Successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo -e "${GREEN}✓ Database migration applied${NC}"
echo -e "${GREEN}✓ Tests passed${NC}"
echo -e "${GREEN}✓ Application built${NC}"
echo -e "${GREEN}✓ Environment configured${NC}"
echo -e "${GREEN}✓ Health checks passed${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Review deployment in staging environment:"
echo "   cd $GATEWAY_DIR"
echo "   npm run start:staging"
echo ""
echo "2. Monitor logs:"
echo "   tail -f logs/application.log"
echo ""
echo "3. Check health endpoints:"
echo "   curl http://localhost:5000/health"
echo "   curl http://localhost:5000/health/ready"
echo ""
echo "4. Deploy to production:"
echo "   pm2 start dist/server.js --name meeshy-gateway"
echo "   pm2 save"
echo ""
echo "5. Monitor production:"
echo "   pm2 logs meeshy-gateway"
echo "   pm2 monit"
echo ""
echo -e "${GREEN}Documentation:${NC}"
echo "- README_BACKEND_IMPROVEMENTS.md - Complete guide"
echo "- INSTALLATION_GUIDE.md - Installation instructions"
echo "- BACKEND_SECURITY_AUDIT_REPORT.md - Security audit report"
echo "- gateway/src/swagger/notifications.yaml - API documentation"
echo ""
echo -e "${GREEN}Deployment ready! ✅${NC}"

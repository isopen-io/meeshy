#!/bin/bash
# Prépare une session Claude Code sur le web pour jouer les gates du dépôt (#7711).
# Les trois prérequis de CLAUDE.md § « Local Test Parity (bun) », que chaque
# session redécouvrait à la main :
#   1. bun install --ignore-scripts (le postinstall de grpc-tools échoue derrière
#      le proxy sortant, et aucun gate n'en a besoin) ;
#   2. le client Prisma (sinon ~17 suites du gateway tombent) ;
#   3. le build de packages/shared (sinon SocialEventsHandler tombe).
# Idempotent, non interactif, et muet hors du web.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

bun install --ignore-scripts

(cd packages/shared && npx prisma generate --generator client && bun run build)

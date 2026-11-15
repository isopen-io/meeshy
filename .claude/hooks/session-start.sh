#!/bin/bash
# Prépare une session Claude Code sur le web pour jouer les gates du dépôt (#7711).
# Les trois prérequis de CLAUDE.md § « Local Test Parity (bun) », que chaque
# session redécouvrait à la main :
#   1. bun install --ignore-scripts --no-save (le postinstall de grpc-tools échoue
#      derrière le proxy sortant, et aucun gate n'en a besoin) ;
#   2. le client Prisma (sinon ~17 suites du gateway tombent) ;
#   3. le build de packages/shared (sinon SocialEventsHandler tombe).
# Idempotent, non interactif, et muet hors du web.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# --no-save : le bun de l'image (1.4.4 au 2026-11-06) n'est pas celui que la CI
# épingle (BUN_VERSION 1.3.14 dans ci.yml et docker.yml). Sans lui, l'install
# RÉÉCRIT bun.lock — lockfileVersion 1 -> 3 — et chaque session démarre sur un
# arbre sale. Le hook Stop réclame alors de committer, ce qui pousserait une
# migration de format de lockfile faite par un bun que ni la CI ni les images
# Docker n'utilisent : panne d'installation à l'échelle du dépôt, pour un
# changement que personne n'a demandé. L'install est identique (« no changes »),
# seule l'écriture du lockfile est retenue — c'est déjà l'idiome des Dockerfiles
# du dépôt (apps/web/Dockerfile, services/gateway/Dockerfile). #16550
bun install --ignore-scripts --no-save

(cd packages/shared && npx prisma generate --generator client && bun run build)

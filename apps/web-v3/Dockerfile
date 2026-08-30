# syntax=docker.io/docker/dockerfile:1
# =============================================================================
# MEESHY WEB v3 — zone Next servie sous le prefixe /__v3
# Build context: monorepo root (../../)
# Dockerfile: apps/web-v3/Dockerfile
# Supports: bun (default) or pnpm via PACKAGE_MANAGER build arg
# =============================================================================
#
# Calquee sur `apps/web/Dockerfile` — meme base, meme etagement, meme origine du
# binaire bun — mais SANS l'entrypoint d'injection d'URL au demarrage : la zone
# v3 ne lit aujourd'hui aucune variable `NEXT_PUBLIC_*` au build. Le jour ou
# elle en lira une, c'est le patron de la zone legacy qui est a reprendre, pas
# un second a inventer.
#
# Le port est 3300, jamais 3100 : les deux zones tournent cote a cote derriere
# le meme Traefik, et c'est la seule chose qui les distingue au niveau reseau.

# ===== BUN DIST =====
# Binaire bun copie depuis l'image officielle plutot que telecharge via
# bun.sh/install : l'installateur tire GitHub Releases, dont le transport meurt
# par intermittence. Meme raison, meme source que la zone legacy.
ARG BUN_VERSION=1.1.38
FROM docker.io/oven/bun:${BUN_VERSION}-alpine AS bun-dist

FROM node:22-alpine AS base

LABEL maintainer="Meeshy Development Team <dev@meeshy.me>" \
      description="Meeshy Web v3 - Next.js zone served under /__v3" \
      org.opencontainers.image.source="https://github.com/isopen-io/meeshy" \
      org.opencontainers.image.vendor="Meeshy" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.title="Meeshy Web v3" \
      org.opencontainers.image.description="Next.js v3 zone for the Meeshy platform"

ARG BUILD_DATE
ARG VCS_REF
ARG VERSION=0.0.0

LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.version="${VERSION}"

ARG PACKAGE_MANAGER=bun
ARG PNPM_VERSION=9.15.0
ARG BUN_VERSION=1.1.38

ENV NODE_ENV=production \
    PORT=3300 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME="/pnpm" \
    BUN_INSTALL="/bun" \
    PATH="/pnpm:/bun/bin:$PATH" \
    NPM_CONFIG_CACHE="/tmp/.npm" \
    NEXT_CACHE_DIR="/app/.next/cache"

# ===== DEPS STAGE =====
FROM base AS deps
ARG PACKAGE_MANAGER=bun
ARG PNPM_VERSION=9.15.0

RUN apk add --no-cache libc6-compat tini curl bash

WORKDIR /app

COPY apps/web-v3/package.json ./

# Le paquet partage voyage avec la zone : `tsconfig.json` resout deja
# `@meeshy/shared`, et le premier ecran qui lira le contrat de donnees en aura
# besoin au build, pas au deploiement.
COPY packages/shared/ ./packages/shared/

RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      node -e "const fs = require('fs'); const p = JSON.parse(fs.readFileSync('package.json', 'utf8')); p.workspaces = ['packages/shared']; fs.writeFileSync('package.json', JSON.stringify(p, null, 2));" && \
      printf 'packages:\n  - "packages/shared"\n' > pnpm-workspace.yaml; \
    else \
      printf 'packages:\n  - "."\n  - "packages/shared"\n' > pnpm-workspace.yaml; \
    fi

COPY --from=bun-dist /usr/local/bin/bun /usr/local/bin/bun
RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      bun install --no-save; \
    else \
      corepack enable pnpm && \
      corepack prepare pnpm@${PNPM_VERSION} --activate && \
      pnpm install --no-frozen-lockfile; \
    fi

RUN cd packages/shared && \
    if [ "$PACKAGE_MANAGER" = "bun" ]; then bun run build; else pnpm run build; fi

# ===== BUILDER STAGE =====
FROM base AS builder
ARG PACKAGE_MANAGER=bun
ARG PNPM_VERSION=9.15.0

RUN apk add --no-cache curl bash

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=bun-dist /usr/local/bin/bun /usr/local/bin/bun

COPY apps/web-v3/ ./

# La copie ci-dessus ecrase la configuration d'espace de travail : la reposer.
RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      node -e "const fs = require('fs'); const p = JSON.parse(fs.readFileSync('package.json', 'utf8')); p.workspaces = ['packages/shared']; fs.writeFileSync('package.json', JSON.stringify(p, null, 2));" && \
      printf 'packages:\n  - "packages/shared"\n' > pnpm-workspace.yaml; \
    else \
      printf 'packages:\n  - "."\n  - "packages/shared"\n' > pnpm-workspace.yaml; \
    fi

ENV NEXT_TELEMETRY_DISABLED=1

RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      bun run build; \
    else \
      corepack enable pnpm && \
      corepack prepare pnpm@${PNPM_VERSION} --activate && \
      pnpm run build; \
    fi

# ===== RUNNER STAGE =====
FROM base AS runner
WORKDIR /app

# Un ARG n'est visible que dans le stage qui le declare et ne franchit pas ce
# `FROM` : sans cette redeclaration, GIT_COMMIT et BUILD_DATE seraient vides.
ARG VCS_REF
ARG BUILD_DATE

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3300 \
    HOSTNAME="0.0.0.0" \
    GIT_COMMIT=${VCS_REF} \
    BUILD_DATE=${BUILD_DATE}

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    apk add --no-cache tini wget

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

RUN mkdir -p /app/logs && \
    chown -R nextjs:nodejs /app && \
    chmod -R 755 /app

USER nextjs

EXPOSE 3300

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "server.js"]

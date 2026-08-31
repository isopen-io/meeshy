# syntax=docker.io/docker/dockerfile:1
# =============================================================================
# MEESHY WEB V3 - Next.js zone servie derrière PathPrefix(`/__v3`)
# Build context: monorepo root (../../)
# Dockerfile: apps/web-v3/Dockerfile
# Supports: bun (default) or pnpm via PACKAGE_MANAGER build arg
# =============================================================================
# Calqué sur apps/web/Dockerfile, MOINS ce que la v3 n'a pas :
#   - `packages/design-tokens`, `packages/icons` et `packages/shared` sont les
#     SEULS paquets du monorepo que la v3 déclare. La règle est générale et
#     gardée : tout ce que la v3 importe hors de `apps/web-v3/` entre dans
#     l'image ET dans les déclencheurs de `docker.yml` (invariants de
#     scripts/check-v3-pipeline.mjs).
#     Le défaut que ça ferme : `app/globals.css` importait la table par chemin
#     relatif ; `COPY apps/web-v3/ ./` seul rendait « Module not found » au
#     premier `page.tsx` — invisible tant que la v3 n'émet aucune page, donc
#     invisible pour un `next build` lancé dans le monorepo intact.
#     `packages/shared` a rejoint la liste avec l'écran `join`, qui lit la table
#     des langues du produit (`SUPPORTED_LANGUAGES`) : une seconde table écrite
#     dans la v3 aurait divergé au premier ajout de langue. Il est le SEUL des
#     trois à se construire — voir l'étape « BUILD DU PAQUET PARTAGÉ ».
#   - aucun entrypoint d'injection d'URL : la v3 ne lit aucun NEXT_PUBLIC_* au
#     build. Les placeholders `__RUNTIME_*__` du legacy n'auraient rien à
#     remplacer.
# Ce qui CHANGE et compte : le port est 3300 (3100 est au legacy, et les deux
# conteneurs tournent côte à côte), et `assetPrefix: '/__v3'` — posé dans
# next.config.ts, donc gravé dans le build — évite que les deux zones se
# disputent `/_next/*` derrière le même hôte.
ARG BUN_VERSION=1.1.38
FROM docker.io/oven/bun:${BUN_VERSION}-alpine AS bun-dist

FROM node:22-alpine AS base

LABEL maintainer="Meeshy Development Team <dev@meeshy.me>" \
      description="Meeshy Web v3 - Next.js zone served behind PathPrefix(/__v3)" \
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

ENV NODE_ENV=production \
    PORT=3300 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME="/pnpm" \
    BUN_INSTALL="/bun" \
    PATH="/pnpm:/bun/bin:$PATH" \
    NPM_CONFIG_CACHE="/tmp/.npm"

# ===== DEPS STAGE =====
FROM base AS deps
ARG PACKAGE_MANAGER=bun
ARG PNPM_VERSION=9.15.0

RUN apk add --no-cache libc6-compat tini curl bash

WORKDIR /app

COPY apps/web-v3/package.json ./

# Les paquets du monorepo que la v3 DÉCLARE. Les deux premiers n'ont pas
# d'étape de build : `@meeshy/design-tokens` est trois feuilles CSS,
# `@meeshy/icons` est deux SVG COMMITÉS (le sprite Phosphor et son sous-sprite
# critique, § 8.5) — leur générateur ne tourne jamais ici, et
# `@phosphor-icons/core` est une devDependency de la RACINE qui n'entre pas dans
# l'image. webpack les lit à travers le lien de workspace. Le `workspaces` posé
# ici — bun le lit dans package.json, pnpm dans pnpm-workspace.yaml — est ce qui
# crée ce lien.
#
# `@meeshy/shared`, LUI, se construit — et c'est la raison de l'étape « BUILD
# SHARED » plus bas. Son manifeste expose `./utils/*` vers `dist/utils/*.js` :
# sans `tsc`, `next build` rend « Module not found » au premier écran qui
# l'importe. La v3 en lit la table des langues du produit
# (`SUPPORTED_LANGUAGES`, cf. `app/(public)/chats/[lien]/langues.ts`), et le § 2
# de la conception l'attend de toute façon pour le Zod partagé des formulaires.
# La source ENTIÈRE est copiée, comme `apps/web/Dockerfile` le fait déjà : c'est
# elle que `tsc` consomme.
COPY packages/design-tokens/ ./packages/design-tokens/
COPY packages/icons/ ./packages/icons/
COPY packages/shared/ ./packages/shared/

RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      node -e "const fs = require('fs'); const p = JSON.parse(fs.readFileSync('package.json', 'utf8')); p.workspaces = ['packages/design-tokens', 'packages/icons', 'packages/shared']; fs.writeFileSync('package.json', JSON.stringify(p, null, 2));" && \
      printf 'packages:\n  - "packages/design-tokens"\n  - "packages/icons"\n  - "packages/shared"\n' > pnpm-workspace.yaml; \
    else \
      printf 'packages:\n  - "."\n  - "packages/design-tokens"\n  - "packages/icons"\n  - "packages/shared"\n' > pnpm-workspace.yaml; \
    fi

COPY --from=bun-dist /usr/local/bin/bun /usr/local/bin/bun
RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      echo "=== Installing with bun ===" && \
      bun install --no-save; \
    else \
      echo "=== Installing with pnpm ===" && \
      corepack enable pnpm && \
      corepack prepare pnpm@${PNPM_VERSION} --activate && \
      pnpm install --no-frozen-lockfile; \
    fi

# === BUILD DU PAQUET PARTAGÉ ===
# `@meeshy/shared` s'expose par `dist/` : ce que la v3 importe n'existe qu'après
# `tsc`. L'étage BUILDER recopie `/app/packages` depuis ici, donc le `dist` que
# cette étape produit voyage avec. Même forme que `apps/web/Dockerfile`, pour
# que les deux zones ne construisent pas le même paquet de deux façons.
RUN echo "=== Building shared package ===" && \
    cd packages/shared && \
    if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      bun run build; \
    else \
      pnpm run build; \
    fi && \
    cd /app

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

# `COPY apps/web-v3/ ./` écrase le package.json de l'étage deps, donc la
# configuration de workspace qu'il portait. Sans cette recréation, le lien
# node_modules/@meeshy/design-tokens survit (il vient de deps) mais aucun
# gestionnaire ne le RÉTABLIRAIT si l'install était rejouée ici : on le
# reconstitue à l'identique, comme le fait apps/web/Dockerfile.
RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      node -e "const fs = require('fs'); const p = JSON.parse(fs.readFileSync('package.json', 'utf8')); p.workspaces = ['packages/design-tokens', 'packages/icons', 'packages/shared']; fs.writeFileSync('package.json', JSON.stringify(p, null, 2));" && \
      printf 'packages:\n  - "packages/design-tokens"\n  - "packages/icons"\n  - "packages/shared"\n' > pnpm-workspace.yaml; \
    else \
      printf 'packages:\n  - "."\n  - "packages/design-tokens"\n  - "packages/icons"\n  - "packages/shared"\n' > pnpm-workspace.yaml; \
    fi

ENV NEXT_TELEMETRY_DISABLED=1

RUN if [ "$PACKAGE_MANAGER" = "bun" ]; then \
      echo "=== Building with bun ===" && \
      bun run build; \
    else \
      echo "=== Building with pnpm ===" && \
      corepack enable pnpm && \
      corepack prepare pnpm@${PNPM_VERSION} --activate && \
      pnpm run build; \
    fi

# `output: 'standalone'` place `server.js` sous la racine de traçage que Next
# INFÈRE. Ici l'app est seule sous /app, donc la sortie est à plat ; dans le
# monorepo elle se niche sous `.next/standalone/apps/web-v3/`. L'étage runner
# copie la forme À PLAT : sans cette assertion, une inférence différente ne se
# verrait qu'au démarrage du conteneur, en « Cannot find module server.js ».
RUN test -f .next/standalone/server.js || { \
      echo "ERREUR : .next/standalone/server.js absent — la racine de traçage inférée n'est pas /app." >&2; \
      find .next/standalone -maxdepth 3 -name server.js >&2; \
      exit 1; \
    }

# ===== RUNNER STAGE =====
FROM base AS runner
WORKDIR /app

# Un ARG n'est visible que dans le stage qui le déclare : sans ces deux
# redéclarations, les ENV ci-dessous seraient vides et l'image ne saurait pas
# dire quel commit elle sert.
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

# POURQUOI IL N'Y A PAS `COPY --from=builder /app/public ./public`
#
# Le legacy le porte (apps/web/Dockerfile:224) parce qu'il a un `public/` ;
# `apps/web-v3` n'en a pas, et le COPY d'un répertoire absent ferait échouer le
# build. Ce n'est donc pas un oubli : c'est l'état d'une zone qui ne sert
# encore AUCUN actif à la racine de l'URL.
#
# Mesuré : `output: 'standalone'` ne recopie PAS `public/` dans
# `.next/standalone` (`ls .next/standalone/apps/web-v3` → node_modules,
# package.json, server.js). Sans un COPY explicite, un `public/` qui
# apparaîtrait n'entrerait même pas dans l'image.
#
# Et il n'entrerait pas non plus dans la ZONE : `assetPrefix: '/__v3'` ne
# préfixe que les bundles `_next`, donc `public/sprite.svg` est servi à
# `/sprite.svg` — chemin que le routeur `frontend-v3` ne réclame pas et que le
# legacy sert (voir le doc-comment du service dans docker-compose.prod.yml).
# Le jour où `apps/web-v3/public/` apparaît, DEUX choses doivent bouger
# ensemble : ce COPY, et la règle du routeur. `scripts/check-v3-pipeline.mjs`
# rougit sur chacune des deux, dans les deux sens.

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3300

ENTRYPOINT ["/sbin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget -q --spider http://localhost:3300/healthz || exit 1

CMD ["node", "server.js"]

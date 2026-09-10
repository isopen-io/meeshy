# syntax=docker.io/docker/dockerfile:1
# =============================================================================
# MEESHY WEB v3.1 — l'application à page unique, servie en STATIQUE
# Contexte de construction : la racine du monorepo (../../)
# Dockerfile : apps/web-v3/Dockerfile
# =============================================================================
# CE QUI CHANGE PAR RAPPORT À apps/web-old-version3/Dockerfile, et pourquoi :
#
#   · L'image finale est nginx, pas Node. Cette application n'a AUCUN rendu à
#     l'exécution : Vite émet un bundle et cinq documents préchauffés, point.
#     Un runtime Node n'aurait rien à exécuter — il ne ferait que servir des
#     fichiers, pour ~150 Mo au lieu de ~50.
#
#   · DEUX paquets du monorepo entrent, et seulement ceux que le manifeste
#     déclare : `@meeshy/design-tokens` (la palette dérivée d'iOS) et
#     `@meeshy/shared` (les types du domaine et trois lois — Prisme, présence,
#     accent de conversation). La règle du dépôt est la même dans les deux
#     sens : tout ce que l'application importe hors de `apps/web-v3/` doit
#     entrer dans l'image ET dans les déclencheurs de `docker.yml`, et rien
#     d'autre n'y entre « au cas où ». `packages/shared` a rejoint cette liste
#     avec #5493, quand la projection locale des types a été retirée.
#
#   · La construction TOURNE SOUS BUN, et ce n'est pas une préférence : le
#     greffon de préchauffage de `vite.config.ts` lance
#     `bun run scripts/prerender-institutional.tsx`, qui rend du JSX avec la
#     pragma preact. Une image de construction sans bun produirait un `dist`
#     sans les cinq pages — et un service worker qui servirait la coquille de
#     l'application à leur place. Défaut SILENCIEUX : le build sortirait vert.
ARG BUN_VERSION=1.3.14

# ===== CONSTRUCTION =====
FROM docker.io/oven/bun:${BUN_VERSION}-alpine AS builder

WORKDIR /app

# LE MANIFESTE DE L'APPLICATION DEVIENT CELUI DE LA RACINE, et on lui greffe la
# liste des workspaces RÉELLEMENT présents dans l'image. C'est le motif éprouvé
# d'`apps/web/Dockerfile`, et il ferme un piège : recopier le manifeste de la
# racine du dépôt déclarerait `apps/*`, `services/*`, `packages/*` — neuf
# workspaces dont un seul est ici. L'installation chercherait alors des arbres
# absents.
#
# Corollaire, pour la même raison : PAS de `--frozen-lockfile`. Le lockfile du
# dépôt décrit les neuf workspaces ; l'image n'en porte qu'un, donc un gel
# échouerait sur un écart qui est voulu.
COPY apps/web-v3/package.json ./
COPY packages/design-tokens/ ./packages/design-tokens/
# `@meeshy/shared` est la source de vérité des types ET de trois lois que
# l'application ne réécrit pas (Prisme, présence, accent de conversation). Son
# `exports` pointe `dist/`, donc l'image doit le CONSTRUIRE — c'est du `tsc`
# seul : aucune entrée de son `tsconfig` n'importe `@prisma/client`, ce qui
# tient la génération Prisma hors de cette image.
COPY packages/shared/ ./packages/shared/

# `bun -e` et non `node -e` : l'image de construction est celle de bun, et rien
# n'y garantit un binaire node.
RUN bun -e "const f=require('fs');const p=JSON.parse(f.readFileSync('package.json','utf8'));p.workspaces=['packages/design-tokens','packages/shared'];f.writeFileSync('package.json',JSON.stringify(p,null,2));" \
    && printf 'packages:\n  - "packages/design-tokens"\n  - "packages/shared"\n' > pnpm-workspace.yaml

# `--ignore-scripts` : le postinstall de `grpc-tools` télécharge un binaire par
# une URL S3 que les proxys sortants réécrivent, et l'installation s'arrête là
# en laissant des arbres partiels. Aucun gate de cette application n'en dépend
# (§ « Local Test Parity » du CLAUDE.md racine).
RUN bun install --ignore-scripts --no-save

# CETTE COPIE ÉCRASE LE MANIFESTE PATCHÉ ci-dessus — c'est le défaut que le
# Dockerfile de l'ancienne application avait déjà documenté, et il ne se voit
# pas : l'installation a déjà eu lieu, les liens de workspace tiennent, et rien
# ne rougit tant que personne ne relance une résolution. On le referme en
# rejouant le patch, et on VÉRIFIE que le lien du seul paquet du monorepo est
# bien là avant de construire.
COPY apps/web-v3/ ./

RUN bun -e "const f=require('fs');const p=JSON.parse(f.readFileSync('package.json','utf8'));p.workspaces=['packages/design-tokens','packages/shared'];f.writeFileSync('package.json',JSON.stringify(p,null,2));" \
    && test -e node_modules/@meeshy/design-tokens \
    || { echo "le lien de workspace @meeshy/design-tokens est absent"; exit 1; }
RUN test -e node_modules/@meeshy/shared \
    || { echo "le lien de workspace @meeshy/shared est absent"; exit 1; }

# `@meeshy/shared` sert son `dist/` : sans cette étape, l'import se résout sur
# un répertoire vide et le build échoue — ou pire, un bundler indulgent le
# laisse passer et l'application perd le Prisme en silence.
RUN cd packages/shared && bun run build
RUN test -s packages/shared/dist/utils/conversation-helpers.js \
    || { echo "packages/shared n'a pas produit son dist"; exit 1; }

# **L'ORIGINE DE L'API SE FIGE ICI, ou nulle part (#5872).** `import.meta.env`
# est remplacé à la CONSTRUCTION : une variable posée au démarrage du conteneur
# n'atteindrait jamais le bundle. Sans cet `ARG`, `resolveApiConfig` retombe
# sur l'origine de PRODUCTION — un défaut qui fonctionne, mais qui fait pointer
# staging vers la passerelle de production. C'est le workflow qui déclare la
# valeur par environnement (`docker.yml`, § build-args de `web-v31`).
ARG VITE_API_BASE=""
ENV VITE_API_BASE=${VITE_API_BASE}

# **LA SOURCE DE DONNÉES SE FIGE ICI AUSSI, et pour la même raison (#5929).**
# `config.ts` rend `env.VITE_DATA_SOURCE === 'gateway' ? 'gateway' : 'fixtures'` :
# sans cet `ARG`, l'image se construit sur les FIXTURES — Kwame Mensah, Amina
# Diallo — tout en pointant la vraie passerelle. C'est le pire des deux mondes :
# l'application A L'AIR branchée, et `staging.meeshy.me` a servi des données
# fabriquées jusqu'au 2026-09-10 sans que rien ne rougisse.
#
# Le défaut reste `fixtures` : un `bun run build` local n'exige alors aucune
# passerelle. C'est le workflow qui pose `gateway` sur les images DÉPLOYÉES
# (`docker.yml`, § build-args de `web-v31`), là où une passerelle existe.
ARG VITE_DATA_SOURCE=""
ENV VITE_DATA_SOURCE=${VITE_DATA_SOURCE}

# Le troisième levier de construction, DÉCLARÉ pour être réglable — même s'il
# n'est surchargé nulle part aujourd'hui : `vite.config.ts` lit
# `VITE_READING_MODES !== 'off'`, donc son absence VAUT « activés ». Un
# interrupteur qu'aucun `ARG` n'expose ne peut pas être actionné au
# déploiement, quelle que soit la valeur qu'on croit lui donner.
ARG VITE_READING_MODES=""
ENV VITE_READING_MODES=${VITE_READING_MODES}

# Le build EST le préchauffage : le greffon de `vite.config.ts` écrit les cinq
# documents avant que `vite-plugin-pwa` ne scelle son manifeste de précache.
RUN bun run build

# La preuve que les cinq documents sont là — ici, pas en production. Sans elle,
# une régression du greffon donnerait une image qui démarre, sert
# l'application, et rend une page blanche sur /about au deuxième passage.
RUN set -eu; for p in about contact partners privacy terms; do \
      test -s "/app/dist/$p.html" || { echo "MANQUE dist/$p.html"; exit 1; }; \
      test -s "/app/dist/$p/index.html" || { echo "MANQUE dist/$p/index.html"; exit 1; }; \
    done; \
    grep -q 'about.html' /app/dist/sw.js || { echo "sw.js ne precache pas les pages"; exit 1; }; \
    echo "les cinq pages sont presentes et precachees"

# ===== SERVICE =====
FROM docker.io/nginx:1.29-alpine AS runner

RUN apk add --no-cache tini curl

COPY apps/web-v3/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/ /usr/share/nginx/html/

# 3400 : 3100 est au legacy, 3300 à l'ancienne refonte. Les trois peuvent
# tourner côte à côte pendant la bascule.
EXPOSE 3400

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3400/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["nginx", "-g", "daemon off;"]

# docker-compose.prod.yml Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aligner `infrastructure/docker/compose/docker-compose.prod.yml` du repo sur `/opt/meeshy/production/docker-compose.yml` qui tourne en prod, tout en conservant 11 env vars optionnelles ("queued improvements") rétro-compatibles.

**Architecture:** Stratégie "remplacer + ajouter". On copie le fichier prod comme base, puis on insère les queued improvements à des anchors précis (3 services × 2-5 lignes chacun). Verification par `docker compose config --quiet` + diff baseline avec --ignore-matching-lines pour les comments. Un seul commit atomique final.

**Tech Stack:** Docker Compose v2 syntax, YAML 1.2, bash for verification. No application code changes.

**Spec source:** `docs/superpowers/specs/2026-05-11-docker-compose-prod-reconciliation-design.md`

**Critères de succès terminaux:**
1. `docker compose -f infrastructure/docker/compose/docker-compose.prod.yml config --quiet` retourne 0
2. `diff --ignore-matching-lines='^[[:space:]]*#' /tmp/prod-docker-compose.yml infrastructure/docker/compose/docker-compose.prod.yml` montre uniquement les 11 env vars listées dans cat. 4.2 de la spec
3. Le diff sémantique (services, volumes, networks, container_name, image, ports, depends_on, healthcheck) est **vide** entre les deux fichiers

---

## File Structure

**Modify:**
- `infrastructure/docker/compose/docker-compose.prod.yml` — fichier cible unique, remplacé puis enrichi de 11 env vars queued

**Reference (read-only):**
- `.audit-prod-docker-compose.yml` — copie locale du fichier prod (déjà présente dans le worktree, non commitée car gitignore implicite)
- `/tmp/prod-docker-compose.yml` — même contenu (utilisé pour les commandes diff)

**Memory files to create/update post-implementation:**
- `/Users/smpceo/.claude/projects/-Users-smpceo-Documents-v2-meeshy/memory/feedback_prod_compose_divergence.md` — update avec nouvelle baseline
- `/Users/smpceo/.claude/projects/-Users-smpceo-Documents-v2-meeshy/memory/project_compose_prod_reconciliation.md` — nouveau, liste queued improvements
- `/Users/smpceo/.claude/projects/-Users-smpceo-Documents-v2-meeshy/memory/MEMORY.md` — index, ajouter ligne du nouveau project memory

---

## Task 1: Préparer baseline & vérifier état de départ

**Files:**
- Read: `infrastructure/docker/compose/docker-compose.prod.yml` (état avant)
- Read: `.audit-prod-docker-compose.yml` (cible prod)

- [ ] **Step 1: Vérifier qu'on est dans le bon worktree et que le baseline prod existe**

```bash
pwd
ls -la .audit-prod-docker-compose.yml /tmp/prod-docker-compose.yml 2>&1
```

Expected: Working directory = `/Users/smpceo/Documents/v2_meeshy/.claude/worktrees/feat+coturn-tls-traefik`. Both files exist (~19951 bytes each).

- [ ] **Step 2: Re-fetch prod file si manquant (idempotent)**

Si soit `.audit-prod-docker-compose.yml` soit `/tmp/prod-docker-compose.yml` n'existe pas :

```bash
ssh -o ConnectTimeout=10 root@meeshy.me 'cat /opt/meeshy/production/docker-compose.yml' > /tmp/prod-docker-compose.yml
cp /tmp/prod-docker-compose.yml .audit-prod-docker-compose.yml
shasum -a 256 /tmp/prod-docker-compose.yml
```

Expected SHA256 (sanity check) : `013deea18f0e24c5e0ec75a530583c457648fd3892621b3126d180ea1d4f527b` (peut différer si prod a évolué entre temps — si différent, **STOP et signaler à l'utilisateur**, la spec a été écrite contre la version 013deea1)

- [ ] **Step 3: Capturer l'état avant pour rollback potentiel**

```bash
cp infrastructure/docker/compose/docker-compose.prod.yml /tmp/repo-prod-before.yml
wc -l /tmp/repo-prod-before.yml /tmp/prod-docker-compose.yml
```

Expected: `repo-prod-before.yml` = 592 lignes, `prod-docker-compose.yml` = 519 lignes.

- [ ] **Step 4: Vérifier git status clean (sauf .audit + nouvelles specs)**

```bash
git status --short
```

Expected: Aucun fichier modifié tracké. Untracked acceptable : `.audit-prod-docker-compose.yml`. La spec `docs/superpowers/specs/2026-05-11-...` est déjà commitée (commit `ff3d149f`).

---

## Task 2: Remplacer docker-compose.prod.yml par le baseline prod

**Files:**
- Modify (overwrite): `infrastructure/docker/compose/docker-compose.prod.yml`

- [ ] **Step 1: Copier le fichier prod par-dessus le fichier repo**

```bash
cp .audit-prod-docker-compose.yml infrastructure/docker/compose/docker-compose.prod.yml
wc -l infrastructure/docker/compose/docker-compose.prod.yml
```

Expected: 519 lignes.

- [ ] **Step 2: Vérifier syntaxe YAML/Compose valide**

```bash
docker compose -f infrastructure/docker/compose/docker-compose.prod.yml config --quiet
echo "Exit: $?"
```

Expected: Exit 0 (validation silencieuse réussie). Si erreurs (variables non définies), c'est OK tant que ce sont des warnings sur `${VAR}` non setté — docker compose config accepte les vars indéfinies. Si erreur de syntaxe (mauvaise indentation, clé invalide), **STOP** et investiguer.

Note : `config --quiet` ne valide pas la résolution des `${VAR}` env. Pour tester ça il faudrait `--env-file ...` qui n'est pas disponible localement.

- [ ] **Step 3: Vérifier que le fichier est identique au baseline prod**

```bash
diff /tmp/prod-docker-compose.yml infrastructure/docker/compose/docker-compose.prod.yml
echo "Exit: $?"
```

Expected: Aucune sortie, exit 0 (fichiers identiques byte-for-byte).

---

## Task 3: Ajouter les queued improvements Translator (Cat. F)

**Files:**
- Modify: `infrastructure/docker/compose/docker-compose.prod.yml` (translator env block)

- [ ] **Step 1: Insérer les 4 env vars TTS/diarisation après HF_TOKEN**

Anchor : ligne avec `- HF_TOKEN=${HF_TOKEN}` dans la section translator (ligne ~172 du baseline prod, suivie immédiatement de `    volumes:`).

Utiliser Edit tool :

```yaml
# OLD (find):
      - HF_TOKEN=${HF_TOKEN}
    volumes:
      - models_data:/workspace/models
    depends_on:
      database:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - meeshy-network
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]

# NEW (replace):
      - HF_TOKEN=${HF_TOKEN}
      # QUEUED IMPROVEMENT — diarisation, TTS tuning (deploy via surgical patch when needed)
      - ENABLE_DIARIZATION=${ENABLE_DIARIZATION:-true}
      - TTS_MAX_NEW_TOKENS=${TTS_MAX_NEW_TOKENS:-2048}
      - TTS_MAX_SEGMENT_CHARS=${TTS_MAX_SEGMENT_CHARS:-1000}
      - TTS_MIN_SEGMENT_CHARS=${TTS_MIN_SEGMENT_CHARS:-50}
    volumes:
      - models_data:/workspace/models
    depends_on:
      database:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - meeshy-network
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
```

L'anchor `      - HF_TOKEN=${HF_TOKEN}\n    volumes:` est unique car le seul block où volumes vient juste après HF_TOKEN (c'est translator, gateway a TURN_CREDENTIAL_TTL avant volumes).

- [ ] **Step 2: Vérifier syntaxe**

```bash
docker compose -f infrastructure/docker/compose/docker-compose.prod.yml config --quiet
echo "Exit: $?"
```

Expected: Exit 0.

- [ ] **Step 3: Vérifier diff montre uniquement les ajouts attendus**

```bash
diff /tmp/prod-docker-compose.yml infrastructure/docker/compose/docker-compose.prod.yml | head -20
```

Expected: Bloc `>` (additions only) avec exactement :
```
>       # QUEUED IMPROVEMENT — diarisation, TTS tuning (deploy via surgical patch when needed)
>       - ENABLE_DIARIZATION=${ENABLE_DIARIZATION:-true}
>       - TTS_MAX_NEW_TOKENS=${TTS_MAX_NEW_TOKENS:-2048}
>       - TTS_MAX_SEGMENT_CHARS=${TTS_MAX_SEGMENT_CHARS:-1000}
>       - TTS_MIN_SEGMENT_CHARS=${TTS_MIN_SEGMENT_CHARS:-50}
```

Aucun `<` (suppression) ne doit apparaître.

---

## Task 4: Ajouter les queued improvements Gateway (Cat. E queued)

**Files:**
- Modify: `infrastructure/docker/compose/docker-compose.prod.yml` (gateway env block)

- [ ] **Step 1: Insérer les 5 env vars sessions + branding après TURN_CREDENTIAL_TTL**

Anchor : ligne avec `- TURN_CREDENTIAL_TTL=${TURN_CREDENTIAL_TTL:-3600}` dans gateway (ligne ~264 du baseline prod), suivie de `    volumes:` puis `      - gateway_uploads:/app/uploads`.

```yaml
# OLD (find):
      - TURN_CREDENTIAL_TTL=${TURN_CREDENTIAL_TTL:-3600}
    volumes:
      - gateway_uploads:/app/uploads
      - /opt/meeshy/secrets/firebase-admin-sdk.json:/app/secrets/firebase-admin-sdk.json
      - /opt/meeshy/secrets/apns_key.p8:/app/secrets/apns_key.p8:ro

# NEW (replace):
      - TURN_CREDENTIAL_TTL=${TURN_CREDENTIAL_TTL:-3600}
      # QUEUED IMPROVEMENT — session config + branding (deploy via surgical patch when sessions feature lands)
      - SESSION_EXPIRY_MOBILE_DAYS=${SESSION_EXPIRY_MOBILE_DAYS:-365}
      - SESSION_EXPIRY_DESKTOP_DAYS=${SESSION_EXPIRY_DESKTOP_DAYS:-30}
      - SESSION_EXPIRY_TRUSTED_DAYS=${SESSION_EXPIRY_TRUSTED_DAYS:-365}
      - MAX_SESSIONS_PER_USER=${MAX_SESSIONS_PER_USER:-10}
      - BRAND_LOGO_URL=${BRAND_LOGO_URL:-}
    volumes:
      - gateway_uploads:/app/uploads
      - /opt/meeshy/secrets/firebase-admin-sdk.json:/app/secrets/firebase-admin-sdk.json
      - /opt/meeshy/secrets/apns_key.p8:/app/secrets/apns_key.p8:ro
```

Anchor unique car seul gateway termine avec TURN_CREDENTIAL_TTL juste avant volumes avec firebase-admin-sdk.

- [ ] **Step 2: Vérifier syntaxe**

```bash
docker compose -f infrastructure/docker/compose/docker-compose.prod.yml config --quiet
echo "Exit: $?"
```

Expected: Exit 0.

- [ ] **Step 3: Vérifier diff cumulatif (translator + gateway)**

```bash
diff /tmp/prod-docker-compose.yml infrastructure/docker/compose/docker-compose.prod.yml
```

Expected output : 2 blocs d'additions (4 vars translator + 5 vars gateway + 2 comment lines). Pas de suppressions.

---

## Task 5: Ajouter les queued improvements Frontend (Cat. G queued)

**Files:**
- Modify: `infrastructure/docker/compose/docker-compose.prod.yml` (frontend env block)

- [ ] **Step 1: Insérer INTERNAL_BACKEND_URL après NEXT_PUBLIC_BACKEND_URL**

Anchor : ligne avec `- NEXT_PUBLIC_BACKEND_URL=https://gate.${DOMAIN:-localhost}` dans frontend (ligne ~324 du baseline prod), suivie de `      - NEXT_PUBLIC_FRONTEND_URL=...`.

```yaml
# OLD (find):
      - NEXT_PUBLIC_BACKEND_URL=https://gate.${DOMAIN:-localhost}
      - NEXT_PUBLIC_FRONTEND_URL=https://${DOMAIN:-localhost}

# NEW (replace):
      - NEXT_PUBLIC_BACKEND_URL=https://gate.${DOMAIN:-localhost}
      # QUEUED IMPROVEMENT — Next.js server-side fetch via container network (deploy when SSR data fetching refactor lands)
      - INTERNAL_BACKEND_URL=http://gateway:3000
      - NEXT_PUBLIC_FRONTEND_URL=https://${DOMAIN:-localhost}
```

- [ ] **Step 2: Insérer NEXT_PUBLIC_ENABLE_PASSWORD_RESET après NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS**

Anchor : ligne avec `- NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true` dans frontend (ligne ~339 du baseline prod, dernière env var avant `    volumes:`).

```yaml
# OLD (find):
      - NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true
    volumes:
      - frontend_uploads:/app/public/u

# NEW (replace):
      - NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true
      # QUEUED IMPROVEMENT — password reset feature flag (deploy when password reset UI lands)
      - NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true
    volumes:
      - frontend_uploads:/app/public/u
```

- [ ] **Step 3: Vérifier syntaxe**

```bash
docker compose -f infrastructure/docker/compose/docker-compose.prod.yml config --quiet
echo "Exit: $?"
```

Expected: Exit 0.

- [ ] **Step 4: Vérifier diff cumulatif final**

```bash
diff /tmp/prod-docker-compose.yml infrastructure/docker/compose/docker-compose.prod.yml
```

Expected output: 4 blocs d'additions (translator 4 vars + 1 comment, gateway 5 vars + 1 comment, frontend INTERNAL_BACKEND_URL + 1 comment, frontend NEXT_PUBLIC_ENABLE_PASSWORD_RESET + 1 comment). Aucune suppression.

Format attendu :
```
172a173,177
>       # QUEUED IMPROVEMENT — diarisation, TTS tuning (deploy via surgical patch when needed)
>       - ENABLE_DIARIZATION=${ENABLE_DIARIZATION:-true}
>       - TTS_MAX_NEW_TOKENS=${TTS_MAX_NEW_TOKENS:-2048}
>       - TTS_MAX_SEGMENT_CHARS=${TTS_MAX_SEGMENT_CHARS:-1000}
>       - TTS_MIN_SEGMENT_CHARS=${TTS_MIN_SEGMENT_CHARS:-50}
264a270,275
>       # QUEUED IMPROVEMENT — session config + branding (deploy via surgical patch when sessions feature lands)
>       - SESSION_EXPIRY_MOBILE_DAYS=${SESSION_EXPIRY_MOBILE_DAYS:-365}
...
```

---

## Task 6: Validation finale & comptes de lignes

**Files:**
- Read: `infrastructure/docker/compose/docker-compose.prod.yml`

- [ ] **Step 1: Count lignes du fichier final**

```bash
wc -l infrastructure/docker/compose/docker-compose.prod.yml
```

Calcul attendu : 519 (baseline prod) + 15 (additions queued) = **534 lignes**.

Décomposition des 15 lignes ajoutées :
- Translator : 1 comment + 4 env vars = 5 lignes
- Gateway : 1 comment + 5 env vars = 6 lignes
- Frontend (INTERNAL_BACKEND_URL) : 1 comment + 1 env var = 2 lignes
- Frontend (NEXT_PUBLIC_ENABLE_PASSWORD_RESET) : 1 comment + 1 env var = 2 lignes
- **Total : 5 + 6 + 2 + 2 = 15 lignes**

Si différent, **STOP** et regarder le diff pour identifier l'écart.

- [ ] **Step 2: Validation docker compose config complète avec verbose**

```bash
docker compose -f infrastructure/docker/compose/docker-compose.prod.yml config 2>&1 | head -50
echo "---"
docker compose -f infrastructure/docker/compose/docker-compose.prod.yml config --services
```

Expected:
- `config` (sans --quiet) résout les vars et affiche le YAML expanded. Pas d'erreur.
- `config --services` liste : `agent, certs-dumper, coturn, database, frontend, gateway, nosqlclient, p3x-redis-ui, redis, static-files, translator, traefik, turn-cert-stub` (13 services, **sans mongo-init**).

- [ ] **Step 3: Vérification finale du diff (sémantique pure)**

```bash
diff --ignore-matching-lines='^[[:space:]]*#' /tmp/prod-docker-compose.yml infrastructure/docker/compose/docker-compose.prod.yml | wc -l
```

Expected: **11 lignes** (les 11 env vars ajoutées, sans les 4 lignes de commentaire qui sont ignorées).

Si > 11 ou < 11, **STOP** et inspecter manuellement le diff sans `--ignore-matching-lines`.

- [ ] **Step 4: Inspection visuelle du fichier (sanity check)**

```bash
# Vérifier que les services critiques sont au bon endroit
grep -n "container_name: meeshy-" infrastructure/docker/compose/docker-compose.prod.yml
```

Expected output (chaque container_name à des lignes spécifiques) :
```
:    container_name: meeshy-traefik
:    container_name: meeshy-database
:    container_name: meeshy-nosqlclient
:    container_name: meeshy-redis
:    container_name: meeshy-p3x-redis-ui
:    container_name: meeshy-translator
:    container_name: meeshy-gateway
:    container_name: meeshy-static-files
:    container_name: meeshy-frontend
:    container_name: meeshy-agent
:    container_name: meeshy-coturn
:    container_name: meeshy-turn-cert-stub
:    container_name: meeshy-certs-dumper
```

13 containers. Vérifier : `meeshy-frontend` est bien présent (pas `meeshy-web`). Pas de `meeshy-mongo-init`.

```bash
# Vérifier top-level name
head -1 infrastructure/docker/compose/docker-compose.prod.yml
```

Expected: `name: meeshy`

```bash
# Vérifier volumes sans name explicite
grep -A1 "^volumes:" infrastructure/docker/compose/docker-compose.prod.yml | head -15
```

Expected: Tous les volumes en `volume_name:` sans clé `name: ...` en-dessous.

---

## Task 7: Memory updates (avec placeholders SHA)

**Files:**
- Modify: `/Users/smpceo/.claude/projects/-Users-smpceo-Documents-v2-meeshy/memory/feedback_prod_compose_divergence.md`
- Create: `/Users/smpceo/.claude/projects/-Users-smpceo-Documents-v2-meeshy/memory/project_compose_prod_reconciliation.md`
- Modify: `/Users/smpceo/.claude/projects/-Users-smpceo-Documents-v2-meeshy/memory/MEMORY.md`

**Note:** Les memory files sont écrits avec le placeholder `<RECONCILIATION_COMMIT_SHA>`. Le step final de Task 8 substituera ce placeholder par le vrai SHA après le commit.

- [ ] **Step 1: Lire l'état actuel du feedback existant**

```bash
cat /Users/smpceo/.claude/projects/-Users-smpceo-Documents-v2-meeshy/memory/feedback_prod_compose_divergence.md
```

Note le contenu pour le ré-écrire avec contexte enrichi.

- [ ] **Step 2: Mettre à jour `feedback_prod_compose_divergence.md`**

Le fichier doit garder la règle fondamentale ("JAMAIS écraser, toujours surgical patch") mais ajouter une référence à la baseline 2026-05-11 + lien vers la spec et le project memory.

Contenu à écrire (overwrite complet du fichier) :

```markdown
---
name: Prod compose divergence — surgical patch mandatory
description: /opt/meeshy/production/docker-compose.yml diverge du repo. JAMAIS écraser, toujours surgical patch après diff. Baseline 2026-05-11 dans spec.
type: feedback
---

JAMAIS écraser `/opt/meeshy/production/docker-compose.yml` avec une copie du repo. Toujours surgical patch après diff précis.

**Why:** La prod et le repo ont des historiques de modifications partiellement indépendants (containers/images nommés différemment, env vars APNS/Firebase hardcodés en prod uniquement, secrets paths spécifiques /opt/meeshy/secrets, etc.). Un overwrite naïf casserait les container names existants (volumes orphelins → perte de données), supprimerait des env vars critiques (APNS_KEY_ID, ENCRYPTION_MASTER_KEY refs), et changerait les paths de secrets.

**How to apply:** Avant toute modification du compose prod :
1. `ssh root@meeshy.me 'cat /opt/meeshy/production/docker-compose.yml' > /tmp/prod-current.yml`
2. `diff /tmp/prod-current.yml infrastructure/docker/compose/docker-compose.prod.yml` (côté repo, après vérification que repo reflète bien prod)
3. Décider : surgical patch (ajout ciblé d'env var via sed/edit) vs absorption inverse (repo absorbe prod, jamais l'inverse sans plan)
4. Si surgical patch en prod : éditer en place avec sed ciblé OU upload via scp + `docker compose up -d <service>` du service modifié uniquement
5. Confirmer rollback path AVANT toute modif (backup `/opt/meeshy/production/docker-compose.yml.bak-YYYYMMDD`)

**Baseline 2026-05-11:** Suite à la réconciliation (commit `<RECONCILIATION_COMMIT_SHA>` à substituer par le SHA du commit de Task 8 avant écriture finale du memory file ; spec `docs/superpowers/specs/2026-05-11-docker-compose-prod-reconciliation-design.md`), le repo `infrastructure/docker/compose/docker-compose.prod.yml` reflète maintenant fidèlement la prod, sauf 11 env vars "queued improvements" listées dans `project_compose_prod_reconciliation.md`. Ces 11 vars sont rétro-compatibles (toutes optionnelles avec defaults) — déployables via surgical patch quand leur feature backend correspondante lande.
```

- [ ] **Step 3: Créer `project_compose_prod_reconciliation.md`**

Contenu :

```markdown
---
name: docker-compose.prod.yml reconciliation 2026-05-11
description: Repo aligné sur prod (Prod → Repo). 11 env vars queued improvements à déployer ultérieurement via surgical patch.
type: project
---

Réconciliation `infrastructure/docker/compose/docker-compose.prod.yml` → `/opt/meeshy/production/docker-compose.yml` effectuée 2026-05-11. Direction : Prod → Repo (refléter la réalité, aucun déploiement effectué).

**Why:** Le fichier repo divergeait depuis longtemps (608 lignes de diff brut). Compliquait toute discussion infra parce que le repo ne décrivait pas la réalité prod. Avec la baseline alignée, on peut faire des audits déterministes.

**How to apply:** Avant toute PR touchant docker-compose.prod.yml :
1. Vérifier que `diff /tmp/prod-current.yml infrastructure/docker/compose/docker-compose.prod.yml` ne montre que les queued improvements listées ci-dessous (+ commentaires)
2. Si le diff montre AUTRE CHOSE, c'est qu'une dérive s'est produite. Recommencer un audit complet avant d'aller plus loin.

**Queued improvements (à déployer prod via surgical patch quand leur feature lande):**

Translator :
- `ENABLE_DIARIZATION=${ENABLE_DIARIZATION:-true}` — quand la diarisation pyannote sera activée en prod
- `TTS_MAX_NEW_TOKENS=${TTS_MAX_NEW_TOKENS:-2048}` — TTS Chatterbox tuning
- `TTS_MAX_SEGMENT_CHARS=${TTS_MAX_SEGMENT_CHARS:-1000}` — TTS Chatterbox tuning
- `TTS_MIN_SEGMENT_CHARS=${TTS_MIN_SEGMENT_CHARS:-50}` — TTS Chatterbox tuning

Gateway :
- `SESSION_EXPIRY_MOBILE_DAYS=${SESSION_EXPIRY_MOBILE_DAYS:-365}` — quand la feature multi-session lande
- `SESSION_EXPIRY_DESKTOP_DAYS=${SESSION_EXPIRY_DESKTOP_DAYS:-30}` — idem
- `SESSION_EXPIRY_TRUSTED_DAYS=${SESSION_EXPIRY_TRUSTED_DAYS:-365}` — idem
- `MAX_SESSIONS_PER_USER=${MAX_SESSIONS_PER_USER:-10}` — idem
- `BRAND_LOGO_URL=${BRAND_LOGO_URL:-}` — quand custom branding configurable

Frontend :
- `INTERNAL_BACKEND_URL=http://gateway:3000` — quand Next.js SSR data fetching refactor lande
- `NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true` — quand la feature password reset UI lande

**Hors-scope de cette réconciliation (à traiter dans PRs dédiées):**
- `agent.environment.DATABASE_URL` sans auth en prod (bug sécurité ; requiert rotation password MongoDB)
- Coturn template approach (sed substitution avec `__TURN_SECRET__`) — gain sécurité marginal, revert vers `turnserver.conf` direct mount jusqu'à PR dédiée
- mongo-init service automatique — replica set déjà initialisé manuellement en prod, init service redéploiement éventuel
- Standardisation nom image frontend prod (`meeshy-frontend`) vs staging (`meeshy-web`) — requiert changement CI

**References:**
- Spec : `docs/superpowers/specs/2026-05-11-docker-compose-prod-reconciliation-design.md`
- Plan : `docs/superpowers/plans/2026-05-11-docker-compose-prod-reconciliation-plan.md`
- Commit final : `<RECONCILIATION_COMMIT_SHA>` (à substituer par le SHA produit par Task 8 avant écriture finale du memory)
```

- [ ] **Step 4: Mettre à jour `MEMORY.md` index**

Ajouter une ligne sous "## Active Projects" (ordre alphabétique-temporel approximatif) :

```markdown
- [docker-compose.prod.yml reconciliation 2026-05-11](project_compose_prod_reconciliation.md) — repo aligné sur prod, 11 env vars queued improvements documentées
```

Utiliser Edit tool sur `/Users/smpceo/.claude/projects/-Users-smpceo-Documents-v2-meeshy/memory/MEMORY.md`. Anchor recommandé : la ligne `- [iOS Local-First Wave 1 — 2026-05-11](project_ios_local_first_wave1.md)...` (memory la plus récente datée). Insérer la nouvelle ligne juste après.

---

## Task 8: Commit final atomique

**Files:**
- All staged via `git add`

- [ ] **Step 1: Inspect changes finales avant commit**

```bash
git status
git diff --stat infrastructure/docker/compose/docker-compose.prod.yml
```

Expected:
- `git status` montre `modified: infrastructure/docker/compose/docker-compose.prod.yml` (et `.audit-prod-docker-compose.yml` untracked OK)
- `diff --stat` montre approx `1 file changed, ~15 insertions(+), ~75 deletions(-)` (le repo 592 → fichier final 534 lignes = différence majeure car on est revenu à prod 519 + 15 additions = 534)

- [ ] **Step 2: Vérifier que .audit-prod-docker-compose.yml ne sera PAS commité**

```bash
git status --short | grep audit
```

Expected: `?? .audit-prod-docker-compose.yml` (untracked, pas staged). Si staged par erreur : `git restore --staged .audit-prod-docker-compose.yml`.

- [ ] **Step 3: Stage uniquement le fichier compose**

```bash
git add infrastructure/docker/compose/docker-compose.prod.yml
git status --short
```

Expected: `M  infrastructure/docker/compose/docker-compose.prod.yml` (un seul fichier).

- [ ] **Step 4: Commit avec message structuré**

```bash
git commit -m "$(cat <<'EOF'
fix(infra): aligner docker-compose.prod.yml sur la realite production

Audit complet 2026-05-11 : 608 lignes de divergence brute identifiees entre
infrastructure/docker/compose/docker-compose.prod.yml du repo (592 lignes) et
/opt/meeshy/production/docker-compose.yml en prod (519 lignes). Spec dans
docs/superpowers/specs/2026-05-11-docker-compose-prod-reconciliation-design.md.

Direction Prod -> Repo. Le repo absorbe l identite prod (container_name
meeshy-frontend, image isopen/meeshy-frontend:latest, secrets paths
/opt/meeshy/secrets, top-level name: meeshy, etc.) et revert les changements
prematures (mongo-init service, coturn template+sed, hardcoded api.meeshy.me
route, JWT default :-7d, etc.).

Conserve 11 env vars optionnelles avec defaults (queued improvements) qui
sont retrocompatibles si jamais le repo est deploye :
- Translator : ENABLE_DIARIZATION, TTS_MAX_NEW_TOKENS, TTS_MAX_SEGMENT_CHARS,
  TTS_MIN_SEGMENT_CHARS
- Gateway : SESSION_EXPIRY_MOBILE_DAYS/DESKTOP_DAYS/TRUSTED_DAYS,
  MAX_SESSIONS_PER_USER, BRAND_LOGO_URL
- Frontend : INTERNAL_BACKEND_URL, NEXT_PUBLIC_ENABLE_PASSWORD_RESET

Hors-scope (PRs separees):
- Bug agent sans auth MongoDB (necessite rotation password)
- Coturn template substitution (gain securite marginal, revert pour matcher prod)
- mongo-init service automatique
- Standardisation image name frontend prod (meeshy-frontend) vs staging (meeshy-web)

Aucun deploiement effectue. Aucun changement sur staging/dev/local files.
EOF
)"
```

- [ ] **Step 5: Vérifier le commit**

```bash
git log --oneline -3
git show --stat HEAD
```

Expected: Le nouveau commit en tête. Stat montre 1 fichier modifié, ~15 insertions / ~75 deletions.

- [ ] **Step 6: Capturer le SHA et substituer dans les memory files**

```bash
COMMIT_SHA=$(git log -1 --format=%H)
echo "Commit SHA: $COMMIT_SHA"

# Substituer le placeholder dans les 2 memory files
sed -i.bak "s|<RECONCILIATION_COMMIT_SHA>|$COMMIT_SHA|g" \
  /Users/smpceo/.claude/projects/-Users-smpceo-Documents-v2-meeshy/memory/feedback_prod_compose_divergence.md \
  /Users/smpceo/.claude/projects/-Users-smpceo-Documents-v2-meeshy/memory/project_compose_prod_reconciliation.md

# Vérifier que la substitution a fonctionné
grep "<RECONCILIATION_COMMIT_SHA>" \
  /Users/smpceo/.claude/projects/-Users-smpceo-Documents-v2-meeshy/memory/feedback_prod_compose_divergence.md \
  /Users/smpceo/.claude/projects/-Users-smpceo-Documents-v2-meeshy/memory/project_compose_prod_reconciliation.md \
  && echo "FAIL: placeholder still present" \
  || echo "OK: placeholder substituted"

# Nettoyer les .bak files créés par sed
rm -f /Users/smpceo/.claude/projects/-Users-smpceo-Documents-v2-meeshy/memory/feedback_prod_compose_divergence.md.bak \
      /Users/smpceo/.claude/projects/-Users-smpceo-Documents-v2-meeshy/memory/project_compose_prod_reconciliation.md.bak
```

Expected output: `Commit SHA: <40-char hex>` puis `OK: placeholder substituted`. Si `FAIL` : grep silencieusement le SHA dans les memory files manuellement.

Note : `sed -i.bak` sur macOS crée des `.bak` files (différent du GNU `sed -i`). On les supprime ensuite. Si tu es sur Linux GNU sed, utiliser `sed -i "..."` sans le `.bak`.

---

## Task 9: Vérification post-commit & rapport final

**Files:**
- None (verification only)

- [ ] **Step 1: Vérification finale du diff repo vs prod**

```bash
diff /tmp/prod-docker-compose.yml infrastructure/docker/compose/docker-compose.prod.yml | wc -l
diff --ignore-matching-lines='^[[:space:]]*#' /tmp/prod-docker-compose.yml infrastructure/docker/compose/docker-compose.prod.yml | wc -l
```

Expected:
- Avec commentaires : 19 lignes (15 additions + 4 lignes de séparation diff)
- Sans commentaires : 15 lignes (11 env vars + 4 lignes de séparation diff)

- [ ] **Step 2: Re-run docker compose config pour confirmation**

```bash
docker compose -f infrastructure/docker/compose/docker-compose.prod.yml config --quiet && echo "OK"
```

Expected: `OK`.

- [ ] **Step 3: Imprimer résumé pour l'utilisateur**

Format suggéré :
```
Réconciliation docker-compose.prod.yml complete.
- Fichier passé de 592 → 534 lignes
- Diff sémantique vs prod = 11 env vars queued (toutes optionnelles, retrocompat)
- Container names alignés : meeshy-frontend (NOT meeshy-web), no mongo-init
- Commit : <SHA>
- Spec : docs/superpowers/specs/2026-05-11-...-design.md
- Plan : docs/superpowers/plans/2026-05-11-...-plan.md
- Memory mise à jour : feedback_prod_compose_divergence.md, project_compose_prod_reconciliation.md
```

---

## Rollback Strategy

Si à n'importe quel point on veut annuler :

```bash
cp /tmp/repo-prod-before.yml infrastructure/docker/compose/docker-compose.prod.yml
git status  # devrait être clean si pas encore committé
```

Si déjà committé :
```bash
git reset --hard HEAD~1  # ATTENTION destructif, confirmer absence de work non-committé d'abord
```

---

## Notes pour l'exécutant

1. **Ne JAMAIS pousser de modification vers `/opt/meeshy/production/`**. Ce plan est strictement repo-side.
2. **Si `ssh root@meeshy.me` échoue** au step 2 de Task 1, ne pas inventer un fichier prod baseline. Stopper et signaler.
3. **Si le SHA256 du fichier prod ne match pas `013deea1...`**, prod a évolué entre la rédaction de la spec et l'exécution. Reprendre l'audit (spec à actualiser) avant de continuer.
4. **L'asymétrie frontend image name prod=meeshy-frontend / staging=meeshy-web est intentionnelle** (cf spec Non-goals). Ne pas tenter de la "corriger" en touchant à staging.
5. **Le bug agent sans auth MongoDB est intentionnellement préservé** (cf spec Non-goals). Ne pas tenter de le fixer ici — PR sécurité dédiée requise.
6. Pour les Edit tool calls multi-lignes, vérifier que l'anchor old_string est unique dans le fichier avant d'éditer. Si non-unique, élargir le contexte.

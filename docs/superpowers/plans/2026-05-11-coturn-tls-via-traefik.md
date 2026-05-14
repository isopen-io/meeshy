# Coturn TLS via Traefik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activer TURN over TLS (port 5349) en production en réutilisant les certificats Let's Encrypt déjà gérés par Traefik, sans modifier le mécanisme ACME existant et sans introduire de nouveau secret de production.

**Architecture:** Trois changements infrastructure dans `docker-compose.prod.yml` : (1) un router Traefik factice `turn-cert-stub` (nginx:alpine) qui déclare `Host("turn.meeshy.me")` pour déclencher l'émission d'un cert Let's Encrypt via le challenge TLS-ALPN-01 existant ; (2) un sidecar `ldez/traefik-certs-dumper` qui surveille `acme.json` et extrait les certs en PEM dans un volume partagé ; (3) le service `coturn` modifié pour lire les PEM extraits, avec un watcher `inotifywait` qui s'auto-signale `SIGUSR2` lors des renouvellements (pas de mount `docker.sock`, pas de post-hook). Plus une mise à jour des chemins cert/pkey dans `turnserver.prod.conf`.

**Tech Stack:** Docker Compose v2, Traefik v3.6, coturn 4.6, `ldez/traefik-certs-dumper` v2.8.6, nginx:alpine, inotify-tools (alpine package), shell `sh`.

**Spec source:** `docs/superpowers/specs/2026-05-11-coturn-tls-via-traefik-design.md`

---

## File Structure

Aucun fichier créé dans le repo. Deux fichiers modifiés :

- Modify: `infrastructure/docker/compose/docker-compose.prod.yml` — ajouts (services `turn-cert-stub` et `certs-dumper`, volume `traefik_dumped_certs`) + modif du service `coturn` (mount + entrypoint enrichi)
- Modify: `infrastructure/config/turnserver.prod.conf:11-12` — chemins `cert=` et `pkey=` pointent maintenant vers `/etc/coturn/dumped/{certs,private}/turn.meeshy.me.{crt,key}`

Côté production (en dehors du repo) :
- Modify (manuel via SSH): `/opt/meeshy/production/docker-compose.yml` — appliquer les mêmes changements (le compose prod diverge du repo, cf. mémoire projet)
- Modify (manuel via SSH): `/opt/meeshy/production/config/turnserver.prod.conf` — appliquer le même diff

---

## Pré-requis et conventions

- Branche : `feat/coturn-tls-traefik` (déjà créée, spec commité dessus).
- Working directory : racine du repo `meeshy` (`/Users/smpceo/Documents/v2_meeshy/` en local).
- Pas de Co-Authored-By trailer dans les commits.
- Production : `root@meeshy.me`, working dir `/opt/meeshy/production/`.
- Container Traefik : `meeshy-traefik` (volume `meeshy-traefik-certs` mappé sur `/letsencrypt`).
- Container coturn : `meeshy-coturn`.
- Network : `meeshy-network` (déjà existant).

---

## Task 1: Pre-flight checks

**Files:** none (read-only)

- [ ] **Step 1.1: Confirmer la branche locale**

Run:
```bash
git rev-parse --abbrev-ref HEAD
```
Expected: `feat/coturn-tls-traefik`

Si différent, faire `git checkout feat/coturn-tls-traefik` (la branche existe déjà avec le spec commité).

- [ ] **Step 1.2: Vérifier que le spec est commité**

Run:
```bash
git log --oneline -1 -- docs/superpowers/specs/2026-05-11-coturn-tls-via-traefik-design.md
```
Expected: une ligne du type `<hash> docs(infra): spec coturn TLS via Traefik certs-dumper (Cadrage A)`

Si vide, le spec n'a pas été commité — stopper et revenir à writing-plans.

- [ ] **Step 1.3: Vérifier que `turn.meeshy.me` résout vers l'IP du serveur prod**

Run:
```bash
dig +short A turn.meeshy.me
dig +short A meeshy.me
```
Expected: les deux retournent la même IP (actuellement `157.230.15.51`).

Si turn.meeshy.me ne résout pas ou retourne une IP différente, le challenge TLS-ALPN-01 échouera. Stopper et corriger le DNS d'abord.

- [ ] **Step 1.4: Vérifier que le serveur prod est joignable**

Run:
```bash
ssh -o ConnectTimeout=8 root@meeshy.me 'echo ok && uptime'
```
Expected: `ok` puis ligne `uptime`.

- [ ] **Step 1.5: Snapshot de l'état actuel du `acme.json` (pour rollback éventuel)**

Run:
```bash
ssh root@meeshy.me 'docker exec meeshy-traefik cat /letsencrypt/acme.json' | jq '.letsencrypt.Certificates[].domain.main' > /tmp/acme-snapshot-before.txt
cat /tmp/acme-snapshot-before.txt
```
Expected: liste des domaines actuellement certifiés (ex: `gate.meeshy.me`, `meeshy.me`, etc.). `turn.meeshy.me` ne doit PAS être dans la liste à ce stade.

- [ ] **Step 1.6: Snapshot du coturn actuel (état avant)**

Run:
```bash
ssh root@meeshy.me 'docker ps --filter name=meeshy-coturn --format "{{.Status}}"'
ssh root@meeshy.me 'docker logs meeshy-coturn --tail 20 2>&1 | tail -20'
```
Expected: le container existe et est `(healthy)`. Les logs peuvent contenir des erreurs « cannot load cert » (attendu, car `/etc/letsencrypt` est vide).

---

## Task 2: Ajouter le service `turn-cert-stub` dans docker-compose.prod.yml

**Files:**
- Modify: `infrastructure/docker/compose/docker-compose.prod.yml` (insertion après la section coturn ligne 460, AVANT la section `volumes:` ligne 462)

- [ ] **Step 2.1: Lire le contexte d'insertion**

Run:
```bash
sed -n '455,470p' infrastructure/docker/compose/docker-compose.prod.yml
```
Expected output : on doit voir la fin de la section coturn (healthcheck, start_period: 10s, ligne vide), puis le séparateur `# =====` puis `# VOLUMES` puis `volumes:`.

- [ ] **Step 2.2: Ajouter le service `turn-cert-stub` après la section coturn**

Utiliser l'outil Edit pour insérer après la ligne `start_period: 10s` (dernière ligne du healthcheck coturn) et avant le séparateur `# ===== VOLUMES =====`.

old_string:
```
      start_period: 10s

# =============================================================================
# VOLUMES
```

new_string:
```
      start_period: 10s

  # ===========================================================================
  # TURN CERT STUB - Router Traefik factice pour déclencher l'émission ACME
  # ===========================================================================
  # Ce service ne sert AUCUNE fonctionnalité produit. Il existe uniquement pour
  # que Traefik ait un router avec Host(`turn.meeshy.me`), ce qui déclenche
  # l'émission d'un certificat Let's Encrypt via le challenge TLS-ALPN-01.
  # Le certificat est ensuite extrait par `certs-dumper` et consommé par coturn.
  turn-cert-stub:
    image: nginx:alpine
    container_name: meeshy-turn-cert-stub
    restart: unless-stopped
    networks:
      - meeshy-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.turn-cert-stub.rule=Host(`turn.${DOMAIN:-meeshy.me}`)"
      - "traefik.http.routers.turn-cert-stub.entrypoints=websecure"
      - "traefik.http.routers.turn-cert-stub.tls.certresolver=letsencrypt"
      - "traefik.http.services.turn-cert-stub.loadbalancer.server.port=80"

  # ===========================================================================
  # CERTS DUMPER - Extrait acme.json en PEM (consommé par coturn)
  # ===========================================================================
  # Surveille /letsencrypt/acme.json via inotify et écrit chaque certificat
  # extrait dans /dumped/certs/<domain>.crt + /dumped/private/<domain>.key
  # (structure de sortie par défaut de ldez/traefik-certs-dumper v2).
  # Pas de --post-hook : le reload coturn est piloté côté coturn via
  # inotifywait, ce qui évite tout mount de docker.sock.
  certs-dumper:
    image: ldez/traefik-certs-dumper:v2.8.6
    container_name: meeshy-certs-dumper
    restart: unless-stopped
    entrypoint:
      - traefik-certs-dumper
      - file
      - --version=v2
      - --watch
      - --source=/letsencrypt/acme.json
      - --dest=/dumped
    volumes:
      - traefik_certs:/letsencrypt:ro
      - traefik_dumped_certs:/dumped
    networks:
      - meeshy-network
    depends_on:
      traefik:
        condition: service_started

# =============================================================================
# VOLUMES
```

- [ ] **Step 2.3: Vérifier l'insertion**

Run:
```bash
grep -n "turn-cert-stub\|certs-dumper" infrastructure/docker/compose/docker-compose.prod.yml
```
Expected: 6+ lignes avec les références aux deux nouveaux services.

---

## Task 3: Ajouter le volume `traefik_dumped_certs`

**Files:**
- Modify: `infrastructure/docker/compose/docker-compose.prod.yml` (section `volumes:`)

- [ ] **Step 3.1: Lire l'état actuel de la section volumes**

Run:
```bash
grep -n "^volumes:\|^  [a-z_-]*:" infrastructure/docker/compose/docker-compose.prod.yml | grep -A0 -B0 "volumes\|database_data\|redis_data\|traefik_certs\|models_data\|gateway_uploads\|frontend_uploads"
```
Expected: voir la liste actuelle des volumes nommés.

- [ ] **Step 3.2: Ajouter `traefik_dumped_certs` à la section volumes**

old_string:
```
  traefik_certs:
    name: meeshy-traefik-certs
```

new_string:
```
  traefik_certs:
    name: meeshy-traefik-certs
  traefik_dumped_certs:
    name: meeshy-traefik-dumped-certs
```

- [ ] **Step 3.3: Vérifier**

Run:
```bash
grep -n "traefik_dumped_certs\|meeshy-traefik-dumped-certs" infrastructure/docker/compose/docker-compose.prod.yml
```
Expected: 2 lignes (déclaration + name).

---

## Task 4: Modifier le service `coturn` (mount + entrypoint enrichi)

**Files:**
- Modify: `infrastructure/docker/compose/docker-compose.prod.yml:435-460` (service coturn)

- [ ] **Step 4.1: Remplacer le bloc complet du service coturn**

old_string:
```
  coturn:
    image: coturn/coturn:4.6
    container_name: meeshy-coturn
    network_mode: host
    volumes:
      - ../config/turnserver.prod.conf:/etc/turnserver.template.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    environment:
      - TURN_SECRET=${TURN_SECRET}
    entrypoint:
      - /bin/sh
      - -c
      - |
        if [ -z "$$TURN_SECRET" ] || [ "$$TURN_SECRET" = "__TURN_SECRET__" ] || [ "$$TURN_SECRET" = "meeshy-turn-secret-CHANGE-IN-PRODUCTION" ]; then
          echo "[FATAL] TURN_SECRET env var must be set to a strong, non-default value before starting coturn." >&2
          exit 1
        fi
        sed "s|__TURN_SECRET__|$$TURN_SECRET|g" /etc/turnserver.template.conf > /tmp/turnserver.conf
        exec turnserver -c /tmp/turnserver.conf
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "turnutils_stunclient", "-p", "3478", "localhost"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

new_string:
```
  coturn:
    image: coturn/coturn:4.6
    container_name: meeshy-coturn
    network_mode: host
    volumes:
      - ../config/turnserver.prod.conf:/etc/turnserver.template.conf:ro
      - traefik_dumped_certs:/etc/coturn/dumped:ro
    environment:
      - TURN_SECRET=${TURN_SECRET}
    entrypoint:
      - /bin/sh
      - -c
      - |
        set -e
        if [ -z "$$TURN_SECRET" ] || [ "$$TURN_SECRET" = "__TURN_SECRET__" ] || [ "$$TURN_SECRET" = "meeshy-turn-secret-CHANGE-IN-PRODUCTION" ]; then
          echo "[FATAL] TURN_SECRET env var must be set to a strong, non-default value before starting coturn." >&2
          exit 1
        fi

        CERT_FILE=/etc/coturn/dumped/certs/turn.meeshy.me.crt
        KEY_FILE=/etc/coturn/dumped/private/turn.meeshy.me.key

        # 1) Attendre que le dumper ait extrait les certs (bornage : 5 min = 30 × 10s)
        retry=0
        while [ ! -f "$$CERT_FILE" ] || [ ! -f "$$KEY_FILE" ]; do
          retry=$$((retry + 1))
          if [ $$retry -gt 30 ]; then
            echo "[FATAL] coturn cert files not present after 5min — dumper failure or first-issuance pending" >&2
            exit 1
          fi
          echo "[coturn] waiting for cert files in /etc/coturn/dumped (try $$retry/30)"
          sleep 10
        done

        # 2) Installer inotify-tools pour le watcher de reload (image coturn = alpine)
        apk add --no-cache inotify-tools >/dev/null 2>&1 || {
          echo "[WARN] apk add inotify-tools failed — auto-reload désactivé, un restart manuel sera nécessaire au prochain renewal" >&2
        }

        # 3) Watcher en arrière-plan : SIGUSR2 self quand le .crt change
        if command -v inotifywait >/dev/null 2>&1; then
          (
            while inotifywait -q -e close_write,move -- "$$CERT_FILE" >/dev/null; do
              pkill -USR2 turnserver && echo "[coturn] cert changed, SIGUSR2 sent"
            done
          ) &
        fi

        sed "s|__TURN_SECRET__|$$TURN_SECRET|g" /etc/turnserver.template.conf > /tmp/turnserver.conf
        exec turnserver -c /tmp/turnserver.conf
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "turnutils_stunclient", "-p", "3478", "localhost"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    depends_on:
      certs-dumper:
        condition: service_started
```

- [ ] **Step 4.2: Vérifier les modifications**

Run:
```bash
grep -nE "traefik_dumped_certs|inotifywait|/etc/coturn/dumped|CERT_FILE=" infrastructure/docker/compose/docker-compose.prod.yml
```
Expected: au moins 6 lignes matchent (mount, watcher, paths, dépendance).

---

## Task 5: Modifier `turnserver.prod.conf` (chemins cert/pkey)

**Files:**
- Modify: `infrastructure/config/turnserver.prod.conf:11-12`

- [ ] **Step 5.1: Vérifier l'état actuel**

Run:
```bash
sed -n '10,13p' infrastructure/config/turnserver.prod.conf
```
Expected:
```
static-auth-secret=__TURN_SECRET__
cert=/etc/letsencrypt/live/meeshy.me/fullchain.pem
pkey=/etc/letsencrypt/live/meeshy.me/privkey.pem
no-multicast-peers
```

- [ ] **Step 5.2: Remplacer les chemins cert/pkey**

old_string:
```
cert=/etc/letsencrypt/live/meeshy.me/fullchain.pem
pkey=/etc/letsencrypt/live/meeshy.me/privkey.pem
```

new_string:
```
cert=/etc/coturn/dumped/certs/turn.meeshy.me.crt
pkey=/etc/coturn/dumped/private/turn.meeshy.me.key
```

- [ ] **Step 5.3: Vérifier**

Run:
```bash
grep -nE "^cert=|^pkey=" infrastructure/config/turnserver.prod.conf
```
Expected:
```
11:cert=/etc/coturn/dumped/certs/turn.meeshy.me.crt
12:pkey=/etc/coturn/dumped/private/turn.meeshy.me.key
```

---

## Task 6: Validation locale du compose (config syntax check)

**Files:** none (read-only)

- [ ] **Step 6.1: Lint du docker-compose**

Run:
```bash
cd infrastructure/docker/compose
docker compose -f docker-compose.prod.yml config --quiet
echo "exit: $?"
```
Expected: pas de message d'erreur, `exit: 0`.

Si `--quiet` n'est pas supporté par la version locale, utiliser :
```bash
docker compose -f docker-compose.prod.yml config > /dev/null
echo "exit: $?"
```

Si erreur YAML, lire le message et corriger via Edit.

- [ ] **Step 6.2: Vérifier que la résolution `${DOMAIN:-meeshy.me}` fonctionne**

Run:
```bash
docker compose -f docker-compose.prod.yml config 2>/dev/null | grep -A2 "turn-cert-stub"
```
Expected: voir le router avec `Host(\`turn.meeshy.me\`)` correctement substitué.

- [ ] **Step 6.3: Vérifier que le service coturn a bien la nouvelle dépendance**

Run:
```bash
docker compose -f docker-compose.prod.yml config 2>/dev/null | grep -B1 -A10 "^  coturn:" | head -30
```
Expected: voir `depends_on:` avec `certs-dumper: { condition: service_started }`.

- [ ] **Step 6.4: Retour à la racine du repo**

Run:
```bash
cd /Users/smpceo/Documents/v2_meeshy
pwd
```
Expected: `/Users/smpceo/Documents/v2_meeshy`

---

## Task 7: Commit local et push

**Files:** none (commit + push)

- [ ] **Step 7.1: Vérifier les fichiers à committer**

Run:
```bash
git status --short
```
Expected: au minimum
```
 M infrastructure/docker/compose/docker-compose.prod.yml
 M infrastructure/config/turnserver.prod.conf
```
(plus éventuellement des fichiers untracked sans rapport — ne PAS les inclure dans le commit)

- [ ] **Step 7.2: Stage uniquement les deux fichiers modifiés**

Run:
```bash
git add infrastructure/docker/compose/docker-compose.prod.yml infrastructure/config/turnserver.prod.conf
git status --short
```
Expected: les deux fichiers passent en `A` ou `M` staged ; les autres fichiers untracked restent en `??` (non staged).

- [ ] **Step 7.3: Commit**

Run:
```bash
git commit -m "$(cat <<'EOF'
feat(infra): activer TURN/TLS via certs-dumper + router Traefik dummy

- Ajout service turn-cert-stub (nginx:alpine) qui déclare Host(`turn.meeshy.me`)
  pour déclencher l émission Let s Encrypt via TLS-ALPN-01 existant
- Ajout sidecar ldez/traefik-certs-dumper qui surveille acme.json et écrit
  les PEM dans /dumped/certs/<d>.crt + /dumped/private/<d>.key
- Modif service coturn :
  - mount du volume traefik_dumped_certs en RO sur /etc/coturn/dumped
  - entrypoint enrichi : attente bornée des fichiers cert, install
    inotify-tools, watcher arrière-plan qui SIGUSR2 self au renewal
  - depends_on: certs-dumper
- Mise à jour turnserver.prod.conf : chemins cert/pkey vers les PEM extraits

Pas de mount docker.sock, pas de post-hook docker exec (inversion de
contrôle : coturn observe lui-même ses fichiers cert).

Réf: docs/superpowers/specs/2026-05-11-coturn-tls-via-traefik-design.md
EOF
)"
git log --oneline -2
```
Expected: 2 lignes — le nouveau commit `feat(infra): ...` puis le spec `docs(infra): ...`.

- [ ] **Step 7.4: Push de la branche**

Run:
```bash
git push -u origin feat/coturn-tls-traefik
```
Expected: la branche est créée sur origin, output `* [new branch] feat/coturn-tls-traefik -> feat/coturn-tls-traefik`.

---

## Task 8: Préparation de la production

**Files:** `/opt/meeshy/production/docker-compose.yml` et `/opt/meeshy/production/config/turnserver.prod.conf` (sur le serveur prod, via SSH)

**Rappel mémoire projet** : le `docker-compose.yml` de production diffère du repo (noms de containers, noms d'images). Les changements de **ce plan** ne touchent que des services nouveaux ou des services dont les noms n'ont **pas** divergé (`meeshy-traefik`, `meeshy-coturn`). Les changements doivent malgré tout être **appliqués à la main** côté prod, on ne fait pas de `git pull` brut.

- [ ] **Step 8.1: Backup de l'état actuel sur prod**

Run:
```bash
ssh root@meeshy.me '
  cd /opt/meeshy/production
  cp docker-compose.yml docker-compose.yml.bak.$(date +%Y%m%d-%H%M%S)
  cp config/turnserver.prod.conf config/turnserver.prod.conf.bak.$(date +%Y%m%d-%H%M%S)
  ls -la docker-compose.yml.bak.* config/turnserver.prod.conf.bak.*
'
```
Expected: deux fichiers `.bak.AAAAMMJJ-HHMMSS` créés.

- [ ] **Step 8.2: Vérifier la position actuelle de la section coturn dans le compose prod**

Run:
```bash
ssh root@meeshy.me 'grep -nE "^  coturn:|^volumes:|^networks:" /opt/meeshy/production/docker-compose.yml'
```
Expected: voir les numéros de ligne de `coturn:`, `volumes:`, `networks:`. Mémoriser ces numéros pour la suite (peuvent différer du repo).

- [ ] **Step 8.3: Copier les modifications via scp**

Stratégie : on copie d'abord les fichiers du repo dans un dossier temporaire sur le serveur, puis on les fusionne à la main pour respecter les divergences éventuelles.

Run:
```bash
scp infrastructure/docker/compose/docker-compose.prod.yml root@meeshy.me:/tmp/docker-compose.prod.yml.new
scp infrastructure/config/turnserver.prod.conf root@meeshy.me:/tmp/turnserver.prod.conf.new
ssh root@meeshy.me 'ls -la /tmp/docker-compose.prod.yml.new /tmp/turnserver.prod.conf.new'
```
Expected: deux fichiers présents dans `/tmp/`.

- [ ] **Step 8.4: Diff entre le compose prod existant et le nouveau (audit avant merge)**

Run:
```bash
ssh root@meeshy.me '
  diff /opt/meeshy/production/docker-compose.yml /tmp/docker-compose.prod.yml.new || true
'
```
Expected: voir les ajouts (services `turn-cert-stub`, `certs-dumper`, volume `traefik_dumped_certs`, modifs `coturn`) ET éventuellement des différences pré-existantes (noms `meeshy-frontend` vs `meeshy-web`, etc.). **Lire attentivement le diff** : si des lignes inattendues apparaissent, NE PAS écraser le compose prod sans investigation.

- [ ] **Step 8.5: Appliquer le diff de manière sélective (cas où le compose prod diverge)**

**Option A — Si le diff montre uniquement les changements de ce plan** (aucune divergence pré-existante surprenante) :
```bash
ssh root@meeshy.me 'cp /tmp/docker-compose.prod.yml.new /opt/meeshy/production/docker-compose.yml'
```

**Option B — Si le diff montre des divergences pré-existantes** (e.g. `meeshy-frontend` dans prod vs `meeshy-web` dans repo, image `isopen/meeshy-frontend:latest` vs autre) :

Ne PAS écraser. Éditer manuellement `/opt/meeshy/production/docker-compose.yml` pour ajouter UNIQUEMENT :
1. Le service `turn-cert-stub` (block complet, juste après la section coturn)
2. Le service `certs-dumper` (block complet, juste après turn-cert-stub)
3. Le volume `traefik_dumped_certs` dans la section `volumes:`
4. Les modifications du service `coturn` (mount + entrypoint + depends_on)

Run:
```bash
ssh root@meeshy.me 'nano /opt/meeshy/production/docker-compose.yml'
# OU
ssh root@meeshy.me 'vi /opt/meeshy/production/docker-compose.yml'
```
Procéder aux modifications à la main en s'aidant du diff de l'étape 8.4.

- [ ] **Step 8.6: Appliquer le turnserver.prod.conf**

Le fichier turnserver.prod.conf est probablement identique entre repo et prod (peu de divergences attendues sur la conf coturn). On peut écraser plus simplement, mais on vérifie d'abord.

Run:
```bash
ssh root@meeshy.me '
  diff /opt/meeshy/production/config/turnserver.prod.conf /tmp/turnserver.prod.conf.new
'
```
Expected: diff de 2 lignes (cert et pkey).

Si diff conforme :
```bash
ssh root@meeshy.me 'cp /tmp/turnserver.prod.conf.new /opt/meeshy/production/config/turnserver.prod.conf'
```

Sinon, éditer à la main.

- [ ] **Step 8.7: Validation syntaxique du compose prod**

Run:
```bash
ssh root@meeshy.me 'cd /opt/meeshy/production && docker compose config --quiet && echo "exit: $?"'
```
Expected: `exit: 0`, aucun message d'erreur.

Si erreur, lire le message, corriger via éditeur SSH, recommencer.

---

## Task 9: Déploiement — démarrage des services dans l'ordre

**Files:** none (commandes Docker sur prod)

L'ordre est critique : Traefik doit avoir émis le cert AVANT que coturn ne démarre, sinon la boucle d'attente de coturn va consommer ses 5min de retry et fail-fast.

- [ ] **Step 9.1: Pull de la nouvelle image dumper**

Run:
```bash
ssh root@meeshy.me 'cd /opt/meeshy/production && docker compose pull certs-dumper turn-cert-stub'
```
Expected: téléchargement de `ldez/traefik-certs-dumper:v2.8.6` et `nginx:alpine` (déjà cached probablement).

Si erreur « image not found », vérifier qu'on a bien tagué `v2.8.6` (peut nécessiter de prendre une version plus récente — vérifier sur https://hub.docker.com/r/ldez/traefik-certs-dumper/tags).

- [ ] **Step 9.2: Démarrer le router stub (déclenche l'émission ACME pour turn.meeshy.me)**

Run:
```bash
ssh root@meeshy.me 'cd /opt/meeshy/production && docker compose up -d turn-cert-stub'
ssh root@meeshy.me 'docker ps --filter name=meeshy-turn-cert-stub'
```
Expected: container `meeshy-turn-cert-stub` en status `Up`.

- [ ] **Step 9.3: Attendre l'émission du cert par Let's Encrypt**

Run:
```bash
ssh root@meeshy.me 'docker logs meeshy-traefik --since 60s 2>&1 | grep -iE "turn.meeshy.me|acme|certificate" | tail -20'
```
Expected: voir un message Traefik type `[INFO] [turn.meeshy.me] acme: Obtaining bundled SAN certificate` puis `[INFO] [turn.meeshy.me] Server validation` puis `[INFO] [turn.meeshy.me] The server validated our request` puis `[INFO] [turn.meeshy.me] acme: Validations succeeded; requesting certificates`.

Attendre 30s à 2min si nécessaire. Re-vérifier les logs jusqu'à voir le succès.

- [ ] **Step 9.4: Confirmer le cert dans acme.json**

Run:
```bash
ssh root@meeshy.me 'docker exec meeshy-traefik cat /letsencrypt/acme.json' | jq -r '.letsencrypt.Certificates[].domain.main' | sort
```
Expected: `turn.meeshy.me` apparaît dans la liste (en plus des domaines déjà présents).

Si absent après 5 minutes, vérifier :
- DNS A record de `turn.meeshy.me` (revérifier step 1.3)
- Logs Traefik pour erreur explicite
- Rate limit Let's Encrypt (`docker logs meeshy-traefik 2>&1 | grep -i "rate limit"`)

- [ ] **Step 9.5: Démarrer le dumper**

Run:
```bash
ssh root@meeshy.me 'cd /opt/meeshy/production && docker compose up -d certs-dumper'
sleep 10
ssh root@meeshy.me 'docker logs meeshy-certs-dumper --tail 30'
```
Expected: logs du dumper indiquant qu'il a parsé `acme.json` et écrit les fichiers. Quelque chose comme `Certificate written: turn.meeshy.me.crt` (le format exact dépend de la version du dumper).

- [ ] **Step 9.6: Vérifier que les PEM sont bien extraits**

Run:
```bash
ssh root@meeshy.me '
  docker exec meeshy-certs-dumper ls -la /dumped/certs/ /dumped/private/
'
```
Expected: voir `turn.meeshy.me.crt` dans `/dumped/certs/` ET `turn.meeshy.me.key` dans `/dumped/private/`. Tailles non nulles. (D'autres certs/keys présents pour les autres sous-domaines, c'est normal.)

- [ ] **Step 9.7: Recréer le service coturn avec la nouvelle config**

Run:
```bash
ssh root@meeshy.me 'cd /opt/meeshy/production && docker compose up -d --force-recreate coturn'
sleep 15
ssh root@meeshy.me 'docker logs meeshy-coturn --tail 50'
```
Expected: voir successivement
1. Pas d'erreur `[FATAL] TURN_SECRET ...`
2. Aucun message `[FATAL] coturn cert files not present` (le watcher a trouvé les certs rapidement)
3. Messages de boot coturn standard : `0: log file opened`, `0: Listener address requested for...`, `0: TLS cipher list: DEFAULT`, `0: Certificate file: /etc/coturn/dumped/certs/turn.meeshy.me.crt`
4. Pas d'erreur SSL cert load

- [ ] **Step 9.8: Vérifier le healthcheck**

Run:
```bash
ssh root@meeshy.me 'docker ps --filter name=meeshy-coturn --format "table {{.Names}}\t{{.Status}}"'
```
Expected: `meeshy-coturn   Up X seconds (healthy)` après ~40s (start_period + retry).

Si `(unhealthy)`, lire les logs coturn et investiguer (port 3478 STUN doit répondre).

---

## Task 10: Validation TLS handshake et TURN client

**Files:** none

- [ ] **Step 10.1: Handshake TLS sur 5349 depuis l'extérieur**

Run depuis ta machine locale (PAS depuis le serveur prod, pour valider le trajet réseau complet) :
```bash
echo | openssl s_client -connect turn.meeshy.me:5349 -servername turn.meeshy.me 2>&1 | head -30
```
Expected:
- Ligne `subject=CN = turn.meeshy.me` OU `subject=...` avec `Subject Alternative Name: DNS:turn.meeshy.me`
- Ligne `issuer=C = US, O = Let's Encrypt, CN = ...`
- `Verify return code: 0 (ok)`
- Cipher TLS négocié type `TLS_AES_256_GCM_SHA384` ou similaire

Si `verify error:num=20:unable to get local issuer certificate`, c'est probablement OK quand même (juste un problème de chaîne intermédiaire côté client ; le serveur sert un cert valide). Vérifier que le CN matche.

Si `Connection refused` ou `timeout`, vérifier que le port 5349 est bien ouvert dans le firewall serveur prod et qu'aucun autre service ne squatte le port.

- [ ] **Step 10.2: Validation par OpenSSL avec le bundle système**

Run depuis la machine locale :
```bash
echo | openssl s_client -connect turn.meeshy.me:5349 -servername turn.meeshy.me -CApath /etc/ssl/certs 2>&1 | grep -E "Verify return|subject=|issuer=" | head -5
```
Expected: `Verify return code: 0 (ok)` clean.

- [ ] **Step 10.3: Test TURN client TLS (optionnel mais hautement recommandé)**

Pré-requis : `turnutils_uclient` installé localement (via `brew install coturn` sur macOS).

Récupérer un username + credential HMAC valides via la gateway :
```bash
# Récupérer le token d'auth
TOKEN=$(curl -sX POST https://gate.meeshy.me/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"atabeth","password":"pD5p1ir9uxLUf2X2FpNE"}' | jq -r '.data.token')

# Appeler l'endpoint qui produit les credentials TURN
CREDS=$(curl -s https://gate.meeshy.me/api/v1/calls/turn-credentials \
  -H "Authorization: Bearer $TOKEN")
echo "$CREDS" | jq

# Extraire username et credential
TURN_USER=$(echo "$CREDS" | jq -r '.data.iceServers[0].username // .data.username // .data.user')
TURN_PASS=$(echo "$CREDS" | jq -r '.data.iceServers[0].credential // .data.credential // .data.password')

echo "user=$TURN_USER"
echo "pass=$TURN_PASS"
```

Note : l'endpoint exact peut s'appeler `/calls/turn-credentials`, `/turn/credentials` ou similaire. Si 404, chercher dans `services/gateway/src/routes/` :
```bash
grep -rE "turn.{0,5}cred|TURNCredential" services/gateway/src/routes/
```

Lancer ensuite le test TURN/TLS :
```bash
turnutils_uclient -t -T -p 5349 -u "$TURN_USER" -w "$TURN_PASS" turn.meeshy.me
```
Expected: messages type `1: turn-client: Sending message X` puis `1: turn-client: ALLOCATE response (success)` puis `1: turn-client: relayed address: ...`. Pas d'erreur `401 Unauthorized` (sinon les credentials sont mauvais — vérifier qu'on a bien envoyé un HMAC, pas un mot de passe en clair).

Si l'endpoint TURN credentials n'est pas accessible ou complexe à invoquer, SKIPPER cette étape — elle ne bloque pas le déploiement, le test 10.1 + 10.2 valide déjà la couche TLS.

---

## Task 11: Test du watcher SIGUSR2 (simulation de renewal)

**Files:** none

- [ ] **Step 11.1: Capturer le timestamp avant test**

Run:
```bash
ssh root@meeshy.me '
  docker exec meeshy-certs-dumper sh -c "stat -c %y /dumped/certs/turn.meeshy.me.crt"
'
```
Expected: timestamp ISO format (sera la valeur "avant").

- [ ] **Step 11.2: Toucher le fichier .crt depuis le container dumper (simule un renewal)**

Run:
```bash
ssh root@meeshy.me '
  docker exec meeshy-certs-dumper sh -c "touch /dumped/certs/turn.meeshy.me.crt"
  echo "touched at: $(date -u +%FT%TZ)"
'
```

- [ ] **Step 11.3: Vérifier que coturn a détecté et envoyé SIGUSR2**

Run:
```bash
sleep 3
ssh root@meeshy.me 'docker logs meeshy-coturn --tail 20 2>&1 | tail -20'
```
Expected: présence d'un message `[coturn] cert changed, SIGUSR2 sent` ainsi qu'un message coturn type `0: SIGUSR2 received, reloading TLS certificate` (le format exact varie selon la version coturn).

Si le message n'apparaît PAS :
- Vérifier que `inotifywait` est bien installé : `ssh root@meeshy.me 'docker exec meeshy-coturn which inotifywait'` — doit retourner un chemin.
- Si `inotifywait` absent → `apk add` a échoué au boot, restart le container : `docker restart meeshy-coturn` puis re-tester.
- Vérifier les logs du watcher : il devrait y avoir une ligne `[coturn] cert changed, SIGUSR2 sent` à chaque touch.

---

## Task 12: Documentation post-déploiement

**Files:**
- Modify: `docs/audit-calls-2026-05-11.md` (optionnel : marquer le point TLS coturn comme résolu)

- [ ] **Step 12.1: Ajouter une note dans l'audit calls (optionnel mais recommandé)**

Si l'audit mentionne TLS coturn comme follow-up, le mettre à jour. Sinon, créer une section « Résolution » :

Run:
```bash
grep -nE "coturn|5349|TLS" docs/audit-calls-2026-05-11.md | head -10
```
Expected: voir les références existantes pour décider du placement.

Si rien à modifier, skipper cette étape.

- [ ] **Step 12.2: Commit éventuel de la documentation**

Si l'audit a été modifié :
```bash
git add docs/audit-calls-2026-05-11.md
git commit -m "docs(audit): mark TURN/TLS as resolved post coturn-tls-traefik deploy"
git push
```

---

## Task 13: Rollback prep (uniquement si on doit revenir en arrière)

**Files:** none (procédure SSH)

Cette task n'est PAS à exécuter sauf si la validation échoue gravement et qu'on doit annuler le déploiement.

- [ ] **Procédure rollback complète**

```bash
# 1. Restaurer les backups sur prod
ssh root@meeshy.me '
  cd /opt/meeshy/production
  BACKUP_TS=$(ls -1 docker-compose.yml.bak.* | sort | tail -1 | sed "s/.*\.bak\.//")
  echo "Restoring from backup timestamp: $BACKUP_TS"
  cp docker-compose.yml.bak.$BACKUP_TS docker-compose.yml
  cp config/turnserver.prod.conf.bak.$BACKUP_TS config/turnserver.prod.conf
'

# 2. Arrêter et retirer les services ajoutés
ssh root@meeshy.me 'cd /opt/meeshy/production && docker compose stop turn-cert-stub certs-dumper && docker compose rm -f turn-cert-stub certs-dumper'

# 3. Recréer coturn avec l'ancienne config
ssh root@meeshy.me 'cd /opt/meeshy/production && docker compose up -d --force-recreate coturn'

# 4. Optionnel : supprimer le volume si on ne veut pas garder l'historique
ssh root@meeshy.me 'docker volume rm meeshy-traefik-dumped-certs 2>&1 || true'

# 5. Côté repo : revert le commit
git revert HEAD --no-edit
git push
```

Note : le cert Let's Encrypt pour `turn.meeshy.me` reste dans `acme.json` même après rollback (Traefik le garde jusqu'à expiration ~90j). Pas de cleanup nécessaire côté Traefik.

---

## Task 14: Création de la PR

**Files:** none (gh CLI)

- [ ] **Step 14.1: Créer la PR vers main**

Run depuis le repo local :
```bash
gh pr create --base main --head feat/coturn-tls-traefik \
  --title "feat(infra): activer TURN/TLS via Traefik certs-dumper" \
  --body "$(cat <<'EOF'
## Summary

Active TURN over TLS (port 5349) en production en réutilisant les certificats Let's Encrypt déjà gérés par Traefik, sans modifier le mécanisme ACME (TLS-ALPN-01) ni introduire de nouveau secret.

## Changes

- **`turn-cert-stub`** (nginx:alpine) : router Traefik factice qui déclare `Host(\`turn.meeshy.me\`)` pour déclencher l'émission du cert via TLS-ALPN-01.
- **`certs-dumper`** (`ldez/traefik-certs-dumper:v2.8.6`) : sidecar qui surveille `acme.json` et extrait les PEM dans un volume partagé.
- **`coturn`** : mount RO du volume dumper, entrypoint enrichi avec attente bornée + `inotifywait` qui auto-déclenche `SIGUSR2` au renewal.
- **`turnserver.prod.conf`** : nouveaux chemins `cert=` et `pkey=`.

**Pas de mount `docker.sock`, pas de post-hook docker exec** — inversion de contrôle : coturn observe lui-même ses fichiers cert.

## Hors-scope (follow-ups)

- `pay.meeshy.me`, `login.meeshy.me`
- Migration TLS-ALPN-01 → DNS-01 wildcard
- Ajout des URLs `turns:turn.meeshy.me:5349?transport=tcp` côté `TURNCredentialService` et propagation iOS/web
- Monitoring expiration cert TURN (Prometheus blackbox-exporter)

## References

- Spec : `docs/superpowers/specs/2026-05-11-coturn-tls-via-traefik-design.md`
- Plan : `docs/superpowers/plans/2026-05-11-coturn-tls-via-traefik.md`
- Audit source : `docs/audit-calls-2026-05-11.md`

## Test plan

- [ ] Lint compose local : `docker compose -f docker-compose.prod.yml config --quiet` exit 0
- [ ] Déploiement sur production (cf. plan Task 8-9)
- [ ] `acme.json` contient `turn.meeshy.me` après démarrage `turn-cert-stub`
- [ ] PEM extraits par dumper visibles dans `/dumped/{certs,private}/`
- [ ] coturn boot logs OK, healthcheck `(healthy)`
- [ ] `openssl s_client -connect turn.meeshy.me:5349` retourne `Verify return code: 0`
- [ ] `turnutils_uclient -t -T -p 5349` établit un allocate (optionnel)
- [ ] Test watcher : `touch` du `.crt` côté dumper déclenche `SIGUSR2 sent` côté coturn
EOF
)"
```
Expected: URL de la PR créée, qui est affichée. La copier.

- [ ] **Step 14.2: Notifier l'équipe (optionnel)**

Selon la convention projet (Slack, Discord, mention review), poster un lien vers la PR avec un résumé court.

---

## Récapitulatif d'exécution

Ordre canonique pour le déploiement (Tasks 1 → 14) :
1. Pre-flight checks
2-4. Modifs YAML compose (3 sous-tâches + 1 sous-tâche coturn)
5. Modif turnserver.prod.conf
6. Lint local
7. Commit + push
8. Sync sur prod
9. Démarrage services (turn-cert-stub → certs-dumper → coturn)
10. Validation TLS handshake + TURN client
11. Test watcher SIGUSR2
12. Documentation
13. (Conditionnel) Rollback
14. PR

**Durée estimée** : 1h30 dont ~30min de validation/observation post-déploiement.

**Points d'attention** :
- Le challenge ACME pour `turn.meeshy.me` peut prendre 30s à 2min — patience nécessaire.
- L'ordre d'arrêt/démarrage des services compte : turn-cert-stub doit avoir déclenché l'émission du cert AVANT le démarrage de coturn.
- Si `apk add inotify-tools` échoue au boot du container coturn (réseau down), le coturn fonctionne quand même mais l'auto-reload est désactivé. Pas bloquant pour le déploiement initial — bloquant uniquement pour le renewal à J+60.

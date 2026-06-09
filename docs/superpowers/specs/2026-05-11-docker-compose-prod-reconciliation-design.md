# Réconciliation docker-compose.prod.yml : Prod → Repo

**Date** : 2026-05-11
**Auteur** : J. Charles N. M. (via Claude Code)
**Statut** : Design validé, en attente de plan d'implémentation
**Périmètre** : `infrastructure/docker/compose/docker-compose.prod.yml` uniquement

## 1. Contexte

Le fichier `docker-compose.prod.yml` du repo (592 lignes) diverge significativement de `/opt/meeshy/production/docker-compose.yml` qui tourne sur le serveur (519 lignes). Le diff brut fait 608 lignes (608 lignes ajoutées + supprimées).

Cette divergence est ancienne, pré-existante au merge de la feature `feat/coturn-tls-traefik` (commits `71b4b64a` → `088460a9`). Elle complique tout travail infra car le repo ne décrit pas la réalité déployée.

La règle établie dans la mémoire `feedback_prod_compose_divergence.md` est claire : **"JAMAIS écraser, toujours surgical patch après diff"** côté prod. Cette PR ne déploie rien — elle aligne uniquement le repo sur la réalité.

## 2. Objectif

Rendre `infrastructure/docker/compose/docker-compose.prod.yml` du repo **conforme à ce qui tourne actuellement en production**, tout en **conservant les améliorations additives sûres** (env vars optionnelles avec defaults, routes Traefik supplémentaires) qui sont rétro-compatibles si le fichier est un jour déployé.

### Direction de réconciliation
**Prod → Repo** (asymétrique). Le repo absorbe les divergences pour refléter la réalité. Aucune modification de prod n'est effectuée par cette PR.

### Critères de succès
1. Le diff entre `/opt/meeshy/production/docker-compose.yml` et `infrastructure/docker/compose/docker-compose.prod.yml` se résume à : ajout d'env vars optionnelles documentées comme "queued improvements" + commentaires éventuels.
2. Si on déployait le repo après cette PR vers `/opt/meeshy/production/docker-compose.yml`, **aucun container existant ne serait recréé** (mêmes container names, volumes, image names).
3. Les améliorations conservées sont listées explicitement dans le commit message et reproductibles côté prod via surgical patch.

## 3. Non-goals

- Modifier `docker-compose.staging.yml`, `.dev.yml`, `.local.yml`, `.local-https.yml`, `.monorepo.yml`
- Pousser des changements vers `/opt/meeshy/production/`
- Nettoyer les symlinks racines cassés (`docker-compose.yml` → cible absente, `docker-compose.monorepo.yml` → cible absente, etc.)
- Standardiser le nom d'image frontend entre prod (`isopen/meeshy-frontend:latest`) et staging (`isopen/meeshy-web:staging`)
- Fixer le bug sécurité prod où `agent` se connecte à MongoDB sans authentification (`DATABASE_URL=mongodb://database:27017/meeshy?replicaSet=rs0` sans user/password) — à traiter dans une PR sécurité dédiée avec rotation de mot de passe
- Réintroduire `mongo-init` (le service one-shot d'init replica set) en prod — à traiter dans une PR séparée si on décide d'automatiser l'init

## 4. Stratégie d'absorption

### 4.1 Changements à absorber (repo reculé pour matcher prod)

| Cat | Section/Service | Changement |
|---|---|---|
| **A** | Top-level | Ajouter `name: meeshy` (1ère ligne après header) |
| **A** | `frontend` | `container_name: meeshy-frontend` (au lieu de `meeshy-web`), image default `isopen/meeshy-frontend:latest` (au lieu de `isopen/meeshy-web:latest`) |
| **A** | `volumes.frontend_uploads` | Retirer `name: meeshy-web-uploads` (utiliser default `meeshy_frontend_uploads`) |
| **B** | `services` | **Retirer le service `mongo-init`** entièrement |
| **B** | `nosqlclient`, `translator`, `gateway`, `agent` | `depends_on: mongo-init (service_completed_successfully)` → `depends_on: database (service_healthy)` |
| **C** | `database.volumes` | Remonter 4 init scripts : `./shared/init-database.sh`, `./shared/init-mongodb-replica.sh`, `./shared/init-mongo.js`, `./shared/init-postgresql.sql` (tous en `:ro`) |
| **D** | `database.healthcheck` | Revenir à `echo 'db.runCommand("ping").ok' \| mongosh mongodb://localhost:27017/${MONGODB_DATABASE:-meeshy} --quiet \|\| exit 1` |
| **D** | `redis` | Retirer `command: redis-server --appendonly yes` |
| **E** | `gateway.environment` | Ajouter blocks APNS (6 vars hardcoded) : `APNS_KEY_ID=J73QFCYZGC`, `APNS_TEAM_ID=D72UK7R5RE`, `APNS_KEY_PATH=/app/secrets/apns_key.p8`, `APNS_BUNDLE_ID=me.meeshy.app`, `ENABLE_APNS_PUSH=true`, `APNS_ENVIRONMENT=production` |
| **E** | `gateway.environment` | Ajouter blocks EMAIL : `EMAIL_PROVIDER=${EMAIL_PROVIDER:-brevo}`, `EMAIL_FROM=${EMAIL_FROM:-noreply@meeshy.me}`, `EMAIL_FROM_NAME=${EMAIL_FROM_NAME:-Meeshy Sama}`, `BREVO_API_KEY=${BREVO_API_KEY:-}`, `SENDGRID_API_KEY=${SENDGRID_API_KEY:-}`, `MAILGUN_API_KEY=${MAILGUN_API_KEY:-}`, `MAILGUN_DOMAIN=${MAILGUN_DOMAIN:-}` |
| **E** | `gateway.environment` | Ajouter encryption : `ENCRYPTION_MASTER_KEY=${ENCRYPTION_MASTER_KEY:-}`, `ATTACHMENT_MASTER_KEY=${ATTACHMENT_MASTER_KEY:-}` |
| **E** | `gateway.environment` | Ajouter `MAX_TRANSLATION_LENGTH=10000` |
| **F** | `translator.environment` | Ajouter : `MAX_MESSAGE_LENGTH=10000`, `MAX_TEXT_LENGTH=100000`, `MAX_TRANSLATION_LENGTH=100000`, `MAX_TEXT_ATTACHMENT_THRESHOLD=100000` |
| **G** | `frontend.environment` | Ajouter Firebase public keys hardcoded : `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XF65H07ZRY`, `NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyCGBiVIUvW8CiVytXGHN1za2T3yI_7ynro`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=meeshy-me.firebaseapp.com`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=meeshy-me.firebasestorage.app`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID=meeshy-me`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=775794634022`, `NEXT_PUBLIC_FIREBASE_APP_ID=1:775794634022:web:d244d7c97208322dc365e7`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY=BDRguFxJ5f_alFmp-TCGc2VsLAaLEXybgcUGmIE7MMy4jpCjCYJZCcPGV9G1QKN2SBzYQhRuNL28fhKb2hsvvPo`, `NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true` |
| **H** | `gateway.volumes` | Changer `./secrets/firebase-admin-sdk.json:/app/secrets/firebase-admin-sdk.json:ro` → `/opt/meeshy/secrets/firebase-admin-sdk.json:/app/secrets/firebase-admin-sdk.json` (sans `:ro` pour matcher prod). Ajouter `/opt/meeshy/secrets/apns_key.p8:/app/secrets/apns_key.p8:ro` |
| **I** | `coturn.volumes` | Changer `../config/turnserver.prod.conf:/etc/turnserver.template.conf:ro` → `./config/turnserver.conf:/etc/turnserver.conf:ro` |
| **I** | `coturn` | Retirer le bloc `environment: - TURN_SECRET=${TURN_SECRET}` |
| **I** | `coturn.entrypoint` | Retirer le bloc de validation TURN_SECRET (les 4 lignes `if [ -z "$$TURN_SECRET" ] ...`) |
| **I** | `coturn.entrypoint` | Retirer la ligne `sed "s\|__TURN_SECRET__\|$$TURN_SECRET\|g" /etc/turnserver.template.conf > /tmp/turnserver.conf`. Remplacer la dernière ligne `exec turnserver -c /tmp/turnserver.conf` par `exec turnserver -c /etc/turnserver.conf` |
| **I** | `coturn.entrypoint` | **CONSERVER** : wait loop CERT_FILE/KEY_FILE, `apk add --no-cache inotify-tools`, watcher `inotifywait -m -q -e close_write,moved_to`, SIGUSR2 self-reload |
| **J** | `static-files.volumes` | Changer `./config/nginx/static-files.conf:/etc/nginx/conf.d/default.conf:ro` → `./docker/nginx/static-files.conf:/etc/nginx/conf.d/default.conf:ro` |
| **K** | `gateway.environment` | Hardcoder : `DATABASE_URL=mongodb://${MONGODB_USER:-meeshy}:${MONGODB_PASSWORD}@database:27017/${MONGODB_DATABASE:-meeshy}?replicaSet=rs0&directConnection=true&authSource=admin`. Retirer `HF_TOKEN=${HF_TOKEN}` (pas présent en prod sur gateway) |
| **K** | `translator.environment` | Idem hardcode DATABASE_URL avec auth. `PRISMA_SCHEMA_PATH=/workspace/schema.prisma` (au lieu de `${PRISMA_SCHEMA_PATH}`). `HF_TOKEN=${HF_TOKEN:-}` (avec default vide). Réorganiser ordre des env vars pour matcher prod |
| **K** | `nosqlclient.environment` | Hardcoder : `MONGOCLIENT_DEFAULT_CONNECTION_URL: "mongodb://${MONGODB_USER:-meeshy}:${MONGODB_PASSWORD}@database:27017/${MONGODB_DATABASE:-meeshy}?authSource=admin"` (sans replicaSet ni directConnection — c'est ce que prod a) |
| **K** | `agent.environment` | **NE PAS TOUCHER** au `DATABASE_URL=mongodb://database:27017/meeshy?replicaSet=rs0` même si insecure. Bug prod existant, hors-scope (PR sécurité séparée requise) |
| **L** | `traefik`, `nosqlclient`, `p3x-redis-ui`, `translator`, `gateway`, `static-files`, `frontend` | Remplacer tous les `${DOMAIN:-meeshy.me}` par `${DOMAIN:-localhost}` dans les labels Traefik |
| **L** | `gateway.labels` | Simplifier `traefik.http.routers.gateway.rule=Host(\`gate.${DOMAIN:-localhost}\`)` (retirer le `\|\| Host(\`api...\`)`) |
| **M** | `volumes.*` | Retirer tous les `name: meeshy-X-Y` explicites (utiliser defaults) |
| **N** | `networks.meeshy-network` | Retirer `name: meeshy-network` explicite |
| **O** | Tout le fichier | Retirer les headers décoratifs `# ====` pour matcher prod. **Garder** les commentaires substantifs (rationale comment dans coturn entrypoint, certs-dumper note `--post-hook=chmod` justification, etc.) car ils n'introduisent pas de divergence structurelle |
| **P** | `gateway.environment` | `JWT_EXPIRES_IN=${JWT_EXPIRES_IN}` (sans default `:-7d`) |
| **L** | `gateway.environment` | Hardcode `PUBLIC_URL=https://gate.${DOMAIN:-meeshy.me}` (au lieu de `${PUBLIC_URL:-...}` du repo) |
| **K** | `gateway.environment` | `CORS_ORIGINS=${CORS_ORIGINS}`, `ALLOWED_ORIGINS=${ALLOWED_ORIGINS}`, `FRONTEND_URL=${FRONTEND_URL}` (revenir aux indirections, le repo avait par erreur hardcodé les valeurs) |
| **K** | `gateway.environment` | ATABETH_* identity fields : retirer les defaults `${ATABETH_USERNAME:-atabeth}`, `${ATABETH_FIRST_NAME:-Atabeth}`, `${ATABETH_LAST_NAME:-User}`, `${ATABETH_ROLE:-user}` (prod n'a pas de defaults) |

**Note sur 4.1.K (DATABASE_URL hardcoding)** : prod hardcode l'URL complète plutôt que d'utiliser `${DATABASE_URL}`. Ça duplique la chaîne mais simplifie le .env (pas besoin de redéfinir DATABASE_URL si les composants MONGODB_USER/PASSWORD/DATABASE existent déjà). On absorbe ce pattern.

### 4.2 Changements à CONSERVER dans le repo (queued improvements)

Toutes les modifications listées ci-dessous sont **rétro-compatibles si le repo est déployé en prod** : ce sont uniquement des env vars optionnelles avec valeur par défaut. Aucun service, volume, port, network supplémentaire — strictement additif côté config.

| Cat | Service | Env vars conservées | Justification |
|---|---|---|---|
| **E** | `gateway` | `SESSION_EXPIRY_MOBILE_DAYS=${SESSION_EXPIRY_MOBILE_DAYS:-365}`, `SESSION_EXPIRY_DESKTOP_DAYS=${SESSION_EXPIRY_DESKTOP_DAYS:-30}`, `SESSION_EXPIRY_TRUSTED_DAYS=${SESSION_EXPIRY_TRUSTED_DAYS:-365}`, `MAX_SESSIONS_PER_USER=${MAX_SESSIONS_PER_USER:-10}` | Defaults safe, gateway code handle absence. À déployer plus tard via surgical patch |
| **E** | `gateway` | `BRAND_LOGO_URL=${BRAND_LOGO_URL:-}` | Default vide, branding optionnel |
| **F** | `translator` | `ENABLE_DIARIZATION=${ENABLE_DIARIZATION:-true}`, `TTS_MAX_NEW_TOKENS=${TTS_MAX_NEW_TOKENS:-2048}`, `TTS_MAX_SEGMENT_CHARS=${TTS_MAX_SEGMENT_CHARS:-1000}`, `TTS_MIN_SEGMENT_CHARS=${TTS_MIN_SEGMENT_CHARS:-50}` | Defaults safe (=actuels valeurs prod par défaut côté code) |
| **G** | `frontend` | `INTERNAL_BACKEND_URL=http://gateway:3000`, `NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true` | Feature flag + URL interne ; ajout additif, frontend code handle absence |

**Documentation des conservés** : chaque env var conservée est marquée par un commentaire YAML `# QUEUED IMPROVEMENT — à déployer sur prod via surgical patch quand X` (où X = next feature shipping it).

### 4.3 Hors-scope (à NE PAS modifier)

- `agent.environment.DATABASE_URL` : reste sans auth (bug sécurité prod, PR sécurité séparée)
- Tout autre fichier que `infrastructure/docker/compose/docker-compose.prod.yml`
- Symlinks racines cassés (`docker-compose.yml`, `docker-compose.monorepo.yml`, `docker-compose.local-https.yml`, `traefik-dynamic.yml`)
- `docker-compose.staging.yml` (déjà aligné par commit `6d37ae31`)
- Pipeline CI (pas de changement d'image name pour standardiser staging)

## 5. Risques & mitigation

| # | Risque | Probabilité | Mitigation |
|---|---|---|---|
| R1 | Diff final ne match pas exactement prod (oubli/typo) | Moyen | Étape de vérification finale : `diff /tmp/prod-docker-compose.yml infrastructure/docker/compose/docker-compose.prod.yml` doit ne montrer QUE les env vars conservées (cat. 4.2) + comment lines optionnels |
| R2 | Hardcoding Firebase keys leak en git | Faible | `NEXT_PUBLIC_FIREBASE_*` sont des clés publiques (exposées dans le bundle JS du frontend). Pas de leak réel |
| R3 | Hardcoding `APNS_KEY_ID`/`APNS_TEAM_ID` exposés | Faible | Ce sont des identifiants Apple, pas des secrets crypto. La clé `.p8` reste un fichier monté volumineux, non commité |
| R4 | Suppression de `mongo-init` casse le repo si dev démarre prod localement | Faible | `docker-compose.prod.yml` n'est pas utilisé en local. Le bootstrap replica set en local passe par `.local.yml`/`.dev.yml` qui restent intacts |
| R5 | Conservation des env vars queued cause confusion (présentes dans repo, absentes en prod) | Moyen | Commentaires YAML explicites `# QUEUED IMPROVEMENT` sur chaque ligne |
| R6 | Le revert du coturn template perd un gain sécurité | Faible | Le template approach (sed substitution) n'apporte qu'une protection marginale (secret toujours sur disque dans .env). À réintroduire dans une PR future "coturn template + secret rotation". Documenter dans memory |

## 6. Validation

### 6.1 Validation locale (pré-commit)
1. `docker compose -f infrastructure/docker/compose/docker-compose.prod.yml config --quiet` (validation syntaxique YAML/compose)
2. `diff /tmp/prod-docker-compose.yml infrastructure/docker/compose/docker-compose.prod.yml` doit montrer uniquement :
   - Env vars optionnelles conservées (4.2)
   - Comments YAML `# QUEUED IMPROVEMENT`
   - Aucune ligne supprimée non-attendue
3. Pas de tests automatisés à exécuter (changement docker-compose pur, code applicatif inchangé)

### 6.2 Validation post-merge
- Pas de déploiement requis (repo-only change)
- Documentation mémoire : créer/updater `feedback_prod_compose_divergence.md` avec la nouvelle baseline + liste explicite des "queued improvements" à patcher en prod

### 6.3 Test plan (manuel, après merge)
- [ ] Sur main : `diff /opt/meeshy/production/docker-compose.yml ./infrastructure/docker/compose/docker-compose.prod.yml` (après git pull sur le serveur ; lecture seule)
- [ ] Le diff montre uniquement les "queued improvements" listés dans 4.2
- [ ] Aucun service prod nécessite restart suite à ce merge (vérif manuelle : `docker ps` côté prod inchangé)

## 7. Plan d'exécution (à détailler dans implementation plan)

L'implémentation sera structurée en **un seul commit atomique** (la PR de réconciliation), pour éviter des états intermédiaires bizarres dans l'historique. Structure :

1. **Edit `docker-compose.prod.yml`** : applique tous les changements 4.1 et 4.2 ordre par catégorie A→P
2. **Vérification syntaxique** : `docker compose -f ... config --quiet`
3. **Vérification diff final** : comparaison vs `/tmp/prod-docker-compose.yml`, doit matcher l'attendu
4. **Commit** : message structuré listant absorbé (4.1) et conservé (4.2)
5. **Documentation mémoire** : mise à jour `feedback_prod_compose_divergence.md` + nouveau memory `project_compose_prod_reconciliation.md` listant les queued improvements à déployer

Le détail (lignes exactes, ordre des éditions, commandes de vérification) sera produit par writing-plans dans `docs/superpowers/plans/2026-05-11-docker-compose-prod-reconciliation-plan.md`.

## 8. Décisions techniques notables

### 8.1 Pourquoi `name: meeshy` au top-level
Sans cette ligne, le project name Docker Compose est dérivé du basename du répertoire (ex: `compose` ou `production`). Les volumes et networks par défaut prennent ce préfixe (ex: `compose_database_data`). Avec `name: meeshy`, ils deviennent `meeshy_database_data` — c'est ce que prod a actuellement. Oublier cette ligne signifie que la prod ne retrouverait pas ses volumes au prochain `up`.

### 8.2 Pourquoi NE PAS garder le coturn template
Le pattern "template + sed substitution" du repo (introduit par `71b4b64a`) est strictement meilleur sécurité-wise (le `turnserver.conf` final est en `/tmp`, ne persiste pas, ne contient le secret que pour la durée du process). Mais :
1. Il nécessite que `/opt/meeshy/production/config/turnserver.prod.conf` existe et soit configuré (template avec `__TURN_SECRET__` placeholder). Actuellement c'est `turnserver.conf` qui existe avec le secret en clair.
2. Le path relatif `../config/turnserver.prod.conf` du repo résout à `/opt/meeshy/config/turnserver.prod.conf` une fois déployé (à cause du `..`). Probablement absent.
3. Le bloc de validation `if [ -z "$$TURN_SECRET" ] ...` ajoute du bruit dans l'entrypoint qui n'est pas nécessaire si on revient au pattern direct.

Le revert nous remet exactement sur prod. La réintroduction du template sera faite via une PR future combinée à la rotation du secret coturn et la mise en place de `config/turnserver.prod.conf` en prod.

### 8.3 Pourquoi NE PAS garder mongo-init
Le service `mongo-init` est un one-shot d'initialisation du replica set MongoDB. Il existe dans le repo (et dans staging), mais pas en prod. Le replica set prod a été initialisé manuellement il y a longtemps et tourne stable.

Si on gardait `mongo-init` dans le repo avec les `depends_on: mongo-init (service_completed_successfully)`, un déploiement vers prod (jamais fait via cette PR mais en théorie) :
1. Ferait apparaître un nouveau service `meeshy-mongo-init` (à priori OK car son try/catch détecte le RS déjà initialisé)
2. MAIS retarderait le démarrage de gateway/translator/agent/nosqlclient jusqu'à ce que mongo-init complete — risk inutile

Garder le service "dormant" (sans depends_on de personne) est une demi-mesure qui complique le diff sans gain. On supprime proprement. Réintroduction future si on décide d'auto-initialiser.

### 8.4 Pourquoi LAISSER le bug agent sans auth
Le service `agent` se connecte à MongoDB sans authentification en prod (`DATABASE_URL=mongodb://database:27017/meeshy?replicaSet=rs0`). C'est un bug sécurité car n'importe quel container du network `meeshy-network` peut s'y connecter sans password — l'isolation network bridge est notre seule protection.

Le fixer ici impliquerait :
1. Ajouter `MONGODB_USER`/`MONGODB_PASSWORD` aux env vars d'agent
2. Mettre à jour l'image agent pour utiliser cette URL
3. Redéployer agent en prod

C'est trop ambitieux pour une PR "reconciliation pure". À traiter dans une PR sécurité dédiée avec rotation préalable du password MongoDB et coordination de déploiement (downtime éventuel).

## 9. Memory updates prévues

À la fin de l'implémentation :

1. **Update** `feedback_prod_compose_divergence.md` :
   - Référencer ce design + sa PR
   - Lister les "queued improvements" actuels (les seules divergences résiduelles attendues)
   - Confirmer que la baseline du diff est maintenant tracée

2. **New** `project_compose_prod_reconciliation.md` :
   - Lien vers ce design
   - Liste des "queued improvements" à propager vers prod (cat. 4.2)
   - Bug agent auth (cat. 4.3) avec ETA
   - Coturn template à réintroduire (cat. 4.1 I) avec ETA

## 10. Références

- Audit prod : `/tmp/prod-docker-compose.yml` (519 lignes, hash `013deea1`)
- Diff brut : `/tmp/full-diff.patch` (608 lignes, 28 KB)
- Repo prod actuel : `infrastructure/docker/compose/docker-compose.prod.yml` (592 lignes)
- Commits coturn récents : `71b4b64a`, `98c75ec1`, `79e534ae`, `d676d95a`, `088460a9`, `6d37ae31`
- Mémoire : `feedback_prod_compose_divergence.md`, `feedback_traefik_certs_dumper_gotchas.md`, `feedback_ufw_ports_after_infra_change.md`

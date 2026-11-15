# Canal de promotion production — ce que le porteur fait une seule fois

Fichiers du canal (#9325) :
- `.github/workflows/promote-production.yml` — le workflow manuel
- `infrastructure/scripts/meeshy-promote-production.sh` — source de `/usr/local/bin/meeshy-promote-production.sh`
- règle D de `scripts/check-docker-prune-noninteractive.mjs` — la clé de production ne vit que dans un workflow manuel, en environnement `production`

Périmètre : `gateway`, `translator`, `agent`, `webapp` (conteneur `meeshy-frontend`), basculés dans
cet ordre. La webapp y est entrée avec #10208 : son origine d'API se déclare au démarrage
(`MEESHY_API_URL`, `infrastructure/webapp-runtime-config.md`), donc l'image recettée sur staging est
celle de la production. Le plan refuse une image webapp antérieure (sans l'entrypoint
`meeshy-runtime-config`), dont l'origine reste figée sur `gate.staging.meeshy.me`.

## Sur le serveur (root@meeshy.me)

1. **Clé dédiée**, générée hors serveur et distincte de celle du staging :
   `ssh-keygen -t ed25519 -N '' -C gha-promote-production -f meeshy-promote-prod`
2. **Script** : copier puis `install -m 0755 … /usr/local/bin/meeshy-promote-production.sh`,
   puis `meeshy-promote-production.sh --self-test`.
3. **`authorized_keys` de root**, une ligne :
   `command="/usr/local/bin/meeshy-promote-production.sh",restrict ssh-ed25519 AAAA… gha-promote-production`
   Vérifier `PermitUserEnvironment no` et qu'`AcceptEnv` n'accepte pas `MEESHY_*` ni `COMPOSE_*`.
4. **Surcharge lue par compose** : sauvegarder `/opt/meeshy/production/.env`, relever les fichiers réels
   (`docker inspect meeshy-gateway -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}'`),
   puis ajouter au `.env` la ligne `COMPOSE_FILE=<ces fichiers>:docker-compose.promotion.yml`.
   Lancer ensuite `meeshy-promote-production.sh init` : la commande écrit une surcharge vide, valide `compose config`
   et affiche un `up --dry-run` qui ne doit rien recréer.
5. **Scripts d'exploitation** : `grep -rn 'compose -f' /opt/meeshy/production` puis retirer `-f`
   des commandes trouvées. Un `-f` explicite ignore la surcharge, et la production repartirait sur `:latest`.
6. **Empreinte d'hôte** : `ssh-keyscan -t ed25519 meeshy.me`, à comparer avec
   `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` sur le serveur.
7. **Répétition sur staging** (règle « retour arrière testé sur staging ») : la commande est en tête du script.
   Elle bascule `gateway-staging` vers son digest précédent, puis lance `rollback`. Supprimer ensuite le
   `docker-compose.promotion.yml` de staging.

## Dans GitHub

1. **Environnement `production`** : *Deployment branches* limité à `dev`.
   Pour *Required reviewers*, mettre personne si Claude promeut seul (#9223), ou le porteur s'il veut garder un clic.
   Cocher aussi *Allow administrators to bypass* = non.
2. **Secrets de l'environnement** (pas du dépôt) : `PRODUCTION_SSH_KEY`, `PRODUCTION_SSH_HOST`,
   `PRODUCTION_SSH_USER` (`root`) et `PRODUCTION_SSH_KNOWN_HOSTS` (obligatoire, sans repli `accept-new`).
3. **Variable** `PORTEUR_GITHUB_LOGIN` : le seul compte dont le commentaire vaut feu vert de données.
4. **Fusion dans `dev`** de ce lot (workflow, script, règle D, commentaires de `docker.yml` et `infrastructure/CLAUDE.md`).

## Usage

- Lire : `gh workflow run promote-production.yml --ref dev -f action=status`
- Promouvoir :
  `gh workflow run promote-production.yml --ref dev -f action=promote -f gateway=sha256:… -f agent=sha256:… -f recette=<URL>` — **passerelle et agent toujours ensemble** (#10290) : l'hôte refuse l'un sans l'autre ; un agent inchangé est sauté (« deja-en-production »).
  Prendre les digests dans la ligne `ETAT … staging=` du `status`.
- **Retour arrière, une commande** : `gh workflow run promote-production.yml --ref dev -f action=rollback -f gateway=rollback -f agent=rollback`.
  Sans GitHub, en root sur l'hôte : `meeshy-promote-production.sh rollback gateway agent`.

## Migrations de données — depuis l'image passerelle (#10865)

Une migration s'exécute depuis l'image de la passerelle, sans `scp`, sans `tsx` et sans dépôt sur l'hôte.
L'image embarque les deux familles, et sa construction échoue si l'une manque
(`RUN node dist/src/migrations/named/cli.js verify-image`, `services/gateway/Dockerfile`).
En production, une écriture n'a lieu qu'après le **feu vert du porteur** et une **sauvegarde vérifiée**.
Sur staging, ajouter `-staging` aux noms de conteneurs.

- **Inventaire, avec la commande exacte de chaque migration** :
  `docker exec meeshy-gateway node dist/src/migrations/named/cli.js list` (`list --staging` pour les noms de staging).
- **Migrations nommées** (`services/gateway/src/migrations/named/`) : elles s'exécutent par `node`, avec le pilote
  `mongodb` (dépendance de production). Elles lisent `DATABASE_URL` et les secrets (`READER_KEY_HMAC_SECRET`,
  `RAW_READING_RETENTION_DAYS`) dans l'environnement du conteneur, sans rien recopier ni afficher.
  - à blanc (défaut) : `docker exec meeshy-gateway node dist/src/migrations/named/cli.js <nom>`.
    La base qu'elles reçoivent refuse alors toute écriture.
  - écriture : `docker exec meeshy-gateway node dist/src/migrations/named/cli.js <nom> --apply`
- **Migrations mongosh** (`packages/shared/prisma/migrations/*.mongodb.js`, embarquées sous
  `/app/packages/shared/prisma/migrations`) : le conteneur passerelle les lit, le `mongosh` du conteneur base les exécute.
  ```
  URI=$(docker exec meeshy-gateway printenv DATABASE_URL)
  docker exec meeshy-gateway cat /app/packages/shared/prisma/migrations/<fichier> \
    | docker exec -i [-e APPLY=1 | -e DRY_RUN=1] meeshy-database mongosh "$URI" --quiet
  ```
  **Les conventions diffèrent d'un script à l'autre.** La plupart sont à blanc par défaut (`APPLY=1` pour écrire),
  d'autres écrivent par défaut (`DRY_RUN=1` pour simuler), et les plus anciennes n'ont pas de mode à blanc.
  `list` lit la convention dans chaque script et affiche les deux commandes.

Une migration nommée neuve s'ajoute dans `src/migrations/named/` et dans `registry.ts`. C'est ce qui la rend
exécutable depuis l'image. Les scripts `services/gateway/scripts/migrations/*.ts` ne sont plus que des façades de
développement (`bunx tsx`, `DRY_RUN=1`).

## Avant la première promotion

`dev` contient `packages/shared/prisma/migrations/2026-10-01-schema-indexes.mongodb.js` et deux migrations
du 2026-10-04 (instantanés de participants). La porte de données les détecte : la première promotion de la
passerelle exige donc le feu vert du porteur, ces migrations étant appliquées d'abord, avec leur sauvegarde vérifiée.
La passerelle lance aussi `backfillSearchTokens` à chaque démarrage. C'est une écriture idempotente que ce canal
ne peut pas empêcher : il l'accepte, sous la condition que le diff ne touche pas `services/gateway/src/jobs/`.

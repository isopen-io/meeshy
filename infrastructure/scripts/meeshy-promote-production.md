# Canal de promotion production — ce que le porteur fait une seule fois

Fichiers du canal (#9325) :
- `.github/workflows/promote-production.yml` — le workflow manuel
- `infrastructure/scripts/meeshy-promote-production.sh` — source de `/usr/local/bin/meeshy-promote-production.sh`
- règle D de `scripts/check-docker-prune-noninteractive.mjs` — la clé de production ne vit que dans un workflow manuel, en environnement `production`

Périmètre : `gateway`, `translator`, `agent`. **La webapp est exclue** : l'image de staging porte
`VITE_API_BASE=https://gate.staging.meeshy.me` figée au build. Il faut d'abord une issue pour
rendre l'origine de l'API lisible à l'exécution (une même image pour les deux environnements).

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
   de `docker.yml`, l'en-tête du garde et `infrastructure/CLAUDE.md:55` selon la directive du 2026-10-04.

## Usage

- Lire : `gh workflow run promote-production.yml --ref dev -f action=status`
- Promouvoir :
  `gh workflow run promote-production.yml --ref dev -f action=promote -f gateway=sha256:… -f recette=<URL>`.
  Prendre les digests dans la ligne `ETAT … staging=` du `status`.
- **Retour arrière, une commande** : `gh workflow run promote-production.yml --ref dev -f action=rollback -f gateway=rollback`.
  Sans GitHub, en root sur l'hôte : `meeshy-promote-production.sh rollback gateway`.

## Avant la première promotion

`dev` contient `packages/shared/prisma/migrations/2026-10-01-schema-indexes.mongodb.js` et deux migrations
du 2026-10-04 (instantanés de participants). La porte de données les détecte : la première promotion de la
passerelle exige donc le feu vert du porteur, ces migrations étant appliquées d'abord, avec leur sauvegarde vérifiée.
La passerelle lance aussi `backfillSearchTokens` à chaque démarrage. C'est une écriture idempotente que ce canal
ne peut pas empêcher : il l'accepte, sous la condition que le diff ne touche pas `services/gateway/src/jobs/`.

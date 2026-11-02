# Runbook — worker de médias du staging (`media-worker-staging`, #11264, #13984)

Le worker rend, hors de la requête, la vignette, les variantes WebP/AVIF et le thumbhash des images d'au moins 2 Mo et la vignette des vidéos. Il consomme la file BullMQ `media-processing` sur `redis-staging`. Même image que la passerelle, autre commande, ni port ni Traefik.

## Ce qui doit être vrai sur l'hôte

Le compose du serveur (`/opt/meeshy/staging/docker-compose.yml`) **diverge du dépôt** : bases authentifiées, journald en ligne, pas d'ancre YAML. Le dépôt ne suffit donc pas ; trois points sont à poser à la main, et c'est leur absence qui a laissé le staging synchrone du 2026-10-23 au 2026-10-31 (#13984).

1. `gateway-staging` porte `- MEDIA_QUEUE=bullmq` dans son `environment`.
2. Le service `media-worker-staging` existe, avec les identifiants de la passerelle :

   ```yaml
   media-worker-staging:
     image: ${GATEWAY_IMAGE:-isopen/meeshy-gateway:staging}
     container_name: meeshy-media-worker-staging
     restart: unless-stopped
     logging: { driver: journald, options: { tag: "{{.Name}}" } }
     command: ["node", "dist/src/workers/media-worker.js"]
     healthcheck:
       test: ["CMD-SHELL", "test $$(( $$(date +%s) - $$(stat -c %Y /tmp/media-worker.alive) )) -lt 60"]
       interval: 30s
       timeout: 5s
       retries: 3
       start_period: 30s
     stop_grace_period: 180s
     environment:
       - DATABASE_URL=mongodb://gateway:${MONGO_GATEWAY_PASSWORD:?}@database-staging:27017/${MONGODB_DATABASE:-meeshy}?replicaSet=rs0&directConnection=true&authSource=admin
       - REDIS_URL=redis://gateway:${REDIS_GATEWAY_PASSWORD:?}@redis-staging:6379
       - NODE_ENV=production
       - UPLOAD_PATH=/app/uploads
       - MEDIA_WORKER_CONCURRENCY=1
     volumes:
       - gateway_staging_uploads:/app/uploads
     depends_on:
       mongo-init-staging: { condition: service_completed_successfully }
       redis-staging: { condition: service_healthy }
     networks:
       - meeshy-staging-network
     deploy:
       resources:
         limits: { cpus: '1.0', memory: 1536M }
     labels:
       - "traefik.enable=false"
   ```

   `VIDEO_COMPAT_RENDITION` reste éteint sur la passerelle ET sur le worker tant que le rendu H.264 n'est pas allumé des deux côtés : la passerelle décide des rendus d'une pièce, le balayage du worker relit cette variable.
3. `/usr/local/bin/meeshy-deploy-staging.sh` est la copie de `infrastructure/scripts/meeshy-deploy-staging.sh` (sa liste blanche contient `media-worker-staging`). Sans elle, le second appel du job `deploy-staging` de `docker.yml` est refusé en rc = 64 : un avertissement, jamais un échec, et le worker garde une image ancienne.

Les index du balayage (`processingState_1_createdAt_1` sur `MessageAttachment` et `PostMedia`) sont créés par `scripts/migrations/mongodb/media_processing_sweep_indexes_11264.js` (staging : posés le 2026-10-31).

## Mise en place ou réparation

```bash
cd /opt/meeshy/staging
cp -a docker-compose.yml docker-compose.yml.backup-<issue>-$(date -u +%Y%m%d-%H%M%S)
# poser les points 1 et 2, puis :
docker compose config -q && docker compose config --services | grep media-worker-staging
docker compose up -d --no-deps media-worker-staging      # attendre (healthy)
docker compose up -d --no-deps gateway-staging           # relit MEDIA_QUEUE
```

## Contrôles

- `docker ps` : `meeshy-media-worker-staging … (healthy)`, même image (`docker inspect --format '{{.Image}}'`) que `meeshy-gateway-staging`.
- Battement : `redis-cli --user gateway GET meeshy:media-worker:heartbeat` (mot de passe par `REDISCLI_AUTH`, jamais en argument) rend une date à moins de 30 s.
- Journal de la passerelle : `Écoute des médias prêts démarrée`.
- Après un envoi d'une photo de plus de 2 Mo : la réponse porte `processingState: "pending"`, puis la ligne passe `ready` avec `thumbnailPath`, `avifVariants` et `thumbHash`.
- Latence du dernier PATCH : `p95 = 0,14 s` le 2026-10-31 (photo de 3,0 Mo, 12 Mpx, n = 20, depuis l'hôte), contre `39,6 s` sans worker.

## Retour arrière

Jamais en retirant `MEDIA_QUEUE` d'un coup : les pièces `pending` n'auraient plus personne pour les rendre.

1. `MEDIA_QUEUE=drain` sur `gateway-staging`, `docker compose up -d --no-deps gateway-staging` : les nouveaux envois redeviennent synchrones, et la passerelle reprend, toutes les 5 min, les pièces `pending` de plus de 15 min.
2. `docker compose stop media-worker-staging` (il finit sa tâche, 180 s au plus).
3. Quand plus aucune pièce n'est `pending`, retirer `MEDIA_QUEUE` et le service, ou restaurer la sauvegarde du compose.

Sans worker mais file allumée, une passerelle d'une image postérieure à #13984 rend elle-même après la réponse : le worker arrêté par accident ne ralentit plus les envois, il déplace seulement le calcul dans la passerelle.

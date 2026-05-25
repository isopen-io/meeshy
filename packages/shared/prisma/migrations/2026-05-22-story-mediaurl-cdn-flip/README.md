# 2026-05-22 — Story mediaURL CDN flip

Migration ponctuelle pour réparer les stories publiées avec un `mediaURL`
local fuité dans `storyEffects.mediaObjects[]` (cf. commit `5d37ddba5` +
`cde832abc` qui corrigent le bug en amont côté composer iOS).

## Bug réparé
Avant les commits ci-dessus, l'app iOS uploadait l'asset au CDN, set le
`postMediaId` sur le `StoryMediaObject` MAIS oubliait de réécrire le
`mediaURL` du `file:///private/var/mobile/.../tmp/{uuid}.jpg` local de
l'auteur vers l'URL CDN. Côté lecteur, `StoryMediaLayer.resolvedMediaURL`
fallback sur ce `file://` qui pointe vers un sandbox étranger → image
absente, canvas vide.

## Run

### Dry-run (compte + échantillon, ne modifie rien)
```bash
ssh root@meeshy.me "docker exec -i meeshy-database mongosh \
  'mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true' \
  --quiet" < dry_run.mongodb.js
```

### Apply (modifie les posts ; faire un mongodump d'abord !)
```bash
# Backup
ssh root@meeshy.me "docker exec meeshy-database mongodump \
  --uri='mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true' \
  --collection=Post --out=/tmp/backup_post_\$(date +%s)"

# Apply
ssh root@meeshy.me "docker exec -i meeshy-database mongosh \
  'mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true' \
  --quiet" < apply.mongodb.js
```

## Résultat prod (2026-05-22)
- 27 posts impactés (STORY uniquement)
- 39 mediaObjects flippés du `file://` local vers `media.fileUrl` CDN
- 0 nullifié — 100% des PostMedia retrouvés via `postMediaId`
- Backup : `/tmp/backup_post_1779447606/` sur la prod
- Vérification post-migration : `remaining_polluted_posts=0`

## Idempotence
Le script peut être relancé sans risque : la requête `find` filtre déjà
les `mediaURL` commençant par `file://`. Si plus aucun ne match, la
migration est no-op.

## Les médias vivent derrière une interface S3, écrits en double et relus par la passerelle (2026-10-23, #11267)

### Contexte

Les médias (pièces jointes, vignettes, variantes, pistes TTS, médias de post) vivent sur un volume Docker monté par la seule passerelle (`gateway_uploads`, garde `media-uploads-never-public`, #11256). #9232 demande que rien n'empêche de monter vite à 100 000 utilisateurs, c'est-à-dire une passerelle sans état et des médias derrière une interface S3. Ce lot concerne le staging seulement : la migration des données de production attend le feu vert du porteur (#9232), précédé d'une sauvegarde vérifiée.

### Décision

1. **Une interface, trois magasins** (`services/storage/objects/`) :
   - `MediaObjectStore` : `head`, `read` (avec plage), `write`, `remove`, par **clé de stockage** (relative, sans remontée ni segment caché : `isSafeStorageKey`) ;
   - `LocalObjectStore` : le disque, confiné à sa racine, en écriture atomique ;
   - `S3ObjectStore` : tout S3 (MinIO, Garage, R2), sans ACL. Le seau reste privé ;
   - `MirroredObjectStore` : le disque d'abord, puis le seau. Une panne du seau ne fait jamais échouer l'écriture : le disque fait foi et la clé est signalée.

   `processMediaObjectStores()` est l'instance du processus, que la route de fichiers et le worker média (#11264) partagent.
2. **Écriture en double.** Les écrivains existants (`services/attachments/**`, `media-renditions`) ne sont pas réécrits dans ce lot : la chaîne A tient leurs fichiers, et leur bascule est l'objet de #12359. Le **miroir continu** recopie dans la minute ce qu'ils posent sur le disque. Il tourne **dans la passerelle** (`jobs/media-mirror-follow.ts`) et non dans un conteneur voisin : la passerelle est le seul service qui monte les dépôts, et un voisin qui les monterait ouvrirait la surface que #11256 a fermée.
3. **Migration par lots** : `mediaMirrorCli.js`, le même code que le miroir continu.
   - À blanc par défaut.
   - **Idempotente** : une clé déjà au seau à la même taille est sautée.
   - **Reprise** par curseur d'ObjectId, gardé après chaque lot dans `<UPLOAD_PATH>/.media-mirror/state.json` (dossier caché, jamais servi).
   - **Fenêtre de 24 h** repassée à chaque cycle, pour les vignettes et pistes TTS écrites après leur ligne.
   - Hors staging, `--apply` exige `--porteur-approval=<lien>` ; le miroir continu exige `MEDIA_S3_MIRROR_PORTEUR_APPROVAL`, et à défaut il ne fait que compter.
   - Codes de sortie : 0 terminé, 4 copies en échec (relancer reprend), 2 refusé.
4. **Lecture rétrocompatible.** Les quatre routes de fichiers (par identifiant, vignette, par chemin, adresse signée) lisent le disque d'abord, puis le seau si le fichier y manque. Les URL ne changent pas. Plages, `ETag` (celui du seau) et 304 fonctionnent comme sur le disque, et les gardes (lecteur, cycle de vie, cache, vue unique) s'appliquent **avant** toute lecture.
5. **Fermé par défaut sur la résurrection.** La route par chemin ne consulte le seau que pour une clé **qu'une pièce jointe vivante porte** (verdict `serve`). Une clé sans porteur (message purgé, compte effacé, avatar) ne se cherche que sur le disque, sinon sa copie la ressusciterait. Sans seau configuré, un fichier absent du disque n'interroge toujours pas la base (#9315).
6. **Un effacement atteint le seau.** Le balayage (`mediaBucketSweep.ts`, une fois par heure dans le miroir continu, ou `--sweep`) retire du seau ce qu'aucune ligne vivante ne nomme plus, au-delà d'une grâce de 24 h : l'écriture en double précède la ligne. C'est une **purge**, donc elle échoue fermée :
   - une collecte incomplète ne balaie pas ;
   - une base qui ne nomme aucune clé refuse ;
   - plus de la moitié du seau à effacer en un passage refuse ;
   - elle est à blanc par défaut, et hors staging sous le même régime que `--apply`.

   Toutes les colonnes qui portent une clé sont lues (`filePath`, `fileUrl`, `thumbnailPath`, `thumbnailUrl`, `imageVariants`, `translations`, pour les pièces jointes ET les médias de post), car une colonne omise serait une copie vivante effacée.
7. **Le seau de staging** (`media-s3-staging`, profil `media-s3`) n'a ni port, ni Traefik, et rejoint le seul réseau interne. Son initialisation crée le seau sans politique anonyme. Aucun identifiant n'a de valeur par défaut (MinIO prendrait « minioadmin »), et la console MinIO est éteinte. Garde : `media-bucket-never-public.test.ts`. La production n'a pas de seau.
8. **Image.** MinIO ne publie plus d'image communautaire depuis le 2025-10-23, et ses mainteneurs ont décliné de corriger CVE-2025-62506. Le staging prend donc la construction Chainguard, tenue à jour (`cgr.dev/chainguard/minio`, surchargeable par `MEDIA_S3_IMAGE`). MinIO est sous AGPLv3, utilisé sans modification comme service séparé. Le code ne parle que S3 : Garage, SeaweedFS ou R2 s'y branchent par l'environnement, sans changer une ligne.

### Configuration

`MEDIA_S3_MIRROR=on` arme le magasin et le miroir. `MEDIA_S3_ENDPOINT`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY_ID` et `MEDIA_S3_SECRET_ACCESS_KEY` sont requis. Viennent ensuite `MEDIA_S3_REGION` (défaut `us-east-1`), `MEDIA_S3_FORCE_PATH_STYLE` et `MEDIA_MIRROR_INTERVAL_MS` (défaut 60 s ; à blanc, une passe par jour). Une configuration incomplète retombe sur le disque seul, en le journalisant.

### Conséquences

- Performance : argumentée, non mesurée. Un fichier présent sur le disque coûte exactement ce qu'il coûtait. Un fichier absent coûte une requête de verdict, un `HEAD` et un `GET` S3 sur le réseau interne. Le miroir continu coûte un `HEAD` par clé de la fenêtre de 24 h et par minute.
- Restent ouverts : la bascule synchrone des écrivains (#12359) ; les médias de post servis depuis le seau, puis l'éviction du disque (#12360) ; la sauvegarde hors site du seau par `mc mirror` (#12361) ; un seul miroir par flotte de passerelles (#12362).

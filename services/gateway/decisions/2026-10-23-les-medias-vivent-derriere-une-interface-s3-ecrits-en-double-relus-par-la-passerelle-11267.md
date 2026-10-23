## Les médias vivent derrière une interface S3, effacés avec le disque et relus par la passerelle (2026-10-23, #11267)

### Contexte

Les médias (pièces jointes, vignettes, variantes, pistes TTS, médias de post) vivent sur un volume Docker monté par la seule passerelle (`gateway_uploads`, garde `media-uploads-never-public`, #11256). #9232 demande que rien n'empêche de monter vite à 100 000 utilisateurs : une passerelle sans état et des médias derrière une interface S3. Ce lot concerne le **staging seulement**. La migration des données de production attend le feu vert du porteur (#9232), précédé d'une sauvegarde vérifiée. Le lot est passé par l'auditeur adversarial (« À CORRIGER », défauts D1 à D8, tous traités ci-dessous).

### Décision

1. **Une interface, trois magasins** (`services/storage/objects/`).
   - `MediaObjectStore` : `head`, `read` (avec plage), `write`, `remove`, par clé de stockage. Une clé est relative, sans remontée ni segment caché (`isSafeStorageKey`, `storageKeyUnder`).
   - `LocalObjectStore` : le disque, confiné à sa racine.
   - `S3ObjectStore` : tout S3, sans ACL ; il sait aussi énumérer son seau.
   - `MirroredObjectStore` : le disque d'abord, puis le seau.
   - `processMediaObjectStores()` est l'instance que partagent la route de fichiers, les effaceurs et, demain, le worker média (#11264).
2. **Ce qui est synchrone, et ce qui ne l'est pas encore.**
   - **L'effacement est synchrone** (audit D2). `AttachmentService.unlinkQuietly` (original, vignette, dérivés) et `MediaService.deleteMedia` (médias de post, via `reclaimMediaRowBytes`) appellent `eraseMirroredCopy` juste après le disque, sous la même règle de référence. Un seau en panne n'empêche aucun effacement.
   - **L'écriture en double ne l'est PAS encore.** Les écrivains existants (`services/attachments/**`, `media-renditions`) écrivent sur le disque seul. Le **miroir continu** de la passerelle recopie leurs fichiers dans la minute. Leur bascule sur `processMediaObjectStores().store` est l'objet de #12359. Le miroir tourne **dans la passerelle** (`jobs/media-mirror-follow.ts`), seul service qui monte les dépôts : un conteneur voisin rouvrirait la surface de #11256.
3. **Migration par lots** : `mediaMirrorCli.js`, le même code que le miroir continu.
   - Elle tourne à blanc par défaut.
   - **Idempotente.** Une copie est « déjà là » quand elle a la taille ET la date du fichier source (métadonnée `source-mtime`, audit D6). Une réécriture à taille égale est donc recopiée.
   - **Reprise** par curseur d'ObjectId. Le fichier d'état s'écrit sous un nom temporaire unique, puis il est renommé (audit D5).
   - La fenêtre des dernières 24 h est repassée à chaque cycle. Le miroir fait aussi **une passe complète par jour** (audit D4), pour rattraper un fichier écrit plus de 24 h après sa ligne.
   - Hors staging, `--apply` exige `--porteur-approval=<lien>`. Ce contrôle porte sur la FORME du lien et ne prouve aucun accord (audit D7) : il empêche l'accident, pas une volonté.
   - **Un seul passage à la fois sur un volume** (audit D5). Un verrou-fichier exclusif (`.media-mirror/lock`) a une échéance de 10 min, repoussée tant que le passage tourne. La ligne de commande appliquée le tient toute sa durée et rend le code 2 s'il est occupé. Le job, lui, saute le passage. Le verrou de flotte est #12362.
4. **Clés vivantes.** Elles viennent de `filePath`, `fileUrl`, `thumbnailPath`, `thumbnailUrl`, `imageVariants`, `avifVariants`, `renditions` et `translations` des pièces jointes ET des médias de post, ainsi que de `Sound.fileUrl` et `coverUrl` (audit D4). Une adresse `/api/v1/attachments/file/…` se lit comme une adresse avant de se lire comme un chemin : lue comme chemin absolu, elle tombait hors de la racine, et toute clé portée par la seule URL échappait au miroir et au balayage.
5. **Lecture rétrocompatible.** Les quatre routes de fichiers (par identifiant, vignette, par chemin, adresse signée) lisent le disque d'abord, puis le seau. Les URL sont inchangées. Les plages, l'ETag (celui du seau) et le 304 fonctionnent comme avant, et les gardes s'appliquent **avant** toute lecture.
   - La route par chemin ne consulte le seau que pour une clé **qu'une pièce jointe vivante porte** (verdict `serve`). Une clé sans porteur ne ressuscite jamais.
   - **Le flux s'ouvre avant que la réponse ne soit décrite** (audit D1). Un objet effacé entre le HEAD et le GET rend 404. Un seau qui ne répond pas rend 503 `no-store`, sans ETag, sans cache et sans nom de fichier.
6. **Le balayage reste le filet.** Une fois par heure dans le miroir continu, ou par `--sweep`, il retire du seau ce qu'aucune ligne vivante ne nomme plus, au-delà d'une grâce de 24 h.
   - Le seau se parcourt **en flux**, en deux passes : la première compte et décide, la seconde efface. Seules les clés vivantes de la base restent en mémoire (audit D5).
   - **Il échoue fermé** : une collecte incomplète arrête tout ; une base qui ne nomme rien fait refuser ; plus de la moitié du seau à effacer fait refuser aussi.
   - **Un refus se voit** (audit D2) : un journal `warn` et la jauge `media_bucket_sweep_refused{reason}`. `media_bucket_sweep_last_success_timestamp_seconds` date le dernier balayage abouti. La sortie documentée du refus « plus de la moitié » est `--sweep --apply --allow-mass-removal`, sous le même régime de feu vert.
7. **Le seau de staging vit dans une SURCOUCHE**, `docker-compose.staging.media-s3.yml`, incluse par `-f` (audit D3).
   - Mesuré (Compose v5.6) : `${VAR:?}` est évalué sur tout le fichier, profils inactifs compris. Dans le compose principal, il casserait tout le staging tant que les identifiants ne sont pas posés. Dans la surcouche, il refuse le démarrage sans eux : MinIO, à identifiants vides, prendrait `minioadmin`.
   - Le seau n'a ni port ni Traefik, et seul le réseau du staging le joint. Ce réseau est un bridge ordinaire, sans `internal: true` (contre-audit C6) : ce qui protège le seau, ce sont ses identifiants obligatoires et l'absence de politique anonyme, pas la topologie. La console est éteinte.
   - L'initialisation crée une politique limitée à CE seau (Get/Put/Delete sur ses objets, List sur lui) et le **compte de service** de la passerelle. Elle refuse un compte de service égal à l'administrateur, et la passerelle n'a jamais les identifiants de l'administrateur.
   - Garde : `media-bucket-never-public.test.ts`, prouvée rouge sous trois mutations. La production n'a pas de seau.
8. **Images.** MinIO ne publie plus d'image communautaire depuis le 2025-10-23, et ses mainteneurs ont décliné de corriger CVE-2025-62506. Le staging prend donc la construction Chainguard (`cgr.dev/chainguard/minio`, `minio-client:latest-dev`), **épinglée par empreinte**, que l'opérateur fournit (`MEDIA_S3_IMAGE_DIGEST`, `MEDIA_S3_CLIENT_IMAGE_DIGEST`, lues par `docker buildx imagetools inspect`). Le registre n'est pas joignable depuis la session qui a écrit ce lot, et aucune empreinte n'a été inventée. MinIO est sous AGPLv3, utilisé sans modification comme service séparé. Le code ne parle que S3.

### Configuration

- **Passerelle.** `MEDIA_S3_MIRROR=on` arme le magasin, l'effacement synchrone et le miroir. Requis : `MEDIA_S3_ENDPOINT`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY_ID` et `MEDIA_S3_SECRET_ACCESS_KEY` (le compte de service). Facultatifs : `MEDIA_S3_REGION`, `MEDIA_S3_FORCE_PATH_STYLE`, `MEDIA_MIRROR_INTERVAL_MS` (défaut 60 s ; à blanc, une passe par jour). Une configuration incomplète retombe sur le disque seul, en le journalisant.
- **Surcouche.** Elle demande en plus `MEDIA_S3_ROOT_USER`, `MEDIA_S3_ROOT_PASSWORD` et les deux empreintes. La marche à suivre est dans `.env.staging.template`.

### Conséquences

- Performance : argumentée, non mesurée.
  - Un fichier présent sur le disque coûte ce qu'il coûtait.
  - Avec un seau configuré, un fichier absent du disque coûte une requête de verdict, puis un `HEAD` et un `GET` S3 sur le réseau du staging. **Toute sonde 404 par chemin coûte donc aussi une requête de verdict en base** (audit D8). Sans seau, rien ne change (#9315).
  - Un effacement coûte un `DELETE` S3 de plus.
  - Le miroir coûte un `HEAD` par clé de la fenêtre de 24 h et par minute, plus une passe complète par jour.
- Restent ouverts :
  - la bascule synchrone des écrivains (#12359) ;
  - les médias de post servis depuis le seau, puis l'éviction du disque (#12360) ;
  - la sauvegarde hors site par `mc mirror` (#12361) ;
  - un seul miroir par flotte (#12362) ;
  - les familles non migrées : avatars (#12370), bannières (#12371), sons (#12372), stickers (#12373), packs (#12374).

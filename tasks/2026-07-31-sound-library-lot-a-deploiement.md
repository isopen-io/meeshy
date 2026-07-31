# Bibliothèque de sons — lot A : ce qui reste à la main

Ouvert le 2026-07-31, **réécrit après trois revues Fable 5**. La première version
donnait un ordre d'opérations qui pouvait casser la production : elle est
conservée nulle part, l'ordre ci-dessous la remplace.

Le code du lot A est commité et vert. Ce ticket ne couvre que ce qu'aucun agent
n'avait le droit de faire : écrire en base ou sur l'hôte de production.

---

## ⚠ Trois pièges à connaître AVANT de commencer

**1. Vous pousseriez sur votre base locale sans le savoir.** Le service
`database` n'expose aucun port en production, et `.env` comme
`services/gateway/.env` pointent `mongodb://localhost:27017`. Lancer
`prisma db push` ou `mongosh` depuis un poste de travail cible **votre base
locale**, affiche « succès », et laisse la production intacte. Toutes les
commandes de ce ticket s'exécutent **sur l'hôte de production, dans le réseau
Docker** (`docker exec meeshy-database …`, ou un conteneur one-off sur
`meeshy-network`).

**2. L'ordre code → index n'est pas négociable.** L'ancienne image crée des
`Sound` **sans** `contentHash`. Poser `@@unique([uploaderId, contentHash])`
pendant qu'elle tourne fait renvoyer **500 au deuxième upload de chaque
utilisateur**. Le code neuf, lui, tourne sans dommage contre une base non
poussée (MongoDB crée les collections à la volée ; seule la garantie
anti-doublon manque). Donc : **code d'abord, index ensuite.**

**3. Le script de migration ne débloque PAS le `E11000`.** Il ne touche que
`mutedAt` ; le conflit d'index vient de `contentHash` absent. Muter un document
ne le retire pas de l'index. C'est l'étape 4 ci-dessous qui débloque, pas le
script.

---

## Ordre d'exécution

### Étape 1 — Sauver les fichiers hérités (avant toute recréation de conteneur)

**Point de non-retour : recréer le conteneur gateway détruit
`/tmp/meeshy-uploads` définitivement.** Les fichiers y vivent encore aujourd'hui,
et leurs `fileUrl` (`/api/v1/static/<nom>`) resteront servis depuis le nouveau
`UPLOAD_DIR` s'ils y sont copiés — la disponibilité est donc récupérable, mais
seulement maintenant.

```bash
docker cp meeshy-gateway:/tmp/meeshy-uploads ./sounds-rescue
cp /opt/meeshy/production/docker-compose.yml /opt/meeshy/production/docker-compose.yml.bak
```

### Étape 2 — Patcher le compose déployé

`/opt/meeshy/production/docker-compose.yml` **diverge** du repo (conteneurs
`meeshy-*`, images `isopen/*`) : le patch du repo ne l'atteint pas. Reporter sur
le service gateway :

```yaml
      - UPLOAD_DIR=/app/sounds
      - SOUND_LIBRARY_ENABLED=false
```
```yaml
      - gateway_sounds:/app/sounds
```

et déclarer le volume nommé `gateway_sounds`. **Ne pas** le monter dans nginx :
`static-files` sert son root sans authentification, en cache immutable un an.

Puis pré-remplir le volume avec les fichiers sauvés à l'étape 1.

> Le déploiement n'est **pas** « à vide » malgré le drapeau fermé : la route
> d'upload manuel, la liste publique et `/static` sont actives immédiatement, et
> le répertoire d'écriture des uploads change dès cette étape. D'où l'urgence.

### Étape 3 — Déployer la nouvelle image gateway

`docker compose up -d gateway`, puis vérifier `/health`. La nouvelle image écrit
`contentHash` sur ses **deux** chemins de création — c'est ce qui rend l'étape 5
possible.

### Étape 4 — Diagnostiquer et débloquer l'index unique

Le bon test n'est **pas** `countDocuments` : la condition est « au moins deux
documents **du même uploadeur** sans `contentHash` ».

```bash
docker exec meeshy-database mongosh "$PROD_DB" --quiet --eval '
  db.StoryBackgroundAudio.aggregate([
    { $match: { contentHash: { $exists: false } } },
    { $group: { _id: "$uploaderId", n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } }
  ]).toArray()'
```

Vide → passer à l'étape 5. Sinon, backfiller des valeurs **distinctes** avant de
poser l'index (par exemple dérivées de `_id`, qui est unique par construction) :

```javascript
db.StoryBackgroundAudio.find({ contentHash: { $exists: false } }).forEach(d =>
  db.StoryBackgroundAudio.updateOne({ _id: d._id },
    { $set: { contentHash: "legacy-" + d._id.toString() } }));
```

### Étape 5 — Pousser le schéma

```bash
cd packages/shared && bun install && bunx prisma db push --schema=./prisma/schema.prisma
```

`bun install` d'abord : `prisma/client` est gitignoré, et sans lui `bunx prisma`
téléchargerait la dernière version au lieu de la 6.19 épinglée.

Ce push pose **quatre** index sur `StoryBackgroundAudio` — dont
`@@index([fileUrl])`, ajouté après coup : `GET /static/:filename` vérifie
`mutedAt` par égalité sur `fileUrl` à chaque lecture audio, et sans l'index
chaque écoute scanne la collection.

`DATABASE_URL` doit être **explicitement** celui de production, jamais celui du
shell ambiant (voir piège 1).

Le faire **vite après l'étape 3** : chaque jour d'attente laisse un double upload
manuel identique recréer un doublon qui rebloquerait le push.

> **Point de non-retour : l'index posé, l'ancienne image ne doit plus jamais
> être redéployée** — ses écritures sans hash produiraient des 500.
> Un échec en cours peut laisser un état partiel (index `SoundUsage` créés,
> unique `Sound` refusé) : inoffensif, on relance après correction.

### Étape 6 — Neutraliser les entrées dont le fichier a vraiment disparu

Seulement si l'étape 4 a trouvé des entrées héritées.

```bash
cd services/gateway
LEGACY_UPLOAD_DIR=./sounds-rescue bunx tsx scripts/migrate-sound-library.ts           # à blanc
LEGACY_UPLOAD_DIR=./sounds-rescue bunx tsx scripts/migrate-sound-library.ts --apply
```

`LEGACY_UPLOAD_DIR` pointe le répertoire de sauvetage de l'étape 1 : sans lui, le
script scrute un volume neuf et vide, déclare **100 %** des fichiers manquants et
couperait des sons parfaitement valides.

**Conserver la sortie** : c'est la seule liste d'identifiants permettant
d'annuler — le script n'a pas de mode revert.

### Étape 7 — Ouvrir le drapeau : pas maintenant

`SOUND_LIBRARY_ENABLED` reste à `false` jusqu'à ce que **tout** ceci soit vrai :
le lot B livré (sans lui, la réinjection serveur du `soundId` n'existe pas), la
dette bloquante purgée (faite — voir plus bas) vérifiée en staging, et un canary
défini.

Noter que **staging n'est couvert par rien** : `docker-compose.staging.yml` n'a
ni `UPLOAD_DIR`, ni volume sons, ni drapeau — la nouvelle image y écrira dans un
`/app/sounds` éphémère, reproduisant la panne que ce lot corrige. À patcher de la
même façon.

---

## Corrigé depuis la revue (commit de suivi)

Deux bloquants trouvés par la revue comportementale, tous deux dans
`updatePost`, tous deux corrigés :

- **Une édition partielle détruisait les liens.** `UpdatePostSchema` a tous ses
  champs optionnels : un changement d'audience arrivait sans `storyEffects`, la
  capture recevait `tracks: []`, et tous les `SoundUsage` du post étaient
  supprimés alors que la story jouait toujours son audio. La capture n'est plus
  appelée quand le blob est absent.
- **La troisième porte du piège d'attribution.** `createPost` et `repostPost`
  étaient gardés, pas l'édition — or `repostPost` duplique les médias sous le
  reposteur, donc un PUT sur un repost passait le scope et créait un `Sound`
  crédité au reposteur avec l'audio d'autrui. Exploitable via API.

---

## Dette à reprendre — par gravité

### Corrections attendues avant l'ouverture du drapeau — **FAITES**

Les dix premiers points de la revue Fable sont traités. Détail dans le commit de
suivi ; l'essentiel ci-dessous, parce que les choix comptent plus que le diff.

1. ~~**`deletePost` ne purge aucun usage.**~~ `deletePost` appelle désormais
   `SoundCaptureService.releasePost`. Le `Sound`, lui, survit : c'est
   l'invariant d'indépendance.
2. ~~**`usageCount` n'a aucune réconciliation.**~~ Le décrément aveugle est
   remplacé par un **recomptage** depuis `SoundUsage` sur les sons touchés. Un
   crash en cours de purge ne laisse plus de dérive définitive : la même purge
   rejouée donne le même compteur. `scripts/reconcile-sound-usage.ts` (à blanc
   par défaut, `--apply` pour écrire) audite l'ensemble ; c'est une façade mince
   sur `reconcileUsageCounts`, pas une seconde implémentation.
3. ~~**`GET /static` fait un scan de collection.**~~ Égalité sur `fileUrl`
   reconstruite par `staticFileUrl`, plus `@@index([fileUrl])`. L'échec base est
   **fermé** — 503 explicite : `mutedAt` est un interrupteur DMCA, servir le
   fichier parce que la base n'a pas répondu diffuserait ce qu'un ayant droit a
   fait couper.
4. ~~**Aucun rate limit.**~~ 20/min sur l'upload, 60/min sur la liste, 240/min
   sur la diffusion (une story enchaîne plusieurs pistes).
5. ~~**Extensions incohérentes.**~~ `services/posts/soundFormats.ts` est la
   source unique ; la capture **refuse** ce qui n'est pas servable au lieu de
   créer un `Sound` mort-né. Un `.opus` déclaré `audio/ogg` passe (conteneur
   Ogg) ; un `audio/webm` est ignoré et journalisé.

### Tests à écrire — **FAITS**

6. ~~Emprunt légitime non couvert~~ → l'écriture de l'usage **et** l'absence de
   copie de fichier sont assertées ; le cas « son coupé » aussi.
7. ~~Payload de `sound.create` jamais inspecté~~ → payload asserté champ par
   champ, hash recalculé dans le test, présence du fichier vérifiée sur disque.
8. ~~`where` de `/sounds/mine` jamais asserté~~ → portée `uploaderId` + filtre
   `mutedAt`, curseur, et non-fuite de `contentHash` sur la liste.
9. ~~`extractCaptureTracks` sans test~~ → extrait en module pur
   (`services/posts/captureTracks.ts`), 10 tests dont la coercition refusée et
   la conversion secondes→millisecondes. L'égalité des deux SHA-256 est pinnée
   sur un fichier de 200 Kio — un petit fichier n'émet qu'un `data` et rendrait
   le test tautologique.
10. ~~`SOUND_LIBRARY_ENABLED` fuit entre fichiers~~ → capturé avant le premier
    `beforeEach`, restauré en `afterEach`.

**Deux trouvailles en écrivant ces tests**, absentes de la revue :

- `releasePosts` ne rattrapait pas ses erreurs : une panne de la bibliothèque
  aurait avorté le hard-delete des stories expirées elles-mêmes, qui se seraient
  accumulées sans limite. Corrigé, et couvert.
- `ExpiredStoriesCleanupService.sounds.test.ts` était une garde de **source**
  (`toContain('soundUsage.deleteMany')`) : elle a cassé au premier refactor
  légitime alors que le comportement était intact. Réécrite en test de
  comportement — elle couvre en prime le recomptage, invisible à une garde
  textuelle.

### Ouvert par la revue multi-prisme suivante (correction + sécurité + tests)

**Traité dans la foulée** — 22 (partiellement), 23, 24, 25, 26, 27, et la
totalité des trous de tests :

- Les six limites de débit ont désormais un `keyGenerator` **explicite** par
  utilisateur (`createSoundRouteRateLimitConfig`). Sans lui elles héritaient du
  global, clefé sur `request.ip` — l'IP de Traefik, la même pour tous : « 20/min »
  aurait voulu dire 20/min pour la plateforme entière.
- `skip` → `allowList` sur le limiteur global, **sans reprendre `isLocalIp`** :
  derrière Traefik cette clause aurait mis tout le monde en liste blanche et
  désactivé le rate limiting. Le renommage naïf était pire que le bug.
- `releasePosts` **rejette** de nouveau ; seul `releasePost` (action
  utilisateur) avale. `sweepOrphanUsages` rattrape ce que ce compromis laisse
  passer, et le script le lance AVANT le recomptage.
- La suppression de modération libère ses usages.
- Le fichier capturé porte un nom **opaque** : `<sha256>.<ext>` publiait le
  `contentHash` par `fileUrl`. Effet de bord voulu — deux uploadeurs au même
  contenu ont deux fichiers, donc couper l'un ne renvoie plus 410 à l'autre
  (ferme aussi le point 18).
- `POST /stories/audio` : plafond de 100 Mo (borne **mémoire**, pas de durée —
  la directive du 2026-07-30 l'interdit), extension validée contre les six
  servies, et ré-envoi identique devenu **idempotent** au lieu d'une 500.
- `GET /sounds/:id` teste la propriété AVANT `mutedAt` : l'ordre inverse laissait
  énumérer les sons modérés d'autrui.
- Tests : la composition `PostService → SoundCaptureService` est enfin
  **exécutée** (`tracks: []` passait inaperçu), `reconcileUsageCounts` et
  `sweepOrphanUsages` sont couverts, le digest SHA-256 est **pinné** (la v1
  restait verte en MD5), quatre gardes de source contournables sont durcies, et
  les répertoires temporaires ne fuient plus (802 s'étaient accumulés).

**Restent ouverts, et le drapeau ne doit pas s'ouvrir avant :**

21. **Un média non lié peut être revendiqué par n'importe qui.** `createPost` et
    `updatePost` rattachent les médias par `{ id: { in: mediaIds }, postId: null }`
    — `PostMedia` n'a **aucun champ propriétaire**. La garde de scope de la
    capture (`postId: ctx.postId`) est donc satisfaite *après coup* : le média
    d'autrui devient celui de l'attaquant juste avant d'être haché et crédité.
    Les ObjectId voisins ne diffèrent que d'un compteur, et les uploads
    abandonnés restent `postId: null` pendant 24 h — la fenêtre n'est pas une
    course de quelques secondes. **Dépasse la bibliothèque de sons** : c'est une
    primitive de vol de média valable pour tout le pipeline. Correctif propre =
    un champ propriétaire sur `PostMedia` + backfill.
22. **`trustProxy` n'est pas posé, et ça dépasse la bibliothèque de sons.**
    `request.ip` reste l'adresse de Traefik pour tout le gateway : le quota
    global de 300 req/min est un seul seau pour la plateforme, et toute
    journalisation par IP est fausse. Le poser change la sémantique partout et
    permet le spoof de `X-Forwarded-For` si le gateway est joignable directement
    sur le réseau Docker — décision à prendre à part, avec la liste des proxies
    de confiance.
23. **`/static` n'applique aucune autorisation** — ni `isPublic`, ni propriété,
    seulement `mutedAt`. Le nom opaque rend le fichier non devinable, ce qui est
    une atténuation, pas un contrôle d'accès. À trancher avec la question du
    crédit (point 11).
24. **La coupure DMCA n'est PAS effective**, et le 503 en échec fermé ne doit pas
    faire croire l'inverse : un son capturé est une copie du `PostMedia` source,
    lequel reste servi par `GET /attachments/file/*` (**sans authentification**)
    et par nginx sur `static.<domaine>` en cache immutable un an. Couper le son
    ferme une porte sur trois. Le retrait réel suppose de traiter le média
    source.
25. **Le recomptage a remplacé un écrit atomique par un lire-puis-écrire.** Un
    `create` concurrent entre le `count()` et l'`update` est perdu. Rattrapable
    par le script, contrairement à ce que la libération avalée produisait.
26. **Course création/suppression immédiate** : `createPost` lance la capture en
    fire-and-forget alors que `deletePost` attend la libération. Créer puis
    supprimer aussitôt peut écrire l'usage après la libération. Fenêtre étroite,
    rattrapée par `sweepOrphanUsages`.
27. **`usageCount` compte les PISTES, pas les posts.** 32 pistes pointant le même
    son dans un seul post comptent 32. Décision sémantique à trancher : « utilisé
    par N posts » est probablement ce qu'on veut afficher et trier.
28. **Trous de tests restants** : le chemin nominal de `POST /stories/audio`
    (upload réel, 413, extension refusée, idempotence) et de `PATCH /sounds/:id`
    ne sont pas couverts ; `sourceLanguage` n'est jamais exercé non nul.

### Décisions produit à trancher par écrit

11. **Le crédit est promis et impossible.** Le schéma dit « le crédit se résout à
    la lecture via `uploader` » — mais le lot a retiré les `include: { uploader }`
    et `toDTO` n'expose aucun auteur. La liste publique affichera N entrées
    identiques « Son original », sans auteur.
12. **« Son original » est du français gravé en base**, qui ressortira tel quel
    dans les sept langues. Le titre devrait être une clé résolue côté client.
13. **Passage du post source en privé** : le `Sound` reste public. Choix
    délibéré (sémantique TikTok) ou trou ? À écrire.
14. **Le propriétaire d'un son coupé est aveugle** : `/sounds/mine` filtre
    `mutedAt: null` et `GET /:id` lui renvoie 410. Pour un mécanisme DMCA,
    l'intéressé doit voir que son son est coupé.
15. **`/app/sounds` n'a ni quota ni ramasse-miettes.** Le rate limit borne le
    débit, pas le volume cumulé : les fichiers des sons coupés ne sont jamais
    supprimés. À concevoir — la variante inverse (nettoyage d'orphelins trop
    zélé) a déjà détruit des médias ici.
16. **Curseur sans clé de départage** : `orderBy: createdAt` seul sur un champ
    non unique saute les lignes partageant le timestamp de la dernière page. La
    capture crée plusieurs sons dans la même milliseconde.
17. **`canonicalPostMediaId` pendouille après le hard-delete** : la purge
    supprime le `PostMedia` source, alors que le lot B doit résoudre par lui.
18. **Déni de service croisé** : les fichiers sont nommés par hash de contenu,
    donc deux uploadeurs au même contenu partagent le fichier ; couper l'un
    renvoie 410 à l'autre. Fail-closed, tolérable, à traiter avec
    `canonicalSoundId`.

### Hygiène d'historique

19. **`b8ad2d32b` mélange le WIP iOS d'une session parallèle** avec
    l'implémentation de la purge ; son test est seul dans le commit suivant.
    Historique à ne pas réécrire — le worktree est partagé.
20. **Les 65 cases du plan n'ont jamais été cochées** dans
    `docs/superpowers/plans/2026-07-30-bibliotheque-de-sons-lot-a-socle-serveur.md`.

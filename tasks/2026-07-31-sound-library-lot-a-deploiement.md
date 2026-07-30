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
le lot B livré (sans lui, la réinjection serveur du `soundId` n'existe pas), les
deux bloquants ci-dessous corrigés et vérifiés en staging, et un canary défini.

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

### Corrections attendues avant l'ouverture du drapeau

1. **`deletePost` ne purge aucun usage.** Une story supprimée par son auteur
   garde ses usages jusqu'au hard-delete (7 j) ; un post non-STORY les garde
   **pour toujours**. `usageCount` trie la découverte.
2. **`usageCount` n'a aucune réconciliation.** Trois écrivains, décréments
   best-effort avalés par des `.catch(() => undefined)`, purge non
   transactionnelle : un crash entre le `deleteMany` et la boucle laisse une
   dérive définitive. Il faut un job de recomptage depuis `SoundUsage`.
3. **`GET /static` fait un scan de collection par lecture audio.** `findFirst`
   sur `fileUrl endsWith`, suffixe non indexé, sans `try/catch` : une base
   indisponible transforme toute la diffusion audio en 500 — avant ce lot, cette
   route ne touchait pas la base. Chercher par `contentHash` avec un index
   dédié.
4. **`POST /stories/audio` n'a aucun rate limit** — la route la plus coûteuse du
   lot, qui écrit un fichier. `GET /stories/audio` et `GET /static` non plus.
5. **Extensions incohérentes** : la capture accepte tout `audio/*`, la diffusion
   ne sert que six extensions. Un média `.opus` ou `.webm` produit un `Sound`
   dont le `fileUrl` renverra 400 pour toujours.

### Tests à écrire

6. **Aucun test n'affirme qu'un emprunt légitime écrit son usage** — seul le
   refus est couvert. Un `recordBorrowed` qui rejetterait 100 % des `soundId`
   laisserait la suite verte.
7. **Le payload de `sound.create` n'est jamais inspecté** : `isPublic: false` en
   dur, `durationMs` en secondes, `contentHash` absent — tout passerait.
8. **Le `where` de `/sounds/mine` n'est jamais asserté** : retirer `uploaderId`
   ferait lister les sons de tout le monde, au vert.
9. **`extractCaptureTracks` n'a aucun test**, et l'égalité des deux
   implémentations SHA-256 (capture et upload manuel) n'est pinnée nulle part —
   c'est pourtant elle qui fait tenir l'index unique.
10. **`SoundCaptureService.test.ts` ne restaure pas `SOUND_LIBRARY_ENABLED`** :
    la valeur fuit vers les fichiers suivants du même worker Jest.

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
15. **`/app/sounds` n'a ni quota ni ramasse-miettes.** Upload sans limite,
    fichiers des sons coupés jamais supprimés. À concevoir — la variante inverse
    (nettoyage d'orphelins trop zélé) a déjà détruit des médias ici.
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

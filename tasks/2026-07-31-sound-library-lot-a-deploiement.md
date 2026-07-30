# Bibliothèque de sons — lot A : ce qui reste à la main avant déploiement

Ouvert le 2026-07-31. Le code du lot A est commité et vert (`tsc` muet, suites du lot au vert).
Ce ticket liste ce qu'aucun agent n'avait le droit de faire — toute écriture en
base ou sur l'hôte de production.

## 1. Pousser le schéma — BLOQUANT

```bash
cd packages/shared && bunx prisma db push --schema=./prisma/schema.prisma
```

Renomme le modèle vers `Sound` (la collection `StoryBackgroundAudio` ne bouge
pas, `@@map`), crée `SoundUsage`, et pose `@@unique([uploaderId, contentHash])`.

**Piège attendu** : MongoDB traite un champ absent comme `null` dans un index
unique. Si deux entrées héritées du même uploadeur n'ont pas de `contentHash`,
la création de l'index échoue en `E11000`. Compter d'abord :

```bash
mongosh "$DATABASE_URL" --quiet --eval 'db.StoryBackgroundAudio.countDocuments()'
```

**Si le compte vaut 0**, rien d'autre à faire et le point 2 disparaît.

## 2. Neutraliser les entrées héritées — seulement si le compte est non nul

```bash
cd services/gateway && bunx tsx scripts/migrate-sound-library.ts          # à blanc
cd services/gateway && bunx tsx scripts/migrate-sound-library.ts --apply  # après lecture
```

Les entrées héritées pointent des fichiers écrits sous `/tmp/meeshy-uploads`,
effacés à la première recréation de conteneur : le script pose `mutedAt` sur
celles dont le fichier a disparu.

## 3. Patcher le compose DÉPLOYÉ — BLOQUANT

`/opt/meeshy/production/docker-compose.yml` **diverge** du repo (conteneurs
`meeshy-*`, images `isopen/*`). Le patch du repo ne l'atteint pas.

Sauvegarder, puis reporter sur le service gateway :

```yaml
      - UPLOAD_DIR=/app/sounds
      - SOUND_LIBRARY_ENABLED=false
```
```yaml
      - gateway_sounds:/app/sounds
```
et déclarer le volume nommé `gateway_sounds`.

**Ne pas** le monter dans nginx : c'est ce montage qui rendrait les fichiers
publics, sans authentification et en cache immutable.

**Sans ce patch, le gateway de production écrira dans `/app/sounds` sans
volume** — exactement la perte de fichiers que le lot corrige.

## 4. Ouvrir le drapeau — après le lot B

`SOUND_LIBRARY_ENABLED=false` partout aujourd'hui : **aucune capture ne
tourne**, dans aucun environnement. C'est voulu — le socle se déploie et se
vérifie à vide.

Ne passer à `true` qu'une fois : le point 1 joué, le lot B livré (sans lui, la
réinjection serveur du `soundId` n'existe pas et une édition détruirait le lien
en base), et un canary défini.

## 5. Dette laissée par l'implémentation — à reprendre au lot B

- **Le câblage n'est vérifié que textuellement.** `SoundCaptureService` est
  injectable dans le constructeur de `PostService` ; aucun test n'exploite ce
  point pour prouver que `createPost` / `updatePost` appellent réellement la
  capture, ni avec quel `isPublic`, quel `postId`, quelles pistes.
- **`extractCaptureTracks` n'a aucun test.** C'est pourtant la seule traduction
  du blob client vers le modèle serveur : une clé fausse partirait au vert.
- **Deux commits sont mélangés.** `b8ad2d32b` emporte le WIP iOS d'une session
  parallèle avec l'implémentation de la purge des usages ; le commit suivant
  (`b092b743c`) ne contient donc que son test. Historique à ne pas réécrire —
  le worktree est partagé.
- **Les 65 cases du plan n'ont jamais été cochées** dans
  `docs/superpowers/plans/2026-07-30-bibliotheque-de-sons-lot-a-socle-serveur.md`.
- **Déni de service croisé entre uploadeurs** : les fichiers sont nommés par
  hash de contenu, donc deux uploadeurs au même contenu partagent le fichier.
  Couper le son de l'un renvoie 410 à l'autre. Fail-closed, donc tolérable, mais
  à traiter avec `canonicalSoundId`.

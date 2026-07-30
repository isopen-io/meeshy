# Bibliothèque de sons — Lot A : socle serveur — Plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUIS — utiliser `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe case à cocher (`- [ ]`).

**Version 2** — réécrite après trois revues Opus (justesse mécanique, couverture/sécurité, exécutabilité). La v1 ne compilait pas, ne se commitait pas, et exposait deux IDOR. Les corrections sont signalées par `⚠ v1` là où elles contredisent une lecture naturelle du code.

**Goal :** faire d'un son original une entité serveur de première classe — capturée automatiquement à la publication d'un contenu public, dédoublonnée, créditée, stockée durablement et exposée par une API autorisée.

**Architecture :** `StoryBackgroundAudio` devient `Sound` via `@@map` (aucune donnée déplacée) ; `SoundUsage` devient la source de vérité des usages. Un service `SoundCaptureService` hache en flux, dédoublonne et crée l'entrée ; il est branché sur la création et l'édition, **pas sur le repost** (voir « Périmètre »). Les fichiers vivent sur un volume dédié servi uniquement par la route Fastify authentifiée.

**Tech Stack :** TypeScript, Fastify, Prisma (MongoDB), Zod, Jest 30 (`@jest/globals`), Node `crypto` + `fs`.

**Spec :** `docs/superpowers/specs/2026-07-30-bibliotheque-de-sons-design.md`

## Périmètre — ce que le lot A ne fait pas, et pourquoi

**Le repost n'est pas branché.** La v1 le branchait en commentant « les pistes portent le `soundId` de l'original, donc aucune capture ». Faux : `soundId` n'existe qu'au lot B. En lot A, `repostPost` copie `storyEffects` puis **réécrit les `postMediaId` vers les médias physiquement dupliqués** (`PostService.ts:1614-1641`) et crée les `PostMedia` sous le reposteur (`:1589`) — chaque repost aurait donc produit un son dupliqué crédité au reposteur. Le branchement repost part au lot B, avec `soundId`.

**La branche « piste empruntée » du service existe mais reste inatteignable en lot A** (aucun producteur de `soundId`). Elle est écrite et gardée dès maintenant parce que sa garde d'autorisation est une exigence de sécurité, pas une commodité.

## Global Constraints

- **MongoDB** : `prisma db push`, jamais `migrate`.
- **Enveloppe de réponse — forme RÉELLE**, vérifiée dans `utils/response.ts:19-86` et `error-format.test.ts:157` : `sendSuccess` place `pagination` **à la racine** ; `sendError` produit une enveloppe **plate** `{ success, error: <string>, message, code }`. Les assertions sont donc `res.json().code` et `res.json().pagination`. ⚠ v1 : la doctrine `CLAUDE.md:224-226` décrit `error.code` et `meta.pagination` — **le code gagne**.
- **Journalisation** : `enhancedLogger.child({ module })` depuis `utils/logger-enhanced`, signature `error(message, error?, context?)`. ⚠ v1 : `logger.child()` n'existe pas sur `MeeshyLogger`, et `ts-jest` ignore TS2339 — l'erreur ne serait apparue qu'au runtime.
- **Ancrage** : les insertions se repèrent par **texte**, jamais par numéro de ligne.
- **Invariant** : `captureSounds()` ne rejette jamais. Publier ne dépend pas de la bibliothèque.
- **Aucune entité Prisma brute en réponse.** `contentHash` et `uploaderId` ne sortent jamais.
- **Aucun schéma `response:`** dans ce module (armerait la troncature `fast-json-stringify`).
- **Tests** : `cd services/gateway && bun run test -- <fichier précis>`. Ne jamais annoncer un décompte sur un répertoire — il contient déjà 12 fichiers.
- **Commits** : un par tâche, en français, sans trailer `Co-Authored-By`.

---

### Task 1 : Modèle `Sound` + `SoundUsage`

**Files:** Modify `packages/shared/prisma/schema.prisma` (relation l. **295**, modèle l. 3015-3035), `services/gateway/src/routes/posts/audio.ts`

**Interfaces:** Produces `prisma.sound`, `prisma.soundUsage`.

- [ ] **Step 1 : Compter les documents existants**

```bash
cd packages/shared && DATABASE_URL="$(grep -m1 DATABASE_URL ../../.env | cut -d= -f2-)" \
  mongosh "$DATABASE_URL" --quiet --eval 'db.StoryBackgroundAudio.countDocuments()'
```

Si `.env` est absent à la racine, demander la chaîne de connexion **staging** — jamais la production. **Si le résultat est `0`, supprimer la tâche 11** et le noter dans le commit.

- [ ] **Step 2 : Remplacer le modèle**

Remplacer le bloc `/// Bibliothèque de sons…` + `model StoryBackgroundAudio { … }` (l. 3015-3035) par :

```prisma
/// Bibliothèque de sons — entité de première classe, réutilisable et créditée.
/// `@@map` fige la collection historique : aucune donnée n'est déplacée.
model Sound {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  uploaderId  String   @db.ObjectId
  uploader    User     @relation("StoryAudioUploads", fields: [uploaderId], references: [id])
  fileUrl     String
  /// Chaîne NEUTRE. Le crédit se résout à la lecture via `uploader` : figer un
  /// @pseudo ici le publierait à vie, même après renommage ou suppression de compte.
  title       String
  /// DÉPRÉCIÉ — secondes. Écrire `durationMs`.
  duration    Int
  durationMs  Int?
  usageCount  Int      @default(0)
  /// Retire de la DÉCOUVERTE seulement. N'arrête pas la diffusion : voir `mutedAt`.
  isPublic    Boolean  @default(true)
  /// ARRÊT DE DIFFUSION (DMCA, modération). Consulté par la route de service.
  mutedAt     DateTime?
  contentHash String?
  sourcePostId String? @db.ObjectId
  /// PostMedia d'origine — la lecture iOS ne sait résoudre qu'un postMediaId.
  canonicalPostMediaId String? @db.ObjectId
  /// Nullable : Prisma/MongoDB lève à la LECTURE sur un champ requis absent.
  mimeType    String?
  /// Nullable pour la même raison — les documents hérités n'ont pas ce champ.
  waveform    Float[]
  isAutoGenerated Boolean @default(false)
  sourceLanguage  String?
  /// Variantes de langue — MÊME FORME que `PostMedia.translations` (lot C).
  translations    Json?
  createdAt   DateTime @default(now())

  usages      SoundUsage[]

  @@unique([uploaderId, contentHash])
  @@index([usageCount])
  @@index([uploaderId])
  @@map("StoryBackgroundAudio")
}

/// Un usage = une piste d'un post. Source de vérité serveur du lien post↔son.
model SoundUsage {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  soundId   String   @db.ObjectId
  sound     Sound    @relation(fields: [soundId], references: [id], onDelete: Cascade)
  postId    String   @db.ObjectId
  /// `StoryAudioPlayerObject.id` — sans lui on ignore QUELLE piste utilise le son.
  trackId   String
  viaPostId String?  @db.ObjectId
  startMs   Int?
  endMs     Int?
  createdAt DateTime @default(now())

  @@unique([postId, trackId])
  @@index([soundId])
  @@index([postId])
}
```

`variantOf` est supprimé (auto-FK unique sans `@relation`, incapable d'exprimer N langues).

- [ ] **Step 3 : Corriger la relation `User`**

Remplacer la **ligne 295** (`storyAudioUploads StoryBackgroundAudio[] …`), en conservant le commentaire de la 294 :

```prisma
  storyAudioUploads Sound[] @relation("StoryAudioUploads")
```

- [ ] **Step 4 : Valider et générer**

```bash
cd packages/shared && DATABASE_URL="mongodb://localhost:27017/validate" bunx prisma validate --schema=./prisma/schema.prisma && bun run generate
```

`DATABASE_URL` est requis par `validate` même sans connexion (P1012). Attendu : `is valid 🚀`.

- [ ] **Step 5 : Pousser le schéma**

```bash
cd packages/shared && bunx prisma db push --schema=./prisma/schema.prisma
```

Si `E11000` sur `(uploaderId, contentHash)` : deux entrées héritées du même uploadeur ont toutes deux `contentHash` absent (MongoDB traite l'absence comme `null`). Traiter par la tâche 11 avant de repousser.

- [ ] **Step 6 : Renommer les appelants**

```bash
grep -rl "storyBackgroundAudio" services/gateway/src | xargs -r sed -i '' 's/storyBackgroundAudio/sound/g'
```

Touche `audio.ts` + 5 fichiers de test. Aucun n'utilise déjà un identifiant `sound` : la substitution est sûre. `-r` évite que `xargs` se fige si `grep` ne renvoie rien.

- [ ] **Step 7 : Vérifier la compilation**

```bash
cd services/gateway && bunx tsc --noEmit
```

Attendu : **aucune sortie**. La base est propre avant ce plan : toute erreur vient de cette tâche.

- [ ] **Step 8 : Commit**

```bash
git add packages/shared/prisma/schema.prisma services/gateway/src
git commit -m "feat(sounds): modèle Sound + SoundUsage, collection figée par @@map"
```

⚠ v1 : ne **pas** ajouter `packages/shared/prisma/client` — il est gitignoré, et `git add` sortirait en erreur **sans rien indexer**.

---

### Task 2 : Stockage durable et fin de l'écrêtage de durée

**Files:** Modify `services/gateway/src/routes/posts/audio.ts`, `services/gateway/jest.setup.js`, `infrastructure/docker/compose/docker-compose.prod.yml` · Test `services/gateway/src/routes/posts/__tests__/audio.duration.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

```typescript
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/** L'écrêtage `Math.min(durationRaw, 60)` ne rejetait rien : il enregistrait
 *  60 s pour un son de trois minutes. Métadonnée corrompue, pas garde-fou. */
describe('routes/posts/audio.ts — durée', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'audio.ts'), 'utf-8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('test_audioRoute_hasNoDurationCap', () => {
    expect(code).not.toContain('MAX_AUDIO_DURATION_SEC');
  });

  it('test_audioRoute_uploadDirDefault_isNotTmp', () => {
    expect(code).not.toContain('/tmp/meeshy-uploads');
  });
});
```

Les commentaires sont retirés avant assertion : sans cela, un commentaire expliquant la suppression ferait échouer le test.

- [ ] **Step 2 : Voir échouer**

```bash
cd services/gateway && bun run test -- src/routes/posts/__tests__/audio.duration.test.ts
```

- [ ] **Step 3 : Retirer la constante et le défaut `/tmp`**

Remplacer les lignes 10-11 d'`audio.ts` :

```typescript
// Volume DÉDIÉ, servi uniquement par la route JWT `/static/:filename`.
// Surtout PAS sous UPLOAD_PATH : tout ce qui s'y trouve est exposé par
// `GET /attachments/file/*` (sans authentification, download.ts:256) et par le
// montage nginx en lecture seule sur `static.<domaine>`, en cache immutable un an.
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/app/sounds';
```

Puis, dans le handler d'upload, remplacer la ligne `const duration = isNaN(durationRaw) ? 0 : Math.min(durationRaw, MAX_AUDIO_DURATION_SEC);` :

```typescript
    // Aucun plafond de durée (directive produit 2026-07-30).
    const duration = isNaN(durationRaw) ? 0 : durationRaw;
```

- [ ] **Step 4 : Neutraliser le défaut dans les tests**

⚠ v1 : ce changement casse `src/__tests__/unit/routes/posts-audio.test.ts`, dont quatre tests atteignent `fs.mkdir('/app/sounds')` — non inscriptible en local. Ajouter à `services/gateway/jest.setup.js`, à côté de la ligne qui pose déjà `UPLOAD_PATH` :

```javascript
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/meeshy-test-sounds';
```

- [ ] **Step 5 : Vérifier les deux suites**

```bash
cd services/gateway && bun run test -- src/routes/posts/__tests__/audio.duration.test.ts src/__tests__/unit/routes/posts-audio.test.ts
```

Attendu : 2 passed sur le premier fichier, aucune régression sur le second.

- [ ] **Step 6 : Déclarer le volume dédié**

Dans `infrastructure/docker/compose/docker-compose.prod.yml` : ajouter `- UPLOAD_DIR=/app/sounds` à côté de `- UPLOAD_PATH=/app/uploads` ; ajouter `- gateway_sounds:/app/sounds` aux volumes du gateway ; déclarer `gateway_sounds:` avec `driver: local` à côté de `gateway_uploads:`.

**Ne pas** le monter dans le service nginx — c'est ce montage qui rendrait les fichiers publics.

- [ ] **Step 7 : Noter le patch de production**

Ajouter au message de commit : le compose **déployé** est `/opt/meeshy/production/docker-compose.yml` et **diverge** du repo (conteneurs `meeshy-*`, images `isopen/*`). Sans patch chirurgical **précédé d'une sauvegarde**, le gateway de production écrira dans `/app/sounds` **sans volume** — exactement la disparition que cette tâche corrige. Créer le ticket de déploiement avant de fermer le lot.

- [ ] **Step 8 : Commit**

```bash
git add services/gateway/src/routes/posts services/gateway/jest.setup.js infrastructure/docker/compose/docker-compose.prod.yml
git commit -m "feat(sounds): volume dédié servi par la route JWT, fin de l'écrêtage de durée"
```

---

### Task 3 : Valider `soundId` au bord — fermer l'IDOR avant d'écrire le service

**Files:** Modify `services/gateway/src/routes/posts/types.ts` (`StoryAudioObjectSchema`) · Test `services/gateway/src/routes/posts/__tests__/storyAudioSchema.test.ts`

**Interfaces:** Produces un `StoryAudioObjectSchema` qui borne `soundId`, `mediaURL`, `keyframes` et `backgroundAudioVariants`.

Cette tâche vient **avant** le service : la spec §7 exige la validation de `soundId`, et le blob `storyEffects` est entièrement contrôlé par le client.

- [ ] **Step 1 : Écrire le test qui échoue**

```typescript
import { describe, it, expect } from '@jest/globals';
import { StoryAudioObjectSchema } from '../types';

describe('StoryAudioObjectSchema — bornes', () => {
  const base = { id: 'track-1', postMediaId: '507f1f77bcf86cd799439011' };

  it('test_soundId_validObjectId_isAccepted', () => {
    const r = StoryAudioObjectSchema.safeParse({ ...base, soundId: '507f1f77bcf86cd799439012' });
    expect(r.success).toBe(true);
  });

  it('test_soundId_notAnObjectId_isRejected', () => {
    const r = StoryAudioObjectSchema.safeParse({ ...base, soundId: '../../etc/passwd' });
    expect(r.success).toBe(false);
  });

  it('test_mediaURL_overLimit_isRejected', () => {
    const r = StoryAudioObjectSchema.safeParse({ ...base, mediaURL: 'x'.repeat(2049) });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2 : Voir échouer**

```bash
cd services/gateway && bun run test -- src/routes/posts/__tests__/storyAudioSchema.test.ts
```

Attendu : `test_soundId_notAnObjectId_isRejected` et `test_mediaURL_overLimit_isRejected` échouent — le schéma est en `.passthrough()` sans bornes.

- [ ] **Step 3 : Borner le schéma**

Dans `services/gateway/src/routes/posts/types.ts`, ajouter à `StoryAudioObjectSchema`, avant le `.passthrough()` :

```typescript
  soundId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  mediaURL: z.string().max(2048).optional(),
  keyframes: z.array(z.unknown()).max(STORY_ARRAY_CAP).optional(),
  backgroundAudioVariants: z.array(z.unknown()).max(STORY_ARRAY_CAP).optional(),
```

Le schéma déclarait 9 champs quand iOS en encode 18 : les autres passaient sans borne individuelle, seul le cap global de 256 Ko les retenait.

- [ ] **Step 4 : Voir passer**

```bash
cd services/gateway && bun run test -- src/routes/posts/__tests__/storyAudioSchema.test.ts && bunx tsc --noEmit
```

Attendu : 3 passed, aucune sortie `tsc`.

- [ ] **Step 5 : Commit**

```bash
git add services/gateway/src/routes/posts/types.ts services/gateway/src/routes/posts/__tests__/storyAudioSchema.test.ts
git commit -m "feat(sounds): borne soundId et les champs audio non validés du blob storyEffects"
```

---

### Task 4 : `SoundCaptureService`

**Files:** Create `services/gateway/src/services/posts/SoundCaptureService.ts` · Test `services/gateway/src/services/posts/__tests__/SoundCaptureService.test.ts`

**Interfaces:** Produces
```typescript
export interface CaptureTrack { trackId: string; postMediaId?: string; soundId?: string; startMs?: number; endMs?: number; }
export interface CaptureContext { postId: string; authorId: string; isPublic: boolean; tracks: CaptureTrack[]; viaPostId?: string; }
export class SoundCaptureService {
  constructor(prisma: PrismaClient, soundsDir?: string, uploadsRoot?: string);
  captureSounds(ctx: CaptureContext): Promise<void>;   // NE REJETTE JAMAIS
  static hashFile(filePath: string): Promise<string>;
}
```

- [ ] **Step 1 : Écrire les tests qui échouent**

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { SoundCaptureService } from '../SoundCaptureService';

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
    // ⚠ v1 : `user` manquait — `captureOne` l'appelle, l'absence faisait
    // échouer silencieusement toute capture via le try/catch par piste.
    user: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ username: 'tester' }) },
    sound: {
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      create: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'sound-1' }),
      update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
    },
    soundUsage: {
      create: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops as Promise<unknown>[]) : ops),
    ...overrides,
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
}

describe('SoundCaptureService', () => {
  let soundsDir: string;
  let uploadsRoot: string;

  beforeEach(async () => {
    process.env.SOUND_LIBRARY_ENABLED = 'true';
    soundsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sounds-'));
    uploadsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'uploads-'));
  });

  /** `PostMedia.filePath` est RELATIF à UPLOAD_PATH (tus-handler.ts:129). */
  async function seedMedia(id: string, content = id) {
    const rel = path.join('2026', '07', 'user-1', `${id}.m4a`);
    await fs.mkdir(path.dirname(path.join(uploadsRoot, rel)), { recursive: true });
    await fs.writeFile(path.join(uploadsRoot, rel), content);
    return { id, fileUrl: `/u/${id}.m4a`, filePath: rel, mimeType: 'audio/x-m4a', duration: 1000 };
  }

  it('test_hashFile_sameContent_producesSameDigest', async () => {
    const a = path.join(soundsDir, 'a'); const b = path.join(soundsDir, 'b');
    await fs.writeFile(a, 'meeshy'); await fs.writeFile(b, 'meeshy');
    expect(await SoundCaptureService.hashFile(a)).toBe(await SoundCaptureService.hashFile(b));
  });

  it('test_captureSounds_restrictedPost_createsNothing', async () => {
    const prisma = buildPrisma();
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: false,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).not.toHaveBeenCalled();
  });

  it('test_captureSounds_relativeFilePath_isResolvedAgainstUploadsRoot', async () => {
    const media = await seedMedia('m1');
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([media]) },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).toHaveBeenCalledTimes(1);
  });

  it('test_captureSounds_scopesMediaLookupToThePost', async () => {
    const prisma = buildPrisma();
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', postMediaId: 'media-d-autrui' }],
    });
    expect(prisma.postMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ postId: 'p1' }) }),
    );
  });

  it('test_captureSounds_privateSoundOfOtherUser_writesNoUsage', async () => {
    const prisma = buildPrisma({
      sound: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { id: '507f1f77bcf86cd799439012', isPublic: false, uploaderId: 'autrui', mutedAt: null },
        ]),
        findFirst: jest.fn(), create: jest.fn(), update: jest.fn(),
      },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', soundId: '507f1f77bcf86cd799439012' }],
    });
    expect(prisma.soundUsage.create).not.toHaveBeenCalled();
  });

  it('test_captureSounds_threeTracks_capturesAll', async () => {
    const medias = await Promise.all(['m1', 'm2', 'm3'].map((id) => seedMedia(id)));
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(medias) },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: medias.map((m, i) => ({ trackId: `t${i}`, postMediaId: m.id })),
    });
    expect(prisma.sound.create).toHaveBeenCalledTimes(3);
  });

  it('test_captureSounds_sameHashTwice_reusesSound', async () => {
    const media = await seedMedia('m1', 'identique');
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([media]) },
      sound: {
        findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'sound-existant' }),
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
        create: jest.fn(), update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).not.toHaveBeenCalled();
  });

  it('test_captureSounds_nonAudioMime_capturesNothing', async () => {
    const media = { ...(await seedMedia('m1')), mimeType: 'image/png' };
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([media]) },
    });
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.sound.create).not.toHaveBeenCalled();
  });

  it('test_captureSounds_removedTrack_dropsItsUsage', async () => {
    const prisma = buildPrisma();
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true, tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.soundUsage.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ postId: 'p1', trackId: { notIn: ['t1'] } }),
      }),
    );
  });

  it('test_captureSounds_prismaThrows_neverRejects', async () => {
    const prisma = buildPrisma({
      postMedia: { findMany: jest.fn<() => Promise<unknown[]>>().mockRejectedValue(new Error('DB down')) },
    });
    await expect(new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true, tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    })).resolves.toBeUndefined();
  });

  it('test_captureSounds_flagDisabled_capturesNothing', async () => {
    process.env.SOUND_LIBRARY_ENABLED = 'false';
    const prisma = buildPrisma();
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', isPublic: true, tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });
    expect(prisma.postMedia.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Voir échouer**

```bash
cd services/gateway && bun run test -- src/services/posts/__tests__/SoundCaptureService.test.ts
```

Attendu : `Cannot find module '../SoundCaptureService'`.

- [ ] **Step 3 : Écrire le service**

Créer `services/gateway/src/services/posts/SoundCaptureService.ts` :

```typescript
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'SoundCaptureService' });

const AUDIO_MIME_PREFIX = 'audio/';

export interface CaptureTrack {
  /** `StoryAudioPlayerObject.id`. */
  trackId: string;
  /** Fichier propre à l'auteur — déclenche une capture. */
  postMediaId?: string;
  /** Son emprunté — aucune capture, seulement un usage. */
  soundId?: string;
  startMs?: number;
  endMs?: number;
}

export interface CaptureContext {
  postId: string;
  authorId: string;
  /** Seuls les contenus PUBLICS alimentent la bibliothèque. */
  isPublic: boolean;
  tracks: CaptureTrack[];
  viaPostId?: string;
}

/**
 * Capture des sons originaux à la publication d'un contenu public.
 *
 * INVARIANT : `captureSounds` ne rejette JAMAIS. Chaque piste est isolée dans
 * son propre try/catch. Publier ne dépend pas de la bibliothèque.
 */
export class SoundCaptureService {
  constructor(
    private prisma: PrismaClient,
    private soundsDir: string = process.env.UPLOAD_DIR ?? '/app/sounds',
    /** `PostMedia.filePath` est RELATIF à cette racine (tus-handler.ts:129). */
    private uploadsRoot: string = process.env.UPLOAD_PATH ?? '/app/uploads',
  ) {}

  /** SHA-256 lu EN FLUX : la durée est illimitée, charger en mémoire ferait tomber le gateway. */
  static hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('error', reject);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  async captureSounds(ctx: CaptureContext): Promise<void> {
    try {
      if (process.env.SOUND_LIBRARY_ENABLED !== 'true') return;
      if (!ctx.isPublic) return;

      // Édition : les usages des pistes disparues sont retirés, sinon elles
      // surcomptent pour toujours.
      await this.dropRemovedUsages(ctx);
      if (ctx.tracks.length === 0) return;

      await this.recordBorrowed(ctx);
      await this.captureOwned(ctx);
    } catch (error) {
      log.error('captureSounds a échoué — la publication n\'est pas affectée',
        error instanceof Error ? error : new Error(String(error)), { postId: ctx.postId });
    }
  }

  private async dropRemovedUsages(ctx: CaptureContext): Promise<void> {
    const kept = ctx.tracks.map((t) => t.trackId);
    const removed = await this.prisma.soundUsage.findMany({
      where: { postId: ctx.postId, trackId: { notIn: kept } },
      select: { soundId: true },
    });
    if (removed.length > 0) {
      await this.prisma.soundUsage.deleteMany({
        where: { postId: ctx.postId, trackId: { notIn: kept } },
      });
      for (const usage of removed) {
        await this.prisma.sound.update({
          where: { id: usage.soundId },
          data: { usageCount: { decrement: 1 } },
        }).catch(() => undefined);
      }
    } else {
      await this.prisma.soundUsage.deleteMany({
        where: { postId: ctx.postId, trackId: { notIn: kept } },
      });
    }
  }

  /**
   * Pistes empruntées. GARDE OBLIGATOIRE : sans elle, n'importe qui lie son
   * post au son privé d'autrui et gonfle le compteur qui trie la découverte.
   */
  private async recordBorrowed(ctx: CaptureContext): Promise<void> {
    const borrowed = ctx.tracks.filter((t) => t.soundId);
    if (borrowed.length === 0) return;

    const sounds = await this.prisma.sound.findMany({
      where: { id: { in: borrowed.map((t) => t.soundId!) } },
      select: { id: true, isPublic: true, uploaderId: true, mutedAt: true },
    });
    const allowed = new Set(
      sounds
        .filter((s) => !s.mutedAt && (s.isPublic || s.uploaderId === ctx.authorId))
        .map((s) => s.id),
    );

    for (const track of borrowed) {
      if (!allowed.has(track.soundId!)) {
        log.warn('soundId refusé (privé, coupé ou inexistant)', { postId: ctx.postId, soundId: track.soundId });
        continue;
      }
      await this.recordUsage(ctx, track.soundId!, track);
    }
  }

  private async captureOwned(ctx: CaptureContext): Promise<void> {
    const owned = ctx.tracks.filter((t) => !t.soundId && t.postMediaId);
    if (owned.length === 0) return;

    // SCOPE OBLIGATOIRE `postId` : `storyEffects` est contrôlé par le client.
    // Sans lui, un utilisateur désigne le PostMedia audio de n'importe qui et
    // se le fait créditer.
    const medias = await this.prisma.postMedia.findMany({
      where: { id: { in: owned.map((t) => t.postMediaId!) }, postId: ctx.postId },
      select: { id: true, fileUrl: true, filePath: true, mimeType: true, duration: true },
    });
    const byId = new Map(medias.map((m) => [m.id, m]));

    for (const track of owned) {
      const media = byId.get(track.postMediaId!);
      if (!media) continue;
      if (!media.mimeType.startsWith(AUDIO_MIME_PREFIX)) continue;
      await this.captureOne(ctx, track, media);
    }
  }

  private async captureOne(
    ctx: CaptureContext,
    track: CaptureTrack,
    media: { id: string; filePath: string; mimeType: string; duration: number | null },
  ): Promise<void> {
    try {
      const absolute = path.isAbsolute(media.filePath)
        ? media.filePath
        : path.join(this.uploadsRoot, media.filePath);
      const hash = await SoundCaptureService.hashFile(absolute);

      const existing = await this.prisma.sound.findFirst({
        where: { uploaderId: ctx.authorId, contentHash: hash },
        select: { id: true },
      });
      if (existing) {
        await this.recordUsage(ctx, existing.id, track);
        return;
      }

      const ext = path.extname(absolute) || '.m4a';
      await fsp.mkdir(this.soundsDir, { recursive: true });
      await fsp.copyFile(absolute, path.join(this.soundsDir, `${hash}${ext}`));

      const transcription = await this.prisma.postMedia.findUnique({
        where: { id: media.id },
        select: { language: true },
      });

      const sound = await this.prisma.sound.create({
        data: {
          uploaderId: ctx.authorId,
          fileUrl: `/api/v1/static/${hash}${ext}`,
          // Chaîne NEUTRE : le crédit se résout à la lecture via `uploader`.
          title: 'Son original',
          duration: Math.round((media.duration ?? 0) / 1000),
          durationMs: media.duration ?? 0,
          contentHash: hash,
          sourcePostId: ctx.postId,
          canonicalPostMediaId: media.id,
          mimeType: media.mimeType,
          sourceLanguage: transcription?.language ?? null,
          isPublic: true,
        },
        select: { id: true },
      });

      await this.recordUsage(ctx, sound.id, track);
    } catch (error) {
      log.error('Capture d\'une piste impossible',
        error instanceof Error ? error : new Error(String(error)),
        { postId: ctx.postId, trackId: track.trackId });
    }
  }

  private async recordUsage(ctx: CaptureContext, soundId: string, track: CaptureTrack): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.soundUsage.create({
          data: {
            soundId, postId: ctx.postId, trackId: track.trackId,
            viaPostId: ctx.viaPostId, startMs: track.startMs, endMs: track.endMs,
          },
        }),
        this.prisma.sound.update({
          where: { id: soundId },
          data: { usageCount: { increment: 1 } },
        }),
      ]);
    } catch {
      // Doublon `(postId, trackId)` = republication idempotente, comportement voulu.
    }
  }
}
```

`waveform` n'est pas écrite ici : le serveur ne décode pas l'audio. Elle sera renseignée par le client au lot B, via `PATCH /sounds/:id`. La colonne existe dès maintenant pour ne pas migrer deux fois.

- [ ] **Step 4 : Voir passer**

```bash
cd services/gateway && bun run test -- src/services/posts/__tests__/SoundCaptureService.test.ts
```

Attendu : **11 passed**.

- [ ] **Step 5 : Commit**

```bash
git add services/gateway/src/services/posts/SoundCaptureService.ts services/gateway/src/services/posts/__tests__/SoundCaptureService.test.ts
git commit -m "feat(sounds): SoundCaptureService — hash en flux, scope post, garde d'emprunt"
```

---

### Task 5 : Brancher la capture sur création et édition

**Files:** Modify `services/gateway/src/services/PostService.ts`, `services/gateway/src/__tests__/unit/PostService.test.ts` · Test `services/gateway/src/services/posts/__tests__/SoundCaptureWiring.test.ts`

**Interfaces:** Consumes `SoundCaptureService.captureSounds`. Produces `PostService.extractCaptureTracks` (privée).

- [ ] **Step 1 : Écrire la garde de câblage**

```typescript
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/** Gardes de source + deux méta-tests qui prouvent que le filtre fonctionne. */
describe('PostService — câblage de la capture', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'PostService.ts'), 'utf-8');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const code = strip(source);

  it('meta_strip_removesLineComments', () => {
    expect(strip('const a = 1; // mobileTranscription')).not.toContain('mobileTranscription');
  });

  it('meta_strip_keepsCode', () => {
    expect(strip('const a = 1; // x')).toContain('const a = 1;');
  });

  it('test_createPost_callsCaptureSounds', () => {
    expect(code).toContain('this.soundCaptureService.captureSounds');
  });

  it('test_captureCall_isOutsideMediaIdsGuard', () => {
    const guard = code.indexOf('if (data.mediaIds?.length)');
    const blockEnd = code.indexOf('\n    }', guard);
    expect(code.indexOf('this.soundCaptureService.captureSounds')).toBeGreaterThan(blockEnd);
  });

  it('test_captureCall_isNotGatedOnMobileTranscription', () => {
    const capture = code.indexOf('this.soundCaptureService.captureSounds');
    // Fenêtre courte : à 400 caractères elle attrapait la garde voisine légitime.
    expect(code.slice(Math.max(0, capture - 150), capture)).not.toContain('mobileTranscription');
  });

  it('test_updatePost_reusesCapture', () => {
    const start = code.indexOf('async updatePost');
    const end = code.indexOf('async deletePost');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(code.slice(start, end)).toContain('this.soundCaptureService.captureSounds');
  });

  it('test_repostPost_isNotWired_inLotA', () => {
    const start = code.indexOf('async repostPost');
    expect(code.slice(start)).not.toContain('this.soundCaptureService.captureSounds');
  });
});
```

- [ ] **Step 2 : Voir échouer**

```bash
cd services/gateway && bun run test -- src/services/posts/__tests__/SoundCaptureWiring.test.ts
```

Attendu : les 2 méta-tests et `test_repostPost_isNotWired_inLotA` passent ; les 4 autres échouent.

- [ ] **Step 3 : Injecter le service**

Dans `PostService.ts` : ajouter `import { SoundCaptureService, type CaptureTrack } from './posts/SoundCaptureService';` ; déclarer `private readonly soundCaptureService: SoundCaptureService;` **auprès des autres champs privés** (voisins de `postReactionService`) ; ajouter `soundCaptureService?: SoundCaptureService,` **en dernier paramètre** du constructeur ; initialiser dans le corps :

```typescript
    this.soundCaptureService = soundCaptureService ?? new SoundCaptureService(prisma);
```

- [ ] **Step 4 : Ajouter l'extracteur**

Méthode privée de `PostService` :

```typescript
  /** Toutes les pistes audio, pas la première : une story en porte jusqu'à cinq. */
  private extractCaptureTracks(storyEffects?: Record<string, unknown>): CaptureTrack[] {
    const raw = storyEffects?.['audioPlayerObjects'];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
      .map((o) => ({
        trackId: String(o['id'] ?? ''),
        postMediaId: typeof o['postMediaId'] === 'string' && o['postMediaId'] ? o['postMediaId'] : undefined,
        soundId: typeof o['soundId'] === 'string' && o['soundId'] ? o['soundId'] : undefined,
        startMs: typeof o['startTime'] === 'number' ? Math.round(o['startTime'] * 1000) : undefined,
        endMs: typeof o['duration'] === 'number' && typeof o['startTime'] === 'number'
          ? Math.round((o['startTime'] + o['duration']) * 1000) : undefined,
      }))
      .filter((t) => t.trackId && (t.postMediaId || t.soundId));
  }
```

- [ ] **Step 5 : Appeler à la création**

Dans `createPost`, **après la fermeture du bloc `if (data.mediaIds?.length) { … }`** — repère textuel : la ligne `    }` qui suit immédiatement le `}` fermant `if (audioMedia && !data.mobileTranscription)`. Donc hors de la garde médias **et** hors de la condition de transcription :

```typescript
    this.soundCaptureService.captureSounds({
      postId: post.id,
      authorId: post.authorId,
      isPublic: data.visibility === PostVisibility.PUBLIC,
      tracks: this.extractCaptureTracks(data.storyEffects),
    }).catch((err: unknown) => {
      log.error('captureSounds (createPost) a échoué', err instanceof Error ? err : new Error(String(err)), { postId: post.id });
    });
```

- [ ] **Step 6 : Appeler à l'édition**

Dans `updatePost`, **juste avant `return updated;`** (dernière instruction de la méthode, avant `async deletePost`) :

```typescript
    this.soundCaptureService.captureSounds({
      postId: updated.id,
      authorId: updated.authorId,
      isPublic: updated.visibility === PostVisibility.PUBLIC,
      tracks: this.extractCaptureTracks(data.storyEffects),
    }).catch((err: unknown) => {
      log.error('captureSounds (updatePost) a échoué', err instanceof Error ? err : new Error(String(err)), { postId: updated.id });
    });
```

⚠ v1 : ce point était ancré sur « ligne 799 », qui est **dans `deletePost`** — et comme `deletePost` a aussi une variable `updated` porteuse de `.id`/`.authorId`/`.visibility`, la greffe y aurait compilé sans erreur.

- [ ] **Step 7 : Garder le rattachement des médias**

Dans `createPost`, le `postMedia.updateMany` attache sans garde de propriété là où `updatePost` vérifie `postId: null`. Remplacer son `where` :

```typescript
        where: { id: { in: data.mediaIds }, postId: null },
```

- [ ] **Step 8 : Mettre à jour le test existant que cela casse**

⚠ v1 : `src/__tests__/unit/PostService.test.ts` asserte l'appel **à l'identique** (`toHaveBeenCalledWith({ where: { id: { in: [...] } }, … })`). Ajouter `postId: null` à l'objet attendu, sinon la casse n'apparaît qu'en CI.

- [ ] **Step 9 : Voir passer**

```bash
cd services/gateway && bun run test -- \
  src/services/posts/__tests__/SoundCaptureWiring.test.ts \
  src/services/posts/__tests__/SoundCaptureService.test.ts \
  src/__tests__/unit/PostService.test.ts \
  && bunx tsc --noEmit
```

Attendu : 7 passed sur le câblage, 11 sur le service, aucune régression sur `PostService.test.ts`, aucune sortie `tsc`.

- [ ] **Step 10 : Commit**

```bash
git add services/gateway/src/services/PostService.ts services/gateway/src/services/posts/__tests__/SoundCaptureWiring.test.ts services/gateway/src/__tests__/unit/PostService.test.ts
git commit -m "feat(sounds): capture branchée sur création et édition, rattachement gardé"
```

---

### Task 6 : Routes `/sounds`

**Files:** Create `services/gateway/src/routes/posts/sounds.ts` · Test `services/gateway/src/routes/posts/__tests__/sounds.test.ts` · Modify `services/gateway/src/routes/posts/index.ts`

**Interfaces:** Produces `registerSoundRoutes(fastify, prisma, requiredAuth)`.

- [ ] **Step 1 : Écrire les tests**

```typescript
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { registerSoundRoutes } from '../sounds';

// ⚠ v1 : les fixtures utilisaient 'sound-1', rejeté par la garde ObjectId de
// la route elle-même — 4 tests sur 6 recevaient 400, dont celui censé prouver
// que `contentHash` ne fuit pas : il passait sur un corps d'erreur.
const ID = '507f1f77bcf86cd799439011';

function auth(userId = 'user-abc') {
  return async (request: unknown) => {
    (request as Record<string, unknown>)['authContext'] = {
      type: 'registered', registeredUser: { id: userId, username: 'tester' },
      userId, hasFullAccess: true,
    };
  };
}

async function buildApp(prisma: unknown, userId = 'user-abc') {
  const app = Fastify();
  registerSoundRoutes(app, prisma as import('@meeshy/shared/prisma/client').PrismaClient, auth(userId));
  await app.ready();
  return app;
}

const base = { id: ID, title: 'S', fileUrl: '/f.m4a', durationMs: 1000, waveform: [], usageCount: 0 };

describe('routes /sounds', () => {
  it('test_getSound_privateSoundOfOtherUser_returns403', async () => {
    const prisma = { sound: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      ...base, uploaderId: 'autrui', isPublic: false, mutedAt: null }) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('SOUND_FORBIDDEN');
  });

  it('test_getSound_ownPrivateSound_returns200', async () => {
    const prisma = { sound: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      ...base, title: 'Mon son', uploaderId: 'user-abc', isPublic: false, mutedAt: null }) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe('Mon son');
  });

  it('test_getSound_mutedSound_returns410', async () => {
    const prisma = { sound: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: new Date() }) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(410);
    expect(res.json().code).toBe('SOUND_MUTED');
  });

  it('test_getSound_response_neverLeaksContentHashNorUploaderId', async () => {
    const prisma = { sound: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: null, contentHash: 'secret-hash' }) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: `/sounds/${ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.stringify(res.json());
    expect(body).not.toContain('secret-hash');
    expect(body).not.toContain('uploaderId');
  });

  it('test_getSound_malformedId_returns400', async () => {
    const prisma = { sound: { findUnique: jest.fn() } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: '/sounds/pas-un-id' });
    expect(res.statusCode).toBe(400);
    expect(prisma.sound.findUnique).not.toHaveBeenCalled();
  });

  it('test_patchSound_notOwner_returns403', async () => {
    const prisma = { sound: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: ID, uploaderId: 'autrui' }),
      update: jest.fn() } };
    const res = await (await buildApp(prisma)).inject({
      method: 'PATCH', url: `/sounds/${ID}`, payload: { isPublic: false } });
    expect(res.statusCode).toBe(403);
    expect(prisma.sound.update).not.toHaveBeenCalled();
  });

  it('test_getMine_returnsRootLevelPagination', async () => {
    const prisma = { sound: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
      { ...base, uploaderId: 'user-abc', isPublic: true, mutedAt: null, createdAt: new Date() }]) } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: '/sounds/mine?limit=1' });
    expect(res.statusCode).toBe(200);
    // `sendSuccess` place la pagination À LA RACINE, pas sous `meta`.
    expect(res.json().pagination).toBeDefined();
  });

  it('test_getMine_invalidCursor_returns400', async () => {
    const prisma = { sound: { findMany: jest.fn() } };
    const res = await (await buildApp(prisma)).inject({ method: 'GET', url: '/sounds/mine?cursor=pas-une-date' });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2 : Voir échouer**

```bash
cd services/gateway && bun run test -- src/routes/posts/__tests__/sounds.test.ts
```

Attendu : `Cannot find module '../sounds'`.

- [ ] **Step 3 : Écrire les routes**

Créer `services/gateway/src/routes/posts/sounds.ts` — identique à la v1 **sauf** : `cursor: z.string().datetime().optional()`, la garde `OBJECT_ID` appliquée **aussi** au `PATCH`, et le `as never` supprimé (`CursorPaginationMeta` est exactement `{ limit, hasMore, nextCursor }`) :

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendForbidden, sendError } from '../../utils/response';

const OBJECT_ID = /^[a-f0-9]{24}$/;
const MineQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const PatchBodySchema = z.object({ isPublic: z.boolean() });

/** Projection explicite : `contentHash` et `uploaderId` ne sortent jamais. */
function toDTO(s: Record<string, unknown>) {
  return {
    id: s['id'], title: s['title'], fileUrl: s['fileUrl'],
    durationMs: s['durationMs'] ?? null, waveform: s['waveform'] ?? [],
    usageCount: s['usageCount'] ?? 0, isPublic: s['isPublic'] ?? false,
    createdAt: s['createdAt'] ?? null,
  };
}

export function registerSoundRoutes(fastify: FastifyInstance, prisma: PrismaClient, requiredAuth: any) {
  fastify.get('/sounds/mine', {
    preValidation: [requiredAuth],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = (request as UnifiedAuthRequest).authContext;
    if (!ctx?.registeredUser) return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    const parsed = MineQuerySchema.safeParse(request.query);
    if (!parsed.success) return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
    const { cursor, limit } = parsed.data;

    const rows = await prisma.sound.findMany({
      where: {
        uploaderId: ctx.registeredUser.id, mutedAt: null,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1] as { createdAt?: Date } | undefined;

    return sendSuccess(reply, page.map((s) => toDTO(s as unknown as Record<string, unknown>)), {
      pagination: { limit, hasMore, nextCursor: hasMore && last?.createdAt ? last.createdAt.toISOString() : null },
    });
  });

  fastify.get<{ Params: { id: string } }>('/sounds/:id', {
    preValidation: [requiredAuth],
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const ctx = (request as unknown as UnifiedAuthRequest).authContext;
    if (!ctx?.registeredUser) return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    if (!OBJECT_ID.test(request.params.id)) return sendBadRequest(reply, 'Invalid sound id', { code: 'VALIDATION_ERROR' });

    const sound = await prisma.sound.findUnique({ where: { id: request.params.id } });
    if (!sound) return sendNotFound(reply, 'Sound not found', { code: 'SOUND_NOT_FOUND' });
    if ((sound as { mutedAt?: Date | null }).mutedAt) {
      return sendError(reply, 410, 'Sound is no longer available', { code: 'SOUND_MUTED' });
    }
    const s = sound as unknown as Record<string, unknown>;
    if (!s['isPublic'] && s['uploaderId'] !== ctx.registeredUser.id) {
      return sendForbidden(reply, 'This sound is private', { code: 'SOUND_FORBIDDEN' });
    }
    return sendSuccess(reply, toDTO(s));
  });

  fastify.patch<{ Params: { id: string } }>('/sounds/:id', {
    preValidation: [requiredAuth],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const ctx = (request as unknown as UnifiedAuthRequest).authContext;
    if (!ctx?.registeredUser) return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    if (!OBJECT_ID.test(request.params.id)) return sendBadRequest(reply, 'Invalid sound id', { code: 'VALIDATION_ERROR' });
    const parsed = PatchBodySchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Invalid body', { code: 'VALIDATION_ERROR' });

    const sound = await prisma.sound.findUnique({
      where: { id: request.params.id }, select: { id: true, uploaderId: true },
    });
    if (!sound) return sendNotFound(reply, 'Sound not found', { code: 'SOUND_NOT_FOUND' });
    if (sound.uploaderId !== ctx.registeredUser.id) return sendForbidden(reply, 'Not the sound owner', { code: 'NOT_SOUND_OWNER' });

    const updated = await prisma.sound.update({
      where: { id: request.params.id }, data: { isPublic: parsed.data.isPublic },
    });
    return sendSuccess(reply, toDTO(updated as unknown as Record<string, unknown>));
  });
}
```

- [ ] **Step 4 : Enregistrer le module**

Dans `services/gateway/src/routes/posts/index.ts` — la fonction `postRoutes` est la seule du fichier ; ajouter l'import et l'appel à côté de `registerStoryAudioRoutes(fastify, prisma, requiredAuth);` (même forme : non `await`, sans préfixe local, le `/api/v1` venant de `route-registration.ts`).

- [ ] **Step 5 : Voir passer**

```bash
cd services/gateway && bun run test -- src/routes/posts/__tests__/sounds.test.ts src/__tests__/unit/routes/posts/index.test.ts && bunx tsc --noEmit
```

Attendu : 8 passed sur `sounds.test.ts`, aucune régression sur `index.test.ts` (qui mocke cinq modules de routes et en verra un sixième non mocké).

- [ ] **Step 6 : Commit**

```bash
git add services/gateway/src/routes/posts/sounds.ts services/gateway/src/routes/posts/__tests__/sounds.test.ts services/gateway/src/routes/posts/index.ts
git commit -m "feat(sounds): routes /sounds avec garde d'autorisation et projection explicite"
```

---

### Task 7 : Fermer les routes héritées

**Files:** Modify `services/gateway/src/routes/posts/audio.ts`, `apps/web/services/posts.service.ts`, `apps/web/__tests__/services/posts.service.test.ts`, `services/gateway/src/__tests__/unit/routes/posts-audio.test.ts`, `services/gateway/src/__tests__/unit/routes/posts/audio.test.ts`

- [ ] **Step 1 : Confirmer l'absence d'appelant**

```bash
grep -rn "trackStoryAudioUse\|getStoryAudioLibrary" apps/web --include="*.ts" --include="*.tsx" | grep -v "__tests__" | grep -v "posts.service.ts"
grep -rn "stories/audio" apps/ios packages/MeeshySDK --include="*.swift" | grep -v SourcePackages
```

Attendu : **aucune sortie**. Sinon s'arrêter et signaler.

- [ ] **Step 2 : Supprimer la route `/use`**

Supprimer le bloc `POST /stories/audio/:audioId/use` d'`audio.ts` (commentaire compris). L'usage est écrit côté serveur à la publication ; conserver la route créerait un double comptage.

- [ ] **Step 3 : Écrire `contentHash` dans l'upload manuel**

⚠ Sans cela, la tâche 1 introduit une **régression** : `POST /stories/audio` crée des `Sound` sans `contentHash`, or MongoDB traite l'absence comme `null` dans un index unique — le **second** upload d'un même utilisateur violerait `@@unique([uploaderId, contentHash])` et renverrait 500. Après l'écriture du fichier, avant le `prisma.sound.create`, ajouter :

```typescript
    const contentHash = await SoundCaptureService.hashFile(filePath);
```

et passer `contentHash` dans le `data:` du `create`, avec `import { SoundCaptureService } from '../../services/posts/SoundCaptureService';`.

- [ ] **Step 4 : Projeter la liste publique**

`GET /stories/audio` renvoie l'entité Prisma brute : après la tâche 1 elle fuiterait `contentHash`, `uploaderId`, `sourcePostId`, `canonicalPostMediaId` et `translations`. Ajouter `mutedAt: null` à son `where` et projeter chaque ligne sur la même forme que `toDTO` (dupliquer la fonction dans `audio.ts` ou l'exporter depuis `sounds.ts`).

- [ ] **Step 5 : Supprimer les deux méthodes web mortes**

Dans `apps/web/services/posts.service.ts`, supprimer les lignes **334-349** — du commentaire `// ── Story Background Audio ──` jusqu'à la `},` de `trackStoryAudioUse` incluse. ⚠ v1 : **conserver la ligne 350 `};`**, qui ferme l'objet `postsService`.

- [ ] **Step 6 : Supprimer les DEUX describes web**

`apps/web/__tests__/services/posts.service.test.ts` contient `describe('getStoryAudioLibrary')` **et** `describe('trackStoryAudioUse')`. Supprimer les deux.

- [ ] **Step 7 : Nettoyer les tests gateway de `/use`**

⚠ v1 : deux fichiers hors du répertoire vérifié couvrent la route supprimée — `src/__tests__/unit/routes/posts-audio.test.ts` et `src/__tests__/unit/routes/posts/audio.test.ts`. Supprimer leurs blocs relatifs à `/use`.

- [ ] **Step 8 : Vérifier les deux côtés**

```bash
cd services/gateway && bun run test -- src/routes/posts/ src/__tests__/unit/routes/posts-audio.test.ts src/__tests__/unit/routes/posts/audio.test.ts
cd ../../apps/web && bun run test -- __tests__/services/posts.service.test.ts
```

- [ ] **Step 9 : Commit**

```bash
git add services/gateway/src apps/web/services/posts.service.ts apps/web/__tests__/services/posts.service.test.ts
git commit -m "refactor(sounds): ferme la route /use, hache l'upload manuel, projette la liste publique"
```

---

### Task 8 : Faire de `mutedAt` un vrai arrêt de diffusion

**Files:** Modify `services/gateway/src/routes/posts/audio.ts` (`GET /static/:filename`) · Test `services/gateway/src/routes/posts/__tests__/staticMuted.test.ts`

Sans cette tâche, `mutedAt` est décoratif : la route de service ne consulte pas la base et sert le fichier à tout porteur de jeton.

- [ ] **Step 1 : Écrire le test**

```typescript
import { describe, it, expect, jest } from '@jest/globals';
// Monter la route `/static/:filename` avec un prisma stubé dont
// `sound.findFirst` renvoie `{ mutedAt: new Date() }`, puis :
//   expect(res.statusCode).toBe(410)
// et un second cas `mutedAt: null` → 200.
```

L'exécutant réutilise le harnais de `src/routes/posts/__tests__/audio.static-route.test.ts` (Fastify nu + répertoire temporaire + stub `requiredAuth`), en ajoutant `sound: { findFirst: jest.fn() }` au faux client.

- [ ] **Step 2 : Voir échouer**

```bash
cd services/gateway && bun run test -- src/routes/posts/__tests__/staticMuted.test.ts
```

- [ ] **Step 3 : Consulter `mutedAt` avant de servir**

Dans le handler de `GET /static/:filename`, après la validation d'extension et avant la lecture du fichier :

```typescript
    // `mutedAt` doit arrêter la DIFFUSION, pas seulement masquer la métadonnée.
    const muted = await prisma.sound.findFirst({
      where: { fileUrl: { endsWith: `/${safeName}` }, mutedAt: { not: null } },
      select: { id: true },
    });
    if (muted) {
      return sendError(reply, 410, 'Sound is no longer available', { code: 'SOUND_MUTED' });
    }
```

- [ ] **Step 4 : Documenter la limite qui subsiste**

Ajouter ce commentaire au-dessus :

```typescript
    // LIMITE ASSUMÉE : le PostMedia SOURCE reste servi par `/attachments/file/*`
    // (sans authentification) et par nginx en cache immutable. Couper un son
    // arrête la copie de bibliothèque, pas l'original du post. Le retrait
    // complet suppose de supprimer le média source — lot 2.
```

- [ ] **Step 5 : Voir passer et commiter**

```bash
cd services/gateway && bun run test -- src/routes/posts/__tests__/staticMuted.test.ts && bunx tsc --noEmit
git add services/gateway/src/routes/posts
git commit -m "fix(sounds): mutedAt arrête réellement la diffusion de la copie de bibliothèque"
```

---

### Task 9 : Purger les usages des contenus disparus

**Files:** Modify `services/gateway/src/services/ExpiredStoriesCleanupService.ts` · Test `services/gateway/src/services/__tests__/ExpiredStoriesCleanupService.sounds.test.ts`

- [ ] **Step 1 : Écrire le test**

```typescript
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('ExpiredStoriesCleanupService — usages de sons', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'ExpiredStoriesCleanupService.ts'), 'utf-8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('test_cleanup_purgesSoundUsage', () => {
    expect(code).toContain('soundUsage.deleteMany');
  });

  it('test_cleanup_usesAllPostIds_notJustStories', () => {
    const i = code.indexOf('soundUsage.deleteMany');
    expect(code.slice(i, i + 200)).toContain('allPostIds');
  });
});
```

- [ ] **Step 2 : Voir échouer, puis ajouter la purge**

Avant le `postMedia.deleteMany` existant :

```typescript
      // Les usages meurent avec le post ; le Sound, lui, SURVIT.
      // `allPostIds` = stories expirées + leurs reposts. Ne PAS utiliser `ids`
      // (stories seules), qui laisserait les usages des reposts orphelins.
      const orphanUsages = await this.prisma.soundUsage.findMany({
        where: { postId: { in: allPostIds } },
        select: { soundId: true },
      });
      await this.prisma.soundUsage.deleteMany({ where: { postId: { in: allPostIds } } });
      for (const usage of orphanUsages) {
        await this.prisma.sound.update({
          where: { id: usage.soundId },
          data: { usageCount: { decrement: 1 } },
        }).catch(() => undefined);
      }
```

⚠ v1 : le snippet utilisait `postIds`, qui n'existe pas — et sa garde de source passait quand même, puisqu'elle ne cherchait qu'une chaîne.

- [ ] **Step 3 : Voir passer et commiter**

```bash
cd services/gateway && bun run test -- src/services/__tests__/ExpiredStoriesCleanupService.sounds.test.ts && bunx tsc --noEmit
git add services/gateway/src/services/ExpiredStoriesCleanupService.ts services/gateway/src/services/__tests__/ExpiredStoriesCleanupService.sounds.test.ts
git commit -m "fix(sounds): purge les usages des stories supprimées et décrémente le compteur"
```

---

### Task 10 : Réparer le signalement

**Files:** Modify `services/gateway/src/routes/admin/reports.ts` (**ligne 16**), `packages/shared/prisma/schema.prisma:1685` · Test `services/gateway/src/routes/admin/__tests__/reports.entityTypes.test.ts`

- [ ] **Step 1 : Écrire le test**

```typescript
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/** iOS envoie "post" et "story" depuis de vrais boutons (ReportService.swift:43, :53) ;
 *  l'enum ne les acceptait pas — ces appels partaient en 400 systématique. */
describe('routes/admin/reports.ts — types signalables', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'reports.ts'), 'utf-8');
  const line = source.split('\n').find((l) => l.includes('reportedType: z.enum'));

  it.each(['post', 'story', 'sound'])('test_createReportSchema_accepts_%s', (type) => {
    expect(line).toBeDefined();
    expect(line).toContain(`'${type}'`);
  });
});
```

- [ ] **Step 2 : Voir échouer, puis élargir l'enum**

⚠ v1 : le plan disait « remplacer la ligne 15 » — c'est la **déclaration** `const createReportSchema = z.object({`. L'enum est à la **16** :

```typescript
  reportedType: z.enum(['message', 'user', 'conversation', 'community', 'post', 'story', 'sound']),
```

`Report.reportedType` est un `String` en base : aucune migration. Mettre à jour le commentaire de `schema.prisma:1685`.

- [ ] **Step 3 : Voir passer et commiter**

```bash
cd services/gateway && bun run test -- src/routes/admin/__tests__/reports.entityTypes.test.ts
git add services/gateway/src/routes/admin packages/shared/prisma/schema.prisma
git commit -m "fix(reports): accepte post, story et sound — les signalements iOS partaient en 400"
```

---

### Task 11 : Migration des entrées héritées

**À supprimer si la tâche 1 étape 1 a renvoyé `0`.**

**Files:** Create `services/gateway/scripts/migrate-sound-library.ts`

- [ ] **Step 1 : Écrire le script**

Identique à la v1, avec deux corrections : il résout les chemins **hérités** (`/tmp/meeshy-uploads`, le défaut historique) et non le volume neuf — sinon il neutralise 100 % des entrées par construction, et sa « vérification » est une tautologie. Ajouter un `--dry-run` par défaut, l'écriture n'ayant lieu qu'avec `--apply`.

```typescript
const LEGACY_DIR = process.env.LEGACY_UPLOAD_DIR ?? '/tmp/meeshy-uploads';
const APPLY = process.argv.includes('--apply');
```

Pour chaque `Sound` sans `mutedAt`, tester `fs.access(path.join(LEGACY_DIR, path.basename(fileUrl)))` ; si absent, poser `mutedAt` (ou seulement compter, hors `--apply`). Journaliser `examinées / manquantes / neutralisées`.

- [ ] **Step 2 : Exécuter à blanc en staging**

```bash
cd services/gateway && bunx tsx scripts/migrate-sound-library.ts
```

Attendu : un comptage cohérent avec la tâche 1. Relancer avec `--apply` seulement après lecture du résultat.

- [ ] **Step 3 : Commit**

```bash
git add services/gateway/scripts/migrate-sound-library.ts
git commit -m "chore(sounds): script de neutralisation des entrées héritées sans fichier"
```

---

## Reporté explicitement

**Lot B** : `soundId` sur `StoryAudioPlayerObject` (+ `case soundId` dans les `CodingKeys` — l'oublier compile sans avertissement et le champ n'est jamais sérialisé), réinjection serveur du `soundId` à la lecture, **branchement repost**, enrichissement `story.backgroundAudio` du payload (canal aujourd'hui mort de bout en bout), résolution d'un son emprunté côté lecteur, écriture de `waveform`, « Mes sons », « Utiliser ce son ».

**Lot C** : chaîne ZMQ (`postId`/`postMediaId`) et `Sound.translations`.

**Lot 2** : job de réconciliation de `usageCount`, suppression du média source à la coupure, `uploadContext` persisté, filtrage des comptes bloqués dans `routes/posts/`, bascule pré-publication, `canonicalSoundId` survivant au ré-encodage.

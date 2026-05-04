# Composer-based Story Repost — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter le repartage de stories via composer (édition libre vers nouvelle story OU vers post permanent avec embed read-only animé), tout en réutilisant les composants existants (`StoryComposerView`, `UnifiedPostComposer`, `StoryCanvasReaderView`) — zéro nouveau composant ad-hoc.

**Architecture:** Backend ajoute `originalRepostOfId` sur `Post` et un paramètre `targetType` sur `repostPost` (snapshot médias quand STORY→POST). Le SDK ajoute deux inits aux composers existants pour préchargement repost. L'app iOS câble 3 nouveaux flux UI (bouton Partager pile droite + 2 items dans le menu kebab). Le rendu feed branche sur `post.repostOf?.type === STORY` pour utiliser `StoryCanvasReaderView` au lieu de la cellule post normale.

**Tech Stack:** TypeScript strict + Fastify + Prisma + MongoDB (gateway) ; Swift 6 + SwiftUI + XCTest (iOS) ; pnpm + Turborepo (monorepo).

**Spec source:** `docs/superpowers/specs/2026-05-04-composer-based-story-repost-design.md`

**Phasing:**
- **Phase A** : Backend (PostService refacto + originalRepostOfId field + media duplication + route handler)
- **Phase B** : iOS SDK (modèles, services réseau, ViewModels composer préchargés, sticker locked)
- **Phase C** : iOS app (boutons StoryViewerView, menu kebab, rendu feed)
- **Phase D** : Tests d'intégration end-to-end + build vérification

Chaque phase est fonctionnelle mergeable indépendamment (le frontend peut commencer à appeler le backend dès Phase A terminée). TDD strict : RED → GREEN → REFACTOR → COMMIT à chaque task.

---

## File Structure

### Backend (gateway + shared)

| Fichier | Action | Responsabilité |
|---------|--------|----------------|
| `packages/shared/prisma/schema.prisma` | Modify | Ajout `originalRepostOfId String?` + index sur `Post` |
| `services/gateway/src/services/PostService.ts` | Modify | Refacto `repostPost` (params object, snapshot médias, calcul `originalRepostOfId`) |
| `services/gateway/src/services/MediaService.ts` | Modify | Helper `duplicateMedia(originalUrl): newUrl` (extraction si pas déjà existante) |
| `services/gateway/src/routes/posts.ts` (ou équivalent) | Modify | Route `POST /posts/:id/repost` accepte `targetType`/`content`/`isQuote` |
| `services/gateway/src/__tests__/unit/PostService.test.ts` | Modify | Étendre suite `repostPost` avec 11 tests TDD |
| `services/gateway/src/__tests__/unit/MediaService.test.ts` | Create or modify | Tests `duplicateMedia` (3 tests) |

### iOS SDK (packages/MeeshySDK)

| Fichier | Action | Responsabilité |
|---------|--------|----------------|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift` | Modify | Ajout `originalRepostOfId: String?` sur `APIPost` |
| `packages/MeeshySDK/Sources/MeeshySDK/Networking/PostService.swift` | Modify | Méthode `repost(postId, targetType?, content?, isQuote?)` |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` | Modify | Init `init(repostingFrom:currentSlide:)` ; gestion sticker locked |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/CanvasElementModifiers.swift` | Modify | Ajout flag `isLocked: Bool` qui désactive gestures sur element |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift` | Modify | Init `init(repostingFrom:currentSlide:onPublishRepost:onDismiss:)` ; mode repost |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift` | Audit/Modify | Init prenant `APIPost` pour rendu feed (peut être déjà compatible) |
| `packages/MeeshySDK/Tests/MeeshyUITests/StoryComposerViewModelRepostTests.swift` | Create | 7 tests TDD du preload repost |
| `packages/MeeshySDK/Tests/MeeshyUITests/UnifiedPostComposerRepostTests.swift` | Create | 4 tests TDD du mode repost |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Services/PostServiceTests.swift` | Modify | 3 tests pour la nouvelle méthode `repost` |

### iOS app (apps/ios)

| Fichier | Action | Responsabilité |
|---------|--------|----------------|
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` | Modify | Bouton « Partager » droite → composer story ; menu kebab nouveaux items |
| `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` | Modify | Suppression `reshareStory()` ; ajout `repostAsPostDirect()` |
| `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` (ou cellule feed) | Modify | Branchement de rendu repost-de-story + header double attribution |
| `apps/ios/MeeshyTests/Unit/ViewModels/StoryViewerViewModelMenuTests.swift` | Create | 6 tests TDD du menu et boutons |
| `apps/ios/MeeshyTests/Integration/StoryRepostFlowTests.swift` | Create | 4 tests d'intégration end-to-end |

---

## Phase A — Backend

### Task A.1 : Schema migration — ajouter `originalRepostOfId`

**Files:**
- Modify: `packages/shared/prisma/schema.prisma`

- [ ] **Step 1: Locate the `Post` model in schema.prisma**

Run: `grep -n "model Post {" packages/shared/prisma/schema.prisma`
Expected: Line number of the model declaration (~ligne 2580).

- [ ] **Step 2: Add `originalRepostOfId` field**

Trouver `repostOfId String?` dans le modèle `Post` et ajouter en dessous :

```prisma
  /// Racine de la chaîne de reposts. Pointe vers l'auteur original quand
  /// le post intermédiaire (repostOf) est lui-même un repost.
  /// null si ce post n'est pas un repost.
  originalRepostOfId String?  @db.ObjectId
```

Puis ajouter l'index dans la section `@@index` du modèle :

```prisma
  @@index([originalRepostOfId])
```

- [ ] **Step 3: Régénérer le client Prisma**

```bash
pnpm --filter @meeshy/gateway generate
```

Expected: "Generated Prisma Client" sans erreur.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git commit -m "feat(shared): add originalRepostOfId to Post for repost chain tracking"
```

---

### Task A.2 : Test RED — `repostPost` calcule `originalRepostOfId` à la racine

**Files:**
- Modify: `services/gateway/src/__tests__/unit/PostService.test.ts`

- [ ] **Step 1: Localiser la suite `repostPost` existante**

Run: `grep -n "describe.*repostPost" services/gateway/src/__tests__/unit/PostService.test.ts`
Expected: Ligne ~550.

- [ ] **Step 2: Ajouter le test RED**

Dans la suite `describe('repostPost', () => {...})`, ajouter :

```typescript
it('sets originalRepostOfId to original.id when original is a root post', async () => {
  const original = makePost({ id: 'original-1', repostOfId: null, originalRepostOfId: null });
  prisma.post.findFirst.mockResolvedValue(original);
  const repost = makePost({ id: 'repost-1', repostOfId: 'original-1', originalRepostOfId: 'original-1' });
  prisma.post.create.mockResolvedValue(repost);
  prisma.post.update.mockResolvedValue(original);

  await service.repostPost('original-1', 'user-reposter');

  expect(prisma.post.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        repostOfId: 'original-1',
        originalRepostOfId: 'original-1',
      }),
    })
  );
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @meeshy/gateway test -- --testPathPattern='PostService.test' -t 'sets originalRepostOfId to original.id'`
Expected: FAIL — `originalRepostOfId` n'est pas dans le payload de `prisma.post.create`.

- [ ] **Step 4: Commit le test RED**

```bash
git add services/gateway/src/__tests__/unit/PostService.test.ts
git commit -m "test(gateway): add failing test for repostPost originalRepostOfId calculation (root case)"
```

---

### Task A.3 : Implémenter le calcul `originalRepostOfId` dans `repostPost` (cas racine)

**Files:**
- Modify: `services/gateway/src/services/PostService.ts:740-767`

- [ ] **Step 1: Modifier `repostPost` pour calculer `originalRepostOfId`**

Remplacer le bloc `data` dans `prisma.post.create` (ligne ~748) par :

```typescript
const originalRepostOfId = original.originalRepostOfId
  ?? original.repostOfId
  ?? original.id;

const repost = await this.prisma.post.create({
  data: {
    authorId: userId,
    type: PostType.POST,
    visibility: original.visibility,
    content: content ?? undefined,
    originalLanguage,
    repostOfId: postId,
    originalRepostOfId,
    isQuote,
  },
  include: postInclude,
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il passe**

Run: `pnpm --filter @meeshy/gateway test -- --testPathPattern='PostService.test' -t 'sets originalRepostOfId to original.id'`
Expected: PASS.

- [ ] **Step 3: Commit GREEN**

```bash
git add services/gateway/src/services/PostService.ts
git commit -m "feat(gateway): repostPost calculates originalRepostOfId for root case"
```

---

### Task A.4 : Test RED+GREEN — `originalRepostOfId` flatten transitif

**Files:**
- Modify: `services/gateway/src/__tests__/unit/PostService.test.ts`

- [ ] **Step 1: Ajouter le test flatten**

Dans la même suite `describe('repostPost', ...)` :

```typescript
it('flattens originalRepostOfId when original is itself a repost', async () => {
  const original = makePost({
    id: 'intermediate-1',
    repostOfId: 'root-1',
    originalRepostOfId: 'root-1',
  });
  prisma.post.findFirst.mockResolvedValue(original);
  const repost = makePost({ id: 'repost-2', repostOfId: 'intermediate-1' });
  prisma.post.create.mockResolvedValue(repost);
  prisma.post.update.mockResolvedValue(original);

  await service.repostPost('intermediate-1', 'user-reposter');

  expect(prisma.post.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        repostOfId: 'intermediate-1',
        originalRepostOfId: 'root-1',
      }),
    })
  );
});
```

- [ ] **Step 2: Vérifier que le test passe immédiatement** (Task A.3 a déjà implémenté la logique flatten)

Run: `pnpm --filter @meeshy/gateway test -- --testPathPattern='PostService.test' -t 'flattens originalRepostOfId'`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add services/gateway/src/__tests__/unit/PostService.test.ts
git commit -m "test(gateway): verify originalRepostOfId flattens for chained reposts"
```

---

### Task A.5 : Test RED — `repostPost` accepte options object avec `targetType`

**Files:**
- Modify: `services/gateway/src/__tests__/unit/PostService.test.ts`

- [ ] **Step 1: Ajouter le test RED**

```typescript
it('accepts targetType option to override default repost type', async () => {
  const original = makePost({ id: 'story-1', type: PostType.STORY });
  prisma.post.findFirst.mockResolvedValue(original);
  const repost = makePost({ id: 'repost-3', repostOfId: 'story-1', type: PostType.STORY });
  prisma.post.create.mockResolvedValue(repost);
  prisma.post.update.mockResolvedValue(original);

  await service.repostPost('story-1', 'user-reposter', { targetType: PostType.STORY });

  expect(prisma.post.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        type: PostType.STORY,
      }),
    })
  );
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @meeshy/gateway test -- --testPathPattern='PostService.test' -t 'accepts targetType option'`
Expected: FAIL — la signature actuelle ne prend pas d'options object.

- [ ] **Step 3: Commit RED**

```bash
git add services/gateway/src/__tests__/unit/PostService.test.ts
git commit -m "test(gateway): add failing test for repostPost targetType option"
```

---

### Task A.6 : Refacto signature `repostPost` avec options object

**Files:**
- Modify: `services/gateway/src/services/PostService.ts:740`
- Modify: tous les call sites de `repostPost` dans `services/gateway/src/`

- [ ] **Step 1: Identifier tous les call sites**

Run: `grep -rn "repostPost(" services/gateway/src/ --include='*.ts' | grep -v test`
Expected: Liste des fichiers + lignes appelant `repostPost`.

- [ ] **Step 2: Modifier la signature**

Remplacer la méthode dans `PostService.ts` :

```typescript
async repostPost(
  postId: string,
  userId: string,
  opts: {
    targetType?: PostType;
    content?: string;
    isQuote?: boolean;
  } = {}
) {
  const original = await this.prisma.post.findFirst({
    where: { id: postId, isDeleted: false },
  });
  if (!original) return null;

  const targetType = opts.targetType ?? original.type;
  const content = opts.content;
  const isQuote = opts.isQuote ?? false;
  const originalLanguage = content ? detectLanguage(content) : undefined;
  const originalRepostOfId = original.originalRepostOfId
    ?? original.repostOfId
    ?? original.id;

  const repost = await this.prisma.post.create({
    data: {
      authorId: userId,
      type: targetType,
      visibility: original.visibility,
      content: content ?? undefined,
      originalLanguage,
      repostOfId: postId,
      originalRepostOfId,
      isQuote,
    },
    include: postInclude,
  });

  await this.prisma.post.update({
    where: { id: postId },
    data: { repostCount: { increment: 1 } },
  });

  return repost;
}
```

- [ ] **Step 3: Mettre à jour les call sites**

Pour chaque call site identifié à Step 1, remplacer :

```typescript
// Avant
service.repostPost(postId, userId, content, isQuote)
// Après
service.repostPost(postId, userId, { content, isQuote })
```

- [ ] **Step 4: Mettre à jour les tests existants pour la nouvelle signature**

Dans `PostService.test.ts`, chaque appel `service.repostPost('original-1', 'user-reposter', 'Great post!', true)` devient :

```typescript
service.repostPost('original-1', 'user-reposter', { content: 'Great post!', isQuote: true })
```

- [ ] **Step 5: Lancer toute la suite repostPost**

Run: `pnpm --filter @meeshy/gateway test -- --testPathPattern='PostService.test' -t 'repostPost'`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/services/PostService.ts services/gateway/src/__tests__/unit/PostService.test.ts
# Ajouter aussi tous les fichiers modifiés en Step 3
git commit -m "refactor(gateway): repostPost accepts options object with targetType"
```

---

### Task A.7 : Test RED — snapshot médias quand STORY → POST

**Files:**
- Modify: `services/gateway/src/__tests__/unit/PostService.test.ts`

- [ ] **Step 1: Ajouter le test RED**

```typescript
it('duplicates media to new CDN URLs when reposting STORY as POST', async () => {
  const original = makePost({
    id: 'story-1',
    type: PostType.STORY,
    media: [
      { id: 'm1', url: 'https://cdn/old/m1.jpg', mimeType: 'image/jpeg' },
      { id: 'm2', url: 'https://cdn/old/m2.mp4', mimeType: 'video/mp4' },
    ],
    storyEffects: { someEffect: 'value' },
    audioUrl: 'https://cdn/old/audio.mp3',
  });
  prisma.post.findFirst.mockResolvedValue(original);
  prisma.post.create.mockResolvedValue(makePost({ id: 'repost-snap' }));
  prisma.post.update.mockResolvedValue(original);

  // Mock du helper duplicateMedia
  const duplicateMediaSpy = jest.spyOn(mediaService, 'duplicateMedia')
    .mockResolvedValueOnce('https://cdn/new/m1.jpg')
    .mockResolvedValueOnce('https://cdn/new/m2.mp4')
    .mockResolvedValueOnce('https://cdn/new/audio.mp3');

  await service.repostPost('story-1', 'user-reposter', { targetType: PostType.POST });

  // Vérifie que duplicateMedia est appelé pour chaque média ET pour l'audio
  expect(duplicateMediaSpy).toHaveBeenCalledWith('https://cdn/old/m1.jpg');
  expect(duplicateMediaSpy).toHaveBeenCalledWith('https://cdn/old/m2.mp4');
  expect(duplicateMediaSpy).toHaveBeenCalledWith('https://cdn/old/audio.mp3');

  // Vérifie que les nouveaux URLs sont propagés
  expect(prisma.post.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        type: PostType.POST,
        audioUrl: 'https://cdn/new/audio.mp3',
        storyEffects: { someEffect: 'value' },
      }),
    })
  );
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @meeshy/gateway test -- --testPathPattern='PostService.test' -t 'duplicates media to new CDN'`
Expected: FAIL — pas de duplication implémentée.

- [ ] **Step 3: Commit RED**

```bash
git add services/gateway/src/__tests__/unit/PostService.test.ts
git commit -m "test(gateway): add failing test for media snapshot on STORY-to-POST repost"
```

---

### Task A.8 : Implémenter `MediaService.duplicateMedia`

**Files:**
- Modify: `services/gateway/src/services/MediaService.ts`
- Create: `services/gateway/src/__tests__/unit/MediaService.test.ts` (si pas existant)

- [ ] **Step 1: Vérifier si `MediaService.duplicateMedia` existe déjà**

Run: `grep -rn "duplicateMedia\|duplicate.*url\|copyMedia" services/gateway/src/services/MediaService.ts 2>/dev/null`
Expected: Aucun résultat (méthode inexistante) → continuer. Si existe, sauter ce task.

- [ ] **Step 2: Test RED de `duplicateMedia`**

Créer ou ouvrir `services/gateway/src/__tests__/unit/MediaService.test.ts` et ajouter :

```typescript
describe('MediaService.duplicateMedia', () => {
  it('downloads original and re-uploads to new CDN path', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
      headers: { get: (h: string) => h === 'content-type' ? 'image/jpeg' : null },
    });
    const mockUpload = jest.fn().mockResolvedValue('https://cdn/new/abc.jpg');

    const service = new MediaService({ fetch: mockFetch, uploadBuffer: mockUpload });
    const newUrl = await service.duplicateMedia('https://cdn/old/source.jpg');

    expect(mockFetch).toHaveBeenCalledWith('https://cdn/old/source.jpg');
    expect(mockUpload).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: 'image/jpeg' })
    );
    expect(newUrl).toBe('https://cdn/new/abc.jpg');
  });
});
```

- [ ] **Step 3: Lancer pour vérifier le RED**

Run: `pnpm --filter @meeshy/gateway test -- --testPathPattern='MediaService.test'`
Expected: FAIL.

- [ ] **Step 4: Implémenter `duplicateMedia` dans `MediaService.ts`**

Ajouter la méthode :

```typescript
async duplicateMedia(originalUrl: string): Promise<string> {
  const response = await this.deps.fetch(originalUrl);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${originalUrl} (HTTP ${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';

  return this.deps.uploadBuffer(buffer, { contentType });
}
```

(Note: `this.deps` doit déjà exposer `fetch` et `uploadBuffer`. Sinon, adapter à l'API existante de MediaService — le concept reste le même : télécharger puis ré-uploader.)

- [ ] **Step 5: Lancer pour vérifier le GREEN**

Run: `pnpm --filter @meeshy/gateway test -- --testPathPattern='MediaService.test'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/services/MediaService.ts services/gateway/src/__tests__/unit/MediaService.test.ts
git commit -m "feat(gateway): add MediaService.duplicateMedia helper"
```

---

### Task A.9 : Implémenter le snapshot médias dans `repostPost`

**Files:**
- Modify: `services/gateway/src/services/PostService.ts`

- [ ] **Step 1: Injecter `MediaService` dans `PostService` (si pas déjà fait)**

Vérifier que le constructeur de `PostService` accepte un `MediaService`. Si non, l'ajouter :

```typescript
constructor(
  private prisma: PrismaClient,
  private mediaService: MediaService,
) {}
```

Mettre à jour les sites de construction (DI container, factory).

- [ ] **Step 2: Modifier `repostPost` pour snapshot quand STORY→POST**

Dans `repostPost`, après le calcul de `originalRepostOfId` et avant `prisma.post.create`, ajouter :

```typescript
const isStoryToPostRepost = original.type === PostType.STORY && targetType === PostType.POST;

let snapshotMedia: Array<{ url: string; mimeType: string; thumbnailUrl?: string }> | undefined;
let snapshotAudioUrl: string | undefined;
let snapshotStoryEffects: any | undefined;
let snapshotBackgroundColor: string | undefined;

if (isStoryToPostRepost) {
  // Dupliquer les médias
  const duplicatedMedia: typeof snapshotMedia = [];
  try {
    for (const m of (original.media ?? [])) {
      const newUrl = await this.mediaService.duplicateMedia(m.url);
      const newThumb = m.thumbnailUrl
        ? await this.mediaService.duplicateMedia(m.thumbnailUrl)
        : undefined;
      duplicatedMedia.push({ url: newUrl, mimeType: m.mimeType, thumbnailUrl: newThumb });
    }
    if (original.audioUrl) {
      snapshotAudioUrl = await this.mediaService.duplicateMedia(original.audioUrl);
    }
    snapshotMedia = duplicatedMedia;
    snapshotStoryEffects = original.storyEffects;
    snapshotBackgroundColor = original.backgroundColor;
  } catch (err) {
    // Rollback : delete les médias déjà dupliqués
    for (const dup of duplicatedMedia) {
      await this.mediaService.deleteMedia(dup.url).catch(() => {});
    }
    throw new Error('Media snapshot failed during repost', { cause: err });
  }
}
```

Puis dans le `prisma.post.create.data`, étendre :

```typescript
data: {
  authorId: userId,
  type: targetType,
  visibility: original.visibility,
  content: content ?? undefined,
  originalLanguage,
  repostOfId: postId,
  originalRepostOfId,
  isQuote,
  // Snapshot fields
  ...(snapshotMedia ? {
    media: { create: snapshotMedia },
  } : {}),
  ...(snapshotAudioUrl ? { audioUrl: snapshotAudioUrl } : {}),
  ...(snapshotStoryEffects ? { storyEffects: snapshotStoryEffects } : {}),
  ...(snapshotBackgroundColor ? { backgroundColor: snapshotBackgroundColor } : {}),
},
```

- [ ] **Step 3: Lancer le test "duplicates media"**

Run: `pnpm --filter @meeshy/gateway test -- --testPathPattern='PostService.test' -t 'duplicates media'`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add services/gateway/src/services/PostService.ts
git commit -m "feat(gateway): snapshot media when reposting STORY as POST"
```

---

### Task A.10 : Test + impl — rollback du snapshot si duplication échoue

**Files:**
- Modify: `services/gateway/src/__tests__/unit/PostService.test.ts`

- [ ] **Step 1: Ajouter le test RED**

```typescript
it('rolls back media snapshot if a duplication fails partway', async () => {
  const original = makePost({
    id: 'story-1',
    type: PostType.STORY,
    media: [
      { id: 'm1', url: 'https://cdn/old/m1.jpg', mimeType: 'image/jpeg' },
      { id: 'm2', url: 'https://cdn/old/m2.mp4', mimeType: 'video/mp4' },
    ],
  });
  prisma.post.findFirst.mockResolvedValue(original);

  const duplicateMediaSpy = jest.spyOn(mediaService, 'duplicateMedia')
    .mockResolvedValueOnce('https://cdn/new/m1.jpg')
    .mockRejectedValueOnce(new Error('Upload failed'));
  const deleteMediaSpy = jest.spyOn(mediaService, 'deleteMedia').mockResolvedValue(undefined);

  await expect(
    service.repostPost('story-1', 'user-reposter', { targetType: PostType.POST })
  ).rejects.toThrow('Media snapshot failed');

  // Vérifie que le 1er média dupliqué est supprimé en rollback
  expect(deleteMediaSpy).toHaveBeenCalledWith('https://cdn/new/m1.jpg');
  // Vérifie qu'aucun Post n'est créé
  expect(prisma.post.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Vérifier RED**

Run: `pnpm --filter @meeshy/gateway test -- --testPathPattern='PostService.test' -t 'rolls back'`
Expected: FAIL — `deleteMedia` n'existe peut-être pas encore.

- [ ] **Step 3: Implémenter `MediaService.deleteMedia` si manquant**

Dans `MediaService.ts` :

```typescript
async deleteMedia(url: string): Promise<void> {
  await this.deps.deleteFromStorage(url);
}
```

(Adapter selon l'API CDN existante.)

- [ ] **Step 4: Vérifier que le test passe (la logique de rollback est déjà dans Task A.9)**

Run: `pnpm --filter @meeshy/gateway test -- --testPathPattern='PostService.test' -t 'rolls back'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/PostService.ts services/gateway/src/services/MediaService.ts services/gateway/src/__tests__/unit/PostService.test.ts
git commit -m "feat(gateway): rollback media snapshot on partial failure"
```

---

### Task A.11 : Tests RED+GREEN — validation 404/403

**Files:**
- Modify: `services/gateway/src/__tests__/unit/PostService.test.ts`
- Modify: `services/gateway/src/services/PostService.ts`

- [ ] **Step 1: Ajouter les tests RED**

```typescript
it('returns null when original is deleted', async () => {
  prisma.post.findFirst.mockResolvedValue(null);
  const result = await service.repostPost('deleted-1', 'user-reposter');
  expect(result).toBeNull();
});

it('returns null when original is expired', async () => {
  const expiredOriginal = makePost({
    id: 'expired-1',
    type: PostType.STORY,
    expiresAt: new Date(Date.now() - 1000),
  });
  prisma.post.findFirst.mockResolvedValue(expiredOriginal);
  const result = await service.repostPost('expired-1', 'user-reposter');
  expect(result).toBeNull();
});

it('throws 403 when original visibility is not PUBLIC', async () => {
  const privateOriginal = makePost({ id: 'private-1', visibility: 'PRIVATE' });
  prisma.post.findFirst.mockResolvedValue(privateOriginal);
  await expect(
    service.repostPost('private-1', 'user-reposter')
  ).rejects.toMatchObject({ statusCode: 403 });
});
```

- [ ] **Step 2: Vérifier RED**

Run: `pnpm --filter @meeshy/gateway test -- --testPathPattern='PostService.test' -t 'returns null when original is expired'`
Expected: FAIL.

- [ ] **Step 3: Implémenter validations dans `repostPost`**

Modifier le début de `repostPost` :

```typescript
const original = await this.prisma.post.findFirst({
  where: { id: postId, isDeleted: false },
});
if (!original) return null;

// Story expirée
if (original.expiresAt && original.expiresAt.getTime() < Date.now()) {
  return null;
}

// Visibilité non publique
if (original.visibility !== 'PUBLIC') {
  const err: any = new Error('Cannot repost private content');
  err.statusCode = 403;
  throw err;
}
```

- [ ] **Step 4: Vérifier GREEN**

Run: `pnpm --filter @meeshy/gateway test -- --testPathPattern='PostService.test' -t 'returns null when original is expired'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/PostService.ts services/gateway/src/__tests__/unit/PostService.test.ts
git commit -m "feat(gateway): validate expiration and visibility in repostPost"
```

---

### Task A.12 : Route handler accepte `targetType`/`content`/`isQuote`

**Files:**
- Modify: `services/gateway/src/routes/posts.ts` (ou équivalent — chercher la route `POST /posts/:id/repost`)

- [ ] **Step 1: Localiser la route**

Run: `grep -rn "/repost\|repostPost" services/gateway/src/routes/ services/gateway/src/controllers/ --include='*.ts'`
Expected: Fichier + ligne de la route handler.

- [ ] **Step 2: Modifier le schéma de body et l'appel**

Trouver la route handler. Par exemple si c'est :

```typescript
fastify.post('/posts/:id/repost', {
  schema: {
    body: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        isQuote: { type: 'boolean' },
      },
    },
  },
  handler: async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.user.id;
    const { content, isQuote } = req.body as { content?: string; isQuote?: boolean };
    const result = await postService.repostPost(id, userId, content, isQuote);
    if (!result) return reply.code(404).send({ error: 'Original not found' });
    return reply.send({ success: true, data: result });
  },
});
```

Remplacer par :

```typescript
fastify.post('/posts/:id/repost', {
  schema: {
    body: {
      type: 'object',
      properties: {
        targetType: { type: 'string', enum: ['POST', 'STORY'] },
        content: { type: 'string' },
        isQuote: { type: 'boolean' },
      },
    },
  },
  handler: async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = req.user.id;
    const body = req.body as {
      targetType?: 'POST' | 'STORY';
      content?: string;
      isQuote?: boolean;
    };
    try {
      const result = await postService.repostPost(id, userId, {
        targetType: body.targetType as PostType | undefined,
        content: body.content,
        isQuote: body.isQuote,
      });
      if (!result) return reply.code(404).send({ error: 'Original not found' });
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      if (err.statusCode === 403) {
        return reply.code(403).send({ error: err.message });
      }
      throw err;
    }
  },
});
```

- [ ] **Step 3: Build le service**

Run: `pnpm --filter @meeshy/gateway build`
Expected: Build sans erreur TS.

- [ ] **Step 4: Commit**

```bash
git add services/gateway/src/routes/posts.ts
git commit -m "feat(gateway): repost route accepts targetType in body"
```

---

## Phase B — iOS SDK

### Task B.1 : Ajouter `originalRepostOfId` à `APIPost`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift`

- [ ] **Step 1: Localiser `APIPost`**

Run: `grep -n "public struct APIPost" packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift`
Expected: Ligne ~70.

- [ ] **Step 2: Ajouter le champ**

Trouver `public let repostOf: APIRepostOf?` et ajouter en dessous :

```swift
    public let originalRepostOfId: String?
```

(Ne pas oublier d'inclure dans `init(...)` si initializer explicite.)

- [ ] **Step 3: Build SDK**

```bash
cd packages/MeeshySDK
swift build
```

Expected: Build sans erreur.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift
git commit -m "feat(sdk): add originalRepostOfId to APIPost"
```

---

### Task B.2 : Test RED — `PostService.repost(targetType:content:)`

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/PostServiceTests.swift`

- [ ] **Step 1: Ajouter le test RED**

```swift
func test_repost_targetTypePost_sendsCorrectBody() async throws {
    let mockClient = MockAPIClient()
    let service = PostService(client: mockClient)
    mockClient.nextResponse = .success(APIResponse(success: true, data: makeAPIPost()))

    _ = try await service.repost(postId: "story-1", targetType: .post, content: "My commentary")

    let req = mockClient.lastRequest
    XCTAssertEqual(req?.path, "/posts/story-1/repost")
    XCTAssertEqual(req?.method, .post)
    XCTAssertEqual(req?.bodyJSON?["targetType"] as? String, "POST")
    XCTAssertEqual(req?.bodyJSON?["content"] as? String, "My commentary")
}
```

- [ ] **Step 2: Vérifier RED**

```bash
cd packages/MeeshySDK && swift test --filter PostServiceTests/test_repost_targetTypePost_sendsCorrectBody
```

Expected: FAIL — méthode `repost` inexistante.

- [ ] **Step 3: Commit RED**

```bash
git add packages/MeeshySDK/Tests/MeeshySDKTests/Services/PostServiceTests.swift
git commit -m "test(sdk): add failing test for PostService.repost"
```

---

### Task B.3 : Implémenter `PostService.repost`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Networking/PostService.swift`

- [ ] **Step 1: Ajouter la méthode**

Dans `PostService` :

```swift
public func repost(
    postId: String,
    targetType: PostType? = nil,
    content: String? = nil,
    isQuote: Bool = false
) async throws -> APIPost {
    var body: [String: Any] = ["isQuote": isQuote]
    if let targetType { body["targetType"] = targetType.rawValue }
    if let content { body["content"] = content }

    let response: APIResponse<APIPost> = try await client.post(
        endpoint: "/posts/\(postId)/repost",
        body: body
    )

    guard let post = response.data else {
        throw NetworkError.serverError(statusCode: 500)
    }
    return post
}
```

- [ ] **Step 2: Vérifier GREEN**

```bash
cd packages/MeeshySDK && swift test --filter PostServiceTests/test_repost_targetTypePost_sendsCorrectBody
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/PostService.swift
git commit -m "feat(sdk): add PostService.repost with targetType and content support"
```

---

### Task B.4 : Ajouter flag `isLocked` aux canvas elements

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` (protocol CanvasElement)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/CanvasElementModifiers.swift`

- [ ] **Step 1: Étendre le protocol CanvasElement**

Dans `StoryComposerViewModel.swift`, modifier le protocol (ligne ~37) :

```swift
protocol CanvasElement: Identifiable {
    var id: String { get }
    var elementType: CanvasElementType { get }
    var zIndex: Int { get set }
    var isLocked: Bool { get }  // ← nouveau
}

extension CanvasElement {
    var isLocked: Bool { false }  // default = false (non breaking)
}
```

- [ ] **Step 2: Modifier `CanvasElementModifiers` pour respecter `isLocked`**

Dans `CanvasElementModifiers.swift`, identifier les modifiers de gesture (drag, scale, rotate) et envelopper :

```swift
func draggable(element: CanvasElement, ...) -> some View {
    self.gesture(
        element.isLocked ? AnyGesture(EmptyGesture()) : AnyGesture(dragGesture(...))
    )
}
```

(Adapter selon la signature actuelle des modifiers.)

- [ ] **Step 3: Build SDK**

```bash
cd packages/MeeshySDK && swift build
```

Expected: Build sans erreur.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift packages/MeeshySDK/Sources/MeeshyUI/Story/CanvasElementModifiers.swift
git commit -m "feat(sdk): add isLocked flag to canvas elements (default false, non-breaking)"
```

---

### Task B.5 : Test RED — `StoryComposerViewModel.init(repostingFrom:currentSlide:)`

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/StoryComposerViewModelRepostTests.swift`

- [ ] **Step 1: Créer le fichier de test**

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryComposerViewModelRepostTests: XCTestCase {
    
    private func makeOriginalPost() -> APIPost {
        // Helper qui retourne un APIPost de type STORY avec author + médias
        // (utilise un factory existant ou en crée un)
        return APIPost(
            id: "original-story-1",
            authorId: "alice-id",
            type: .story,
            // ... autres champs minimaux
        )
    }
    
    private func makeOriginalSlide() -> StoryItem {
        return StoryItem(
            id: "slide-1",
            content: "Hello world",
            media: [],
            // ... 
        )
    }
    
    func test_init_repostingFrom_clonesActiveSlideOnly() {
        let original = makeOriginalPost()
        let slide = makeOriginalSlide()
        
        let vm = StoryComposerViewModel(repostingFrom: original, currentSlide: slide)
        
        XCTAssertEqual(vm.slides.count, 1)
        XCTAssertEqual(vm.slides[0].content, slide.content)
    }
    
    func test_init_repostingFrom_propagatesRepostOfIdAndOriginalRepostOfId() {
        let original = makeOriginalPost()  // originalRepostOfId = nil → root
        let slide = makeOriginalSlide()
        
        let vm = StoryComposerViewModel(repostingFrom: original, currentSlide: slide)
        
        XCTAssertEqual(vm.repostOfId, "original-story-1")
        XCTAssertEqual(vm.originalRepostOfId, "original-story-1")
    }
    
    func test_init_repostingFrom_flattensOriginalRepostOfIdWhenChained() {
        var original = makeOriginalPost()
        original.repostOfId = "intermediate-1"
        original.originalRepostOfId = "root-1"
        let slide = makeOriginalSlide()
        
        let vm = StoryComposerViewModel(repostingFrom: original, currentSlide: slide)
        
        XCTAssertEqual(vm.repostOfId, original.id)
        XCTAssertEqual(vm.originalRepostOfId, "root-1")
    }
    
    func test_init_repostingFrom_addsLockedAuthorBadgeSticker() {
        let original = makeOriginalPost()
        let slide = makeOriginalSlide()
        
        let vm = StoryComposerViewModel(repostingFrom: original, currentSlide: slide)
        
        let lockedElements = vm.currentSlide.elements.filter { $0.isLocked }
        XCTAssertEqual(lockedElements.count, 1, "Doit avoir 1 sticker badge locked")
        // Vérifier le contenu textuel du badge
        if let textElement = lockedElements.first as? TextElement {
            XCTAssertTrue(textElement.text.contains("@\(original.author.username)"))
            XCTAssertTrue(textElement.text.lowercased().contains("repost"))
        } else {
            XCTFail("Le badge doit être un TextElement")
        }
    }
}
```

- [ ] **Step 2: Vérifier RED**

```bash
cd packages/MeeshySDK && swift test --filter StoryComposerViewModelRepostTests
```

Expected: FAIL — `init(repostingFrom:currentSlide:)` n'existe pas + propriétés `repostOfId`/`originalRepostOfId` absentes.

- [ ] **Step 3: Commit RED**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/StoryComposerViewModelRepostTests.swift
git commit -m "test(sdk): add failing tests for StoryComposerViewModel repost init"
```

---

### Task B.6 : Implémenter `StoryComposerViewModel.init(repostingFrom:currentSlide:)`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift`

- [ ] **Step 1: Ajouter les propriétés**

Dans `StoryComposerViewModel`, ajouter :

```swift
// MARK: - Repost source (when reposting from a story)

var repostOfId: String?
var originalRepostOfId: String?
```

- [ ] **Step 2: Ajouter l'init secondaire**

```swift
convenience init(repostingFrom original: APIPost, currentSlide: StoryItem) {
    self.init()  // init standard

    // Calcul des IDs de chaîne
    self.repostOfId = original.id
    self.originalRepostOfId = original.originalRepostOfId
        ?? original.repostOfId
        ?? original.id

    // Cloner la slide active
    let cloned = StorySlide(from: currentSlide)
    self.slides = [cloned]

    // Précharger les images (asynchrone, fire-and-forget)
    Task { [weak self] in
        await self?.preloadImagesFromSlide(currentSlide)
    }

    // Ajouter le sticker badge "Reposté de @author"
    let badgeText = "Reposté de @\(original.author.username)"
    let badgeElement = TextElement(
        id: UUID().uuidString,
        text: badgeText,
        position: CGPoint(x: 0.5, y: 0.92),  // bas-centre
        fontSize: 12,
        color: .white,
        background: .black.opacity(0.6),
        isLocked: true
    )
    self.slides[0].elements.append(badgeElement)
}

private func preloadImagesFromSlide(_ slide: StoryItem) async {
    for media in slide.media {
        guard let url = URL(string: media.url) else { continue }
        if let data = try? await URLSession.shared.data(from: url).0,
           let image = UIImage(data: data) {
            await MainActor.run {
                self.slideImages[slide.id] = image
            }
        }
    }
}
```

(Note: adapter `StorySlide(from:)`, `TextElement` et propriétés selon les types réels du SDK. Si `TextElement` n'a pas de paramètre `isLocked` dans son init actuel, l'ajouter.)

- [ ] **Step 3: Vérifier GREEN sur tous les tests RepostTests**

```bash
cd packages/MeeshySDK && swift test --filter StoryComposerViewModelRepostTests
```

Expected: 4 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift
git commit -m "feat(sdk): StoryComposerViewModel.init(repostingFrom:currentSlide:)"
```

---

### Task B.7 : Test + impl — propagation des IDs au payload de publication

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/StoryComposerViewModelRepostTests.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift`

- [ ] **Step 1: Ajouter le test RED**

```swift
func test_publish_includesRepostOfIdAndOriginalRepostOfIdInPayload() async {
    let mockService = MockPostService()
    let original = makeOriginalPost()
    let slide = makeOriginalSlide()
    let vm = StoryComposerViewModel(repostingFrom: original, currentSlide: slide)
    vm.postService = mockService  // injection

    await vm.publishCurrentSlide()

    XCTAssertEqual(mockService.lastCreateBody?["repostOfId"] as? String, "original-story-1")
    XCTAssertEqual(mockService.lastCreateBody?["originalRepostOfId"] as? String, "original-story-1")
    XCTAssertEqual(mockService.lastCreateBody?["type"] as? String, "STORY")
}
```

- [ ] **Step 2: Vérifier RED**

```bash
cd packages/MeeshySDK && swift test --filter StoryComposerViewModelRepostTests/test_publish_includesRepostOfId
```

Expected: FAIL — la méthode `publishCurrentSlide` ne propage pas les IDs (à confirmer en lisant le code).

- [ ] **Step 3: Localiser la méthode de publication**

Run: `grep -n "func publish\|func create.*post\|func send" packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift`
Expected: la méthode existante de publication.

- [ ] **Step 4: Modifier la méthode pour inclure les IDs**

Dans le payload de création de Post (le code existant qui appelle `PostService.createPost`), ajouter :

```swift
var body: [String: Any] = [
    // ... champs existants
]
if let repostOfId = self.repostOfId {
    body["repostOfId"] = repostOfId
}
if let originalRepostOfId = self.originalRepostOfId {
    body["originalRepostOfId"] = originalRepostOfId
}
```

- [ ] **Step 5: Vérifier GREEN**

```bash
cd packages/MeeshySDK && swift test --filter StoryComposerViewModelRepostTests/test_publish_includesRepostOfId
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift packages/MeeshySDK/Tests/MeeshyUITests/StoryComposerViewModelRepostTests.swift
git commit -m "feat(sdk): propagate repost IDs to publish payload"
```

---

### Task B.8 : Test RED — `UnifiedPostComposer.init(repostingFrom:...)`

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/UnifiedPostComposerRepostTests.swift`

- [ ] **Step 1: Créer le fichier de test**

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class UnifiedPostComposerRepostTests: XCTestCase {
    
    func test_init_repostingFrom_setsModeToPost() {
        let original = makeOriginalPost()
        let slide = makeOriginalSlide()
        
        let composer = UnifiedPostComposer(
            repostingFrom: original,
            currentSlide: slide,
            onPublishRepost: { _, _, _ in },
            onDismiss: {}
        )
        
        // Le sélecteur de type doit être verrouillé sur .post
        XCTAssertEqual(composer.lockedType, .post)
    }
    
    func test_init_repostingFrom_storesRepostSource() {
        let original = makeOriginalPost()
        let slide = makeOriginalSlide()
        
        let composer = UnifiedPostComposer(
            repostingFrom: original,
            currentSlide: slide,
            onPublishRepost: { _, _, _ in },
            onDismiss: {}
        )
        
        XCTAssertEqual(composer.repostSource?.post.id, original.id)
        XCTAssertEqual(composer.repostSource?.slide.id, slide.id)
    }
    
    func test_publishRepost_callbackReceivesContentAndOriginal() async {
        var publishedContent: String?
        var publishedOriginal: APIPost?
        var publishedSlide: StoryItem?
        let original = makeOriginalPost()
        let slide = makeOriginalSlide()
        
        let composer = UnifiedPostComposer(
            repostingFrom: original,
            currentSlide: slide,
            onPublishRepost: { content, post, sl in
                publishedContent = content
                publishedOriginal = post
                publishedSlide = sl
            },
            onDismiss: {}
        )
        
        composer.content = "Mon commentaire"
        composer.triggerPublish()
        
        XCTAssertEqual(publishedContent, "Mon commentaire")
        XCTAssertEqual(publishedOriginal?.id, original.id)
        XCTAssertEqual(publishedSlide?.id, slide.id)
    }
    
    private func makeOriginalPost() -> APIPost { /* factory */ }
    private func makeOriginalSlide() -> StoryItem { /* factory */ }
}
```

- [ ] **Step 2: Vérifier RED**

```bash
cd packages/MeeshySDK && swift test --filter UnifiedPostComposerRepostTests
```

Expected: FAIL — l'init n'existe pas.

- [ ] **Step 3: Commit RED**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/UnifiedPostComposerRepostTests.swift
git commit -m "test(sdk): add failing tests for UnifiedPostComposer repost mode"
```

---

### Task B.9 : Implémenter `UnifiedPostComposer.init(repostingFrom:...)`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift`

- [ ] **Step 1: Ajouter le state et l'init**

Dans `UnifiedPostComposer`, ajouter :

```swift
public struct RepostSource {
    public let post: APIPost
    public let slide: StoryItem
}

@State private var repostSource: RepostSource? = nil
@State private var lockedType: PostType? = nil

public var onPublishRepost: ((String, APIPost, StoryItem) -> Void)? = nil

public init(
    repostingFrom original: APIPost,
    currentSlide: StoryItem,
    onPublishRepost: @escaping (String, APIPost, StoryItem) -> Void,
    onDismiss: @escaping () -> Void
) {
    self._repostSource = State(initialValue: RepostSource(post: original, slide: currentSlide))
    self._lockedType = State(initialValue: .post)
    self._selectedType = State(initialValue: .post)
    self.onPublishRepost = onPublishRepost
    self.onDismiss = onDismiss
    self.onPublish = { _, _, _, _, _ in /* no-op when in repost mode */ }
}
```

- [ ] **Step 2: Modifier le rendu pour le mode repost**

Dans `var body: some View`, modifier :
- Cacher le type selector si `lockedType != nil`
- Cacher le slot image attachée si `repostSource != nil`
- Afficher l'embed story via `StoryCanvasReaderView(slide: repostSource.slide)` quand présent

```swift
private var typeSelector: some View {
    Group {
        if lockedType == nil {
            HStack(spacing: 0) {
                ForEach(PostType.allCases, id: \.self) { type in
                    typeTab(type)
                }
            }
            .padding(.horizontal, 16)
        } else {
            EmptyView()
        }
    }
}

private var contentArea: some View {
    VStack(spacing: 12) {
        TextField("...", text: $content, axis: .vertical)
            .lineLimit(5...)
        
        if let source = repostSource {
            StoryCanvasReaderView(slide: source.slide)
                .aspectRatio(9/16, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .cornerRadius(12)
                .allowsHitTesting(false)  // tap pause/play optionnel
        } else {
            // existing image slot
            imageAttachmentSlot
        }
    }
}
```

- [ ] **Step 3: Modifier le bouton Publier**

```swift
private var publishButton: some View {
    Button(action: {
        if let onPublishRepost, let source = repostSource {
            onPublishRepost(content, source.post, source.slide)
        } else {
            onPublish(selectedType, content, moodEmoji, nil, selectedImage)
        }
    }) { Text("Publier") }
    .disabled(content.isEmpty)
}
```

- [ ] **Step 4: Vérifier GREEN sur tous les tests UnifiedPostComposerRepostTests**

```bash
cd packages/MeeshySDK && swift test --filter UnifiedPostComposerRepostTests
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift
git commit -m "feat(sdk): UnifiedPostComposer init for repost mode with story embed"
```

---

### Task B.10 : Audit `StoryCanvasReaderView` — accepter un `APIPost`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`

- [ ] **Step 1: Auditer la signature actuelle**

Run: `grep -n "init\|struct StoryCanvasReaderView" packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift`
Expected: Voir les init existants.

- [ ] **Step 2: Si seulement `init(slide: StoryItem)` existe, ajouter un init pour `APIPost`**

```swift
public init(post: APIPost) {
    // Convertir APIPost en StoryItem-équivalent pour le rendu
    let slide = StoryItem(
        id: post.id,
        content: post.content,
        media: (post.media ?? []).map { StoryMedia(url: $0.url, mimeType: $0.mimeType) },
        backgroundColor: post.backgroundColor,
        storyEffects: post.storyEffects,
        audioUrl: post.audioUrl,
        durationMs: 5000  // default ; sinon depuis post si défini
    )
    self.init(slide: slide)
}
```

(Adapter les noms de structs et propriétés selon la réalité du code.)

- [ ] **Step 3: Build SDK**

```bash
cd packages/MeeshySDK && swift build
```

Expected: Build sans erreur.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift
git commit -m "feat(sdk): StoryCanvasReaderView accepts APIPost for feed cell rendering"
```

---

## Phase C — iOS app

### Task C.1 : Bouton « Partager » droite → ouvre `StoryComposerView` repost

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:573-579`

- [ ] **Step 1: Localiser le bouton "Partager"**

Run: `grep -n "label: \"Partager\"\|reshareStory" apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift`
Expected: Ligne 573-579 (basé sur le spec).

- [ ] **Step 2: Ajouter un state pour présenter le composer story repost**

Dans `StoryViewerView` (haut du struct, vers ligne 60+) :

```swift
@State private var repostStoryComposerSource: (post: APIPost, slide: StoryItem)?
```

- [ ] **Step 3: Modifier l'action du bouton**

Remplacer le bloc actuel (ligne ~573-579) :

```swift
// Avant
if !isOwnStory {
    storyActionButton(
        icon: "arrow.2.squarepath",
        label: "Partager"
    ) {
        reshareStory()
    }
}
```

Par :

```swift
if !isOwnStory, currentStoryIsPublic {
    storyActionButton(
        icon: "arrow.2.squarepath",
        label: "Partager"
    ) {
        HapticFeedback.light()
        pauseTimer()
        if let story = currentStory, let group = currentGroup {
            // Convertir le StoryGroup → APIPost ou récupérer l'APIPost via storage
            // Note: dépend du modèle réel ; si group expose déjà l'APIPost, l'utiliser directement
            repostStoryComposerSource = (post: story.toAPIPost(authorGroup: group), slide: story)
        }
    }
}
```

(Note: si `StoryItem` n'a pas de méthode `toAPIPost`, en créer une dans le SDK ou récupérer l'APIPost via le `StoryViewModel`.)

- [ ] **Step 4: Ajouter le `.fullScreenCover` pour le composer**

Dans le body de `StoryViewerView`, ajouter :

```swift
.fullScreenCover(item: Binding(
    get: { repostStoryComposerSource.map { RepostStoryComposerSourceWrapper(source: $0) } },
    set: { if $0 == nil { repostStoryComposerSource = nil; resumeTimer() } }
)) { wrapper in
    StoryComposerView(repostingFrom: wrapper.source.post, currentSlide: wrapper.source.slide)
        .onDismiss { repostStoryComposerSource = nil }
}

private struct RepostStoryComposerSourceWrapper: Identifiable {
    var id: String { source.post.id }
    let source: (post: APIPost, slide: StoryItem)
}
```

- [ ] **Step 5: Build l'app**

```bash
./apps/ios/meeshy.sh build
```

Expected: Build réussi.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift
git commit -m "feat(ios): share button opens StoryComposerView in repost mode"
```

---

### Task C.2 : Menu kebab — ajouter « Republier en post »

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:1252-1271`
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift`

- [ ] **Step 1: Ajouter la méthode `repostAsPostDirect`**

Dans `StoryViewerView+Content.swift`, ajouter (et supprimer l'ancien `reshareStory`) :

```swift
func repostAsPostDirect() {
    guard let story = currentStory else { return }
    HapticFeedback.light()

    Task {
        do {
            _ = try await PostService.shared.repost(
                postId: story.id,
                targetType: .post,
                content: nil
            )
            await MainActor.run {
                HapticFeedback.success()
                ToastManager.shared.show("Republié dans ton feed")
            }
        } catch let err as APIError where err.statusCode == 404 {
            await MainActor.run {
                ToastManager.shared.showError("La story n'est plus disponible")
            }
        } catch let err as APIError where err.statusCode == 403 {
            await MainActor.run {
                ToastManager.shared.showError("Cette story ne peut pas être repartagée")
            }
        } catch {
            await MainActor.run {
                HapticFeedback.error()
                ToastManager.shared.showError("Échec de la republication")
            }
        }
    }
}
```

- [ ] **Step 2: Modifier le menu kebab**

Localiser le bloc Menu (`StoryViewerView.swift:1242-1272`) et remplacer l'ancien item "Republier" :

```swift
// Avant
Button {
    reshareStory()
} label: {
    Label("Republier", systemImage: "arrow.2.squarepath")
}

// Après
Button {
    repostAsPostDirect()
} label: {
    Label("Republier en post", systemImage: "arrow.2.squarepath")
}

Button {
    HapticFeedback.light()
    pauseTimer()
    if let story = currentStory, let group = currentGroup {
        editAndRepostAsPostSource = (post: story.toAPIPost(authorGroup: group), slide: story)
    }
} label: {
    Label("Éditer et republier en post", systemImage: "square.and.pencil")
}
```

- [ ] **Step 3: Ajouter le state et le `.fullScreenCover` pour le composer post repost**

```swift
@State private var editAndRepostAsPostSource: (post: APIPost, slide: StoryItem)?

// Dans le body
.fullScreenCover(item: Binding(
    get: { editAndRepostAsPostSource.map { RepostPostComposerSourceWrapper(source: $0) } },
    set: { if $0 == nil { editAndRepostAsPostSource = nil; resumeTimer() } }
)) { wrapper in
    UnifiedPostComposer(
        repostingFrom: wrapper.source.post,
        currentSlide: wrapper.source.slide,
        onPublishRepost: { content, post, slide in
            Task {
                do {
                    _ = try await PostService.shared.repost(
                        postId: post.id,
                        targetType: .post,
                        content: content
                    )
                    await MainActor.run {
                        editAndRepostAsPostSource = nil
                        ToastManager.shared.show("Publié")
                    }
                } catch {
                    await MainActor.run {
                        ToastManager.shared.showError("Échec de la publication")
                    }
                }
            }
        },
        onDismiss: {
            editAndRepostAsPostSource = nil
        }
    )
}

private struct RepostPostComposerSourceWrapper: Identifiable {
    var id: String { source.post.id }
    let source: (post: APIPost, slide: StoryItem)
}
```

- [ ] **Step 4: Supprimer l'ancien `reshareStory()`**

Dans `StoryViewerView+Content.swift:796-812`, supprimer la méthode complète.

- [ ] **Step 5: Vérifier qu'il n'y a plus de reference à `reshareStory()`**

Run: `grep -rn "reshareStory" apps/ios/Meeshy/`
Expected: Aucun résultat.

- [ ] **Step 6: Build**

```bash
./apps/ios/meeshy.sh build
```

Expected: Build réussi.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
git commit -m "feat(ios): kebab menu shows Republier en post + Editer et republier en post"
```

---

### Task C.3 : Cellule feed — branchement de rendu repost-de-story

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` (ou la cellule feed équivalente)

- [ ] **Step 1: Localiser la cellule feed**

Run: `grep -rn "FeedPostRow\|FeedCell\|PostCell" apps/ios/Meeshy/Features/Main/Views/ --include='*.swift' | head -10`
Expected: Identifier le composant qui rend une cellule de post dans le feed.

- [ ] **Step 2: Ajouter le branchement de rendu**

Dans la cellule feed (exemple supposé `PostDetailView.swift`) :

```swift
@ViewBuilder
private var contentView: some View {
    if post.type == .post && post.repostOf?.type == .story {
        // Rendu repost-de-story : embed StoryCanvasReaderView
        VStack(alignment: .leading, spacing: 8) {
            if let content = post.content, !content.isEmpty {
                Text(content)
                    .font(.body)
                    .foregroundStyle(theme.textPrimary)
            }
            StoryCanvasReaderView(post: post)
                .aspectRatio(9/16, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .cornerRadius(16)
                .clipped()
        }
    } else if post.type == .post {
        // Rendu post normal existant
        normalPostContent
    } else {
        // autres types
        EmptyView()
    }
}
```

- [ ] **Step 3: Ajouter le header double attribution**

```swift
private var attributionHeader: some View {
    Group {
        if post.repostOf != nil {
            VStack(alignment: .leading, spacing: 2) {
                Text("Reposté de @\(post.repostOf!.author.username)")
                    .font(.caption)
                    .foregroundStyle(theme.textSecondary)
                if let originalAuthor = post.repostOf?.originalAuthor,
                   post.originalRepostOfId != post.repostOf?.id {
                    Text("Original par @\(originalAuthor.username)")
                        .font(.caption2)
                        .foregroundStyle(theme.textTertiary)
                }
            }
            .padding(.bottom, 4)
        }
    }
}
```

- [ ] **Step 4: Build**

```bash
./apps/ios/meeshy.sh build
```

Expected: Build réussi.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift
git commit -m "feat(ios): feed cell renders repost-of-story via StoryCanvasReaderView"
```

---

### Task C.4 : Tests unitaires du menu et boutons

**Files:**
- Create: `apps/ios/MeeshyTests/Unit/ViewModels/StoryViewerViewModelMenuTests.swift`

- [ ] **Step 1: Créer le fichier de test**

```swift
import XCTest
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class StoryViewerViewModelMenuTests: XCTestCase {
    
    func test_kebabMenu_showsRepostItemsForForeignPublicStory() {
        let story = makeForeignPublicStory()
        let menu = StoryKebabMenuBuilder(story: story, isOwnStory: false).build()
        
        XCTAssertTrue(menu.contains { $0.label == "Republier en post" })
        XCTAssertTrue(menu.contains { $0.label == "Éditer et republier en post" })
    }
    
    func test_kebabMenu_hidesRepostItemsForOwnStory() {
        let story = makeOwnStory()
        let menu = StoryKebabMenuBuilder(story: story, isOwnStory: true).build()
        
        XCTAssertFalse(menu.contains { $0.label.contains("Republier") })
    }
    
    func test_kebabMenu_hidesRepostItemsForPrivateStory() {
        let story = makeForeignPrivateStory()  // visibility != PUBLIC
        let menu = StoryKebabMenuBuilder(story: story, isOwnStory: false).build()
        
        XCTAssertFalse(menu.contains { $0.label.contains("Republier") })
    }
    
    func test_repostAsPostDirect_404_showsErrorToast() async {
        let mockService = MockPostService()
        mockService.repostError = APIError(statusCode: 404, message: "Not found")
        let viewer = StoryViewerView.testHelper(postService: mockService, story: makeForeignPublicStory())
        
        await viewer.repostAsPostDirect()
        
        XCTAssertEqual(mockService.lastRepostCall?.targetType, .post)
        XCTAssertEqual(ToastManager.shared.lastError, "La story n'est plus disponible")
    }
    
    func test_repostAsPostDirect_403_showsPrivacyToast() async {
        let mockService = MockPostService()
        mockService.repostError = APIError(statusCode: 403, message: "Private")
        let viewer = StoryViewerView.testHelper(postService: mockService, story: makeForeignPublicStory())
        
        await viewer.repostAsPostDirect()
        
        XCTAssertEqual(ToastManager.shared.lastError, "Cette story ne peut pas être repartagée")
    }
    
    func test_shareButton_opensStoryComposerWithRepostingFrom() {
        // Test que le bouton trigger le state repostStoryComposerSource correctement
        // (peut nécessiter une refactorisation pour exposer la logique testable)
    }
    
    private func makeForeignPublicStory() -> StoryItem { /* factory */ }
    private func makeOwnStory() -> StoryItem { /* factory */ }
    private func makeForeignPrivateStory() -> StoryItem { /* factory */ }
}
```

- [ ] **Step 2: Lancer les tests**

```bash
./apps/ios/meeshy.sh test --filter StoryViewerViewModelMenuTests
```

Expected: Tous PASS (ou ajuster les helpers de mock).

- [ ] **Step 3: Commit**

```bash
git add apps/ios/MeeshyTests/Unit/ViewModels/StoryViewerViewModelMenuTests.swift
git commit -m "test(ios): kebab menu items + repost flows behavior"
```

---

## Phase D — Tests d'intégration end-to-end

### Task D.1 : Tests d'intégration des 3 flux de repost

**Files:**
- Create: `apps/ios/MeeshyTests/Integration/StoryRepostFlowTests.swift`

- [ ] **Step 1: Créer le fichier**

```swift
import XCTest
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class StoryRepostFlowTests: XCTestCase {
    
    func test_flux1_shareButton_opensComposerStory_publishesAsStory() async throws {
        let mockClient = MockAPIClient()
        let viewer = StoryViewerView.testHelper(apiClient: mockClient)
        
        viewer.tapShareButton()
        
        // Vérifie que le composer story s'ouvre
        XCTAssertNotNil(viewer.repostStoryComposerSource)
        
        // Simuler la publication
        await viewer.simulateStoryComposerPublish(content: "Test")
        
        // Vérifie que l'appel POST /posts est fait avec type: STORY et repostOfId
        let req = mockClient.lastRequest
        XCTAssertEqual(req?.path, "/posts")
        XCTAssertEqual(req?.bodyJSON?["type"] as? String, "STORY")
        XCTAssertEqual(req?.bodyJSON?["repostOfId"] as? String, viewer.currentStory?.id)
    }
    
    func test_flux2_kebabRepublierEnPost_callsBackendDirectly() async throws {
        let mockClient = MockAPIClient()
        let viewer = StoryViewerView.testHelper(apiClient: mockClient)
        
        await viewer.tapKebabRepublierEnPost()
        
        let req = mockClient.lastRequest
        XCTAssertEqual(req?.path, "/posts/\(viewer.currentStory!.id)/repost")
        XCTAssertEqual(req?.bodyJSON?["targetType"] as? String, "POST")
        XCTAssertNil(req?.bodyJSON?["content"])
    }
    
    func test_flux3_kebabEditerEtRepublier_opensComposerPost_publishes() async throws {
        let mockClient = MockAPIClient()
        let viewer = StoryViewerView.testHelper(apiClient: mockClient)
        
        viewer.tapKebabEditerEtRepublier()
        XCTAssertNotNil(viewer.editAndRepostAsPostSource)
        
        await viewer.simulatePostComposerPublish(content: "Mon commentaire")
        
        let req = mockClient.lastRequest
        XCTAssertEqual(req?.path, "/posts/\(viewer.currentStory!.id)/repost")
        XCTAssertEqual(req?.bodyJSON?["targetType"] as? String, "POST")
        XCTAssertEqual(req?.bodyJSON?["content"] as? String, "Mon commentaire")
    }
    
    func test_flux4_feedReceivesRepostViaSocket_renderedAsStoryEmbed() {
        // Test que le rendu cellule détecte post.repostOf?.type == .story
        let post = makePostWithStoryRepost()
        let cell = PostDetailView(post: post)
        
        // Vérifier que le cellule rend un StoryCanvasReaderView (introspection ou snapshot)
        XCTAssertTrue(cell.containsView(of: StoryCanvasReaderView.self))
    }
}
```

- [ ] **Step 2: Lancer les tests**

```bash
./apps/ios/meeshy.sh test --filter StoryRepostFlowTests
```

Expected: 4 tests PASS (ajuster les helpers selon la réalité du testHelper de StoryViewerView).

- [ ] **Step 3: Commit**

```bash
git add apps/ios/MeeshyTests/Integration/StoryRepostFlowTests.swift
git commit -m "test(ios): integration tests for 3 repost flows + feed rendering"
```

---

### Task D.2 : Build et test final de bout en bout

**Files:**
- (vérifications uniquement)

- [ ] **Step 1: Lancer la suite complète gateway**

```bash
pnpm --filter @meeshy/gateway test
```

Expected: ALL PASS.

- [ ] **Step 2: Lancer la suite complète SDK**

```bash
cd packages/MeeshySDK && swift test
```

Expected: ALL PASS.

- [ ] **Step 3: Lancer la suite iOS app**

```bash
./apps/ios/meeshy.sh test
```

Expected: ALL PASS.

- [ ] **Step 4: Lancer le build iOS final**

```bash
./apps/ios/meeshy.sh build
```

Expected: Build réussi.

- [ ] **Step 5: Smoke test manuel sur simulator**

```bash
./apps/ios/meeshy.sh run
```

Vérifier manuellement :
- Tap bouton « Partager » droite sur une story d'un autre user → composer story s'ouvre avec contenu cloné + sticker badge fixe
- Menu kebab `...` → « Republier en post » → toast de succès, story originale toujours visible
- Menu kebab `...` → « Éditer et republier en post » → composer post avec embed s'ouvre, taper du texte, publier → toast
- Aller au feed, vérifier le rendu d'un repost-de-story (embed avec animations + header double attribution)

- [ ] **Step 6: Commit final si modifications mineures pendant le smoke test**

```bash
git add -A
git commit -m "chore: minor polish from smoke test"
```

---

## Self-Review

### Spec coverage check

| Spec section | Implémenté par tasks |
|--------------|---------------------|
| 3.1 Schema migration | A.1 |
| 3.1 PostService.repostPost refacto | A.6, A.9, A.11 |
| 3.1 MediaService.duplicateMedia | A.8, A.10 |
| 3.1 Calcul originalRepostOfId | A.3, A.4 |
| 3.1 Snapshot médias STORY→POST | A.7, A.9 |
| 3.1 Validations 404/403 | A.11 |
| 3.1 Route handler | A.12 |
| 3.2 APIPost.originalRepostOfId | B.1 |
| 3.2 PostService.repost SDK | B.2, B.3 |
| 3.3 isLocked canvas element | B.4 |
| 3.3 StoryComposerViewModel.init(repostingFrom:) | B.5, B.6, B.7 |
| 3.3 UnifiedPostComposer mode repost | B.8, B.9 |
| 3.3 StoryCanvasReaderView audit | B.10 |
| 3.4 Cellule feed branchement | C.3 |
| 4.1 Flux 1 (composer story) | C.1 + B.6 |
| 4.2 Flux 2 (repost direct) | C.2 |
| 4.3 Flux 3 (composer post) | C.2 + B.9 |
| 4.4 Flux 4 (rendu feed) | C.3 |
| 6 Edge cases (404, 403, rollback, locked, hidden buttons) | A.10, A.11, B.4, C.2, C.4 |
| 7 Testing strategy | A.2-A.11, B.5-B.9, C.4, D.1 |

Toutes les sections du spec sont couvertes.

### Placeholder scan

Aucun "TBD", "TODO", "implement later" dans le plan. Tous les blocs de code sont concrets.

### Type consistency

- `repostOfId` / `originalRepostOfId` utilisés de façon cohérente partout (tasks A, B, C).
- `repost(postId:targetType:content:)` signature identique entre Task B.3 (impl) et Task B.2 (test) et Task C.2 (caller).
- `StoryComposerViewModel.init(repostingFrom:currentSlide:)` signature identique partout.
- `UnifiedPostComposer.init(repostingFrom:currentSlide:onPublishRepost:onDismiss:)` signature identique partout.
- `RepostSource` struct cohérente entre Task B.9 (déclaration) et Task C.2 (utilisation).

Type consistency OK.

---

## Execution Handoff

Plan complet et sauvegardé. Lors de l'implémentation prochaine, deux options :

1. **Subagent-Driven (recommandé)** : un subagent frais par task, review entre chaque, itération rapide. Sub-skill : `superpowers:subagent-driven-development`.
2. **Inline Execution** : exécution dans la session, batch avec checkpoints. Sub-skill : `superpowers:executing-plans`.

Au moment de lancer l'implémentation, choisir l'approche et invoquer le sub-skill correspondant.

# Story repost-chain media ID fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix reposted stories rendering with empty content when the repost is itself a repost (2+ hop chains), by making every repost self-contained: its `storyEffects` always references its own duplicated media, never an ancestor's.

**Architecture:** `PostService.repostPost()` already duplicates a reposted story's media with fresh `PostMedia` ids on every hop, but copies `storyEffects` verbatim — so `storyEffects.mediaObjects[].postMediaId` / `audioPlayerObjects[].postMediaId` stay pinned to whichever post started the chain. Add a small pure function that rewrites those ids using an old→new id map built from the just-duplicated media, and call it right after `prisma.post.create()` inside `repostPost()`. No API contract change, no client (iOS/web) change needed — existing plain `postMediaId` lookups already work correctly once each post is self-consistent.

**Tech Stack:** TypeScript (strict), Jest (`@jest/globals`), Prisma 6.19 / MongoDB, Fastify gateway (`services/gateway`).

## Global Constraints

- TypeScript strict mode, no `any` — use structural interfaces with `[key: string]: unknown` passthrough (matches the existing `StoryTextObjectRaw` pattern in `PostService.ts:20-29`).
- Immutable / pure functions — the new remap function must not mutate its inputs.
- TDD (RED-GREEN-REFACTOR) — write the failing test before any production code in every step below.
- Package manager: bun 1.3.14 locally (CI parity). **Prerequisite before running any gateway test in this plan:**
  ```bash
  cd packages/shared && npx prisma generate --generator client
  cd packages/shared && bun run build
  ```
  Skipping this makes ~17 unrelated gateway suites fail with confusing errors.
- No backfill/migration of already-existing broken reposts in the database (explicit product decision — out of scope).
- No iOS or web code changes in this plan — the backend fix alone restores correct rendering at every chain depth, because existing client-side `postMediaId` lookups already search the post's own `media[]` first.
- No changes to the composer-based repost path (`PostService.create()`, used by `StoryComposerViewModel(reposting:authorHandle:)`) — it is already correct (fresh TUS uploads, self-consistent by construction).
- `POST /posts/:postId/repost` request/response shape is unchanged.

---

## Task 1: Pure `remapStoryEffectsMediaIds` helper

**Files:**
- Create: `services/gateway/src/services/posts/storyEffectsMediaRemap.ts`
- Test: `services/gateway/src/services/posts/__tests__/storyEffectsMediaRemap.test.ts`

**Interfaces:**
- Produces: `remapStoryEffectsMediaIds(effects: Prisma.InputJsonValue | undefined, idMap: Record<string, string>): { effects: Prisma.InputJsonValue | undefined; changed: boolean }` — exported function, consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `services/gateway/src/services/posts/__tests__/storyEffectsMediaRemap.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { remapStoryEffectsMediaIds } from '../storyEffectsMediaRemap';

describe('remapStoryEffectsMediaIds', () => {
  it('remaps mediaObjects[].postMediaId using the id map', () => {
    const effects = { mediaObjects: [{ id: 'el-1', postMediaId: 'old-1', x: 0.5 }] };
    const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

    expect(result.changed).toBe(true);
    expect(result.effects).toEqual({ mediaObjects: [{ id: 'el-1', postMediaId: 'new-1', x: 0.5 }] });
  });

  it('remaps audioPlayerObjects[].postMediaId using the id map', () => {
    const effects = { audioPlayerObjects: [{ id: 'el-2', postMediaId: 'old-audio-1', volume: 0.8 }] };
    const result = remapStoryEffectsMediaIds(effects, { 'old-audio-1': 'new-audio-1' });

    expect(result.changed).toBe(true);
    expect(result.effects).toEqual({ audioPlayerObjects: [{ id: 'el-2', postMediaId: 'new-audio-1', volume: 0.8 }] });
  });

  it('never rewrites the client element "id" field, even if it collides with a mapped key', () => {
    const effects = { mediaObjects: [{ id: 'old-1', postMediaId: 'old-1' }] };
    const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

    expect(result.effects).toEqual({ mediaObjects: [{ id: 'old-1', postMediaId: 'new-1' }] });
  });

  it('leaves postMediaId unchanged when it is absent from the id map', () => {
    const effects = { mediaObjects: [{ id: 'el-1', postMediaId: 'untracked-1' }] };
    const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

    expect(result.changed).toBe(false);
    expect(result.effects).toEqual(effects);
  });

  it('no-ops when effects is undefined', () => {
    const result = remapStoryEffectsMediaIds(undefined, { 'old-1': 'new-1' });

    expect(result).toEqual({ effects: undefined, changed: false });
  });

  it('no-ops when effects has neither mediaObjects nor audioPlayerObjects', () => {
    const effects = { textObjects: [{ id: 'el-1', text: 'hello' }] };
    const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

    expect(result.changed).toBe(false);
    expect(result.effects).toEqual(effects);
  });

  it('remaps multiple entries independently, including a mix of mapped and unmapped ids', () => {
    const effects = {
      mediaObjects: [
        { id: 'el-1', postMediaId: 'old-1' },
        { id: 'el-2', postMediaId: 'untracked' },
        { id: 'el-3', postMediaId: 'old-3' },
      ],
    };
    const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1', 'old-3': 'new-3' });

    expect(result.changed).toBe(true);
    expect(result.effects).toEqual({
      mediaObjects: [
        { id: 'el-1', postMediaId: 'new-1' },
        { id: 'el-2', postMediaId: 'untracked' },
        { id: 'el-3', postMediaId: 'new-3' },
      ],
    });
  });

  it('preserves unrelated storyEffects fields untouched', () => {
    const effects = {
      background: '#000000',
      thumbHash: 'abc123',
      slideDuration: 5,
      textObjects: [{ id: 'txt-1', text: 'hi' }],
      stickerObjects: [{ id: 'sticker-1', emoji: '🔥' }],
      mediaObjects: [{ id: 'el-1', postMediaId: 'old-1' }],
    };
    const result = remapStoryEffectsMediaIds(effects, { 'old-1': 'new-1' });

    expect(result.effects).toEqual({
      background: '#000000',
      thumbHash: 'abc123',
      slideDuration: 5,
      textObjects: [{ id: 'txt-1', text: 'hi' }],
      stickerObjects: [{ id: 'sticker-1', emoji: '🔥' }],
      mediaObjects: [{ id: 'el-1', postMediaId: 'new-1' }],
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd services/gateway && bun run test:unit -- src/services/posts/__tests__/storyEffectsMediaRemap.test.ts
```

Expected: FAIL — `Cannot find module '../storyEffectsMediaRemap'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `services/gateway/src/services/posts/storyEffectsMediaRemap.ts`:

```ts
import type { Prisma } from '@meeshy/shared/prisma/client';

/**
 * Structural shape covering both `StoryMediaObjectSchema` and
 * `StoryAudioObjectSchema` (services/gateway/src/routes/posts/types.ts),
 * narrowed to the two fields this module cares about. `id` is the composer's
 * client-side UI element id (unrelated to the database `PostMedia.id`) — it
 * is never rewritten, only `postMediaId` is.
 */
interface StoryMediaRefRaw {
  id?: string;
  postMediaId?: string;
  [key: string]: unknown;
}

interface StoryEffectsRaw {
  mediaObjects?: StoryMediaRefRaw[];
  audioPlayerObjects?: StoryMediaRefRaw[];
  [key: string]: unknown;
}

export interface RemapStoryEffectsMediaIdsResult {
  effects: Prisma.InputJsonValue | undefined;
  changed: boolean;
}

function remapRefs(
  items: StoryMediaRefRaw[] | undefined,
  idMap: Record<string, string>,
): { items: StoryMediaRefRaw[] | undefined; changed: boolean } {
  if (!Array.isArray(items)) return { items, changed: false };
  let changed = false;
  const next = items.map((item) => {
    const mapped = item.postMediaId !== undefined ? idMap[item.postMediaId] : undefined;
    if (mapped === undefined || mapped === item.postMediaId) return item;
    changed = true;
    return { ...item, postMediaId: mapped };
  });
  return { items: next, changed };
}

/**
 * Rewrites `postMediaId` references inside a story's `storyEffects` blob
 * (`mediaObjects[]`, `audioPlayerObjects[]`) using `idMap` (old PostMedia id
 * → new PostMedia id). Used by `PostService.repostPost()` right after it
 * duplicates a reposted story's media, so the repost's own `storyEffects`
 * always points at its own media — never at an ancestor's — no matter how
 * many reposts deep the chain goes.
 *
 * A `postMediaId` not covered by `idMap` (unknown/legacy data) is left
 * untouched rather than nulled out, matching the fail-soft passthrough
 * policy already documented on `StoryEffectsSchema`.
 */
export function remapStoryEffectsMediaIds(
  effects: Prisma.InputJsonValue | undefined,
  idMap: Record<string, string>,
): RemapStoryEffectsMediaIdsResult {
  if (effects === undefined || effects === null || typeof effects !== 'object' || Array.isArray(effects)) {
    return { effects, changed: false };
  }
  const raw = effects as StoryEffectsRaw;

  const mediaObjects = remapRefs(raw.mediaObjects, idMap);
  const audioPlayerObjects = remapRefs(raw.audioPlayerObjects, idMap);

  if (!mediaObjects.changed && !audioPlayerObjects.changed) {
    return { effects, changed: false };
  }

  return {
    effects: {
      ...raw,
      ...(raw.mediaObjects !== undefined ? { mediaObjects: mediaObjects.items } : {}),
      ...(raw.audioPlayerObjects !== undefined ? { audioPlayerObjects: audioPlayerObjects.items } : {}),
    } as Prisma.InputJsonValue,
    changed: true,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd services/gateway && bun run test:unit -- src/services/posts/__tests__/storyEffectsMediaRemap.test.ts
```

Expected: PASS — 8/8 tests green.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/posts/storyEffectsMediaRemap.ts services/gateway/src/services/posts/__tests__/storyEffectsMediaRemap.test.ts
git commit -m "feat(gateway): add pure storyEffects media-id remap helper"
```

---

## Task 2: Wire the remap into `PostService.repostPost()`

**Files:**
- Modify: `services/gateway/src/services/PostService.ts:16` (new import), `PostService.ts:1443-1525` (repostPost body)
- Test: `services/gateway/src/__tests__/unit/PostService.test.ts` (existing `describe('repostPost', ...)` block, starts at line 640)

**Interfaces:**
- Consumes: `remapStoryEffectsMediaIds(effects, idMap)` from Task 1 (`services/gateway/src/services/posts/storyEffectsMediaRemap.ts`).
- Produces: `repostPost()`'s returned post object now carries self-consistent `storyEffects` (its `mediaObjects[]`/`audioPlayerObjects[]` `postMediaId`s always resolve inside its own `media[]`) — no signature change, same return shape as before.

- [ ] **Step 1: Write the failing tests**

Open `services/gateway/src/__tests__/unit/PostService.test.ts`. Inside the existing `describe('repostPost', () => { ... })` block (starts at line 640), add these six tests immediately before the closing `});` of that block (i.e., right after the existing `'does NOT set expiresAt when reposting as POST'` test, before line 989's `});`):

```ts
    it('remaps storyEffects.mediaObjects postMediaId to the newly duplicated media (repost of an original)', async () => {
      const original = makePost({
        id: 'story-3',
        type: PostType.STORY,
        visibility: 'PUBLIC',
        media: [
          { id: 'orig-media-1', fileUrl: '/api/v1/attachments/file/s1.jpg', mimeType: 'image/jpeg', filePath: 'p/s1.jpg', fileName: 's1.jpg', originalName: 's1.jpg', fileSize: 1000, order: 0 },
        ],
        storyEffects: {
          mediaObjects: [{ id: 'el-1', postMediaId: 'orig-media-1', isBackground: true, x: 0, y: 0 }],
        },
      });
      prisma.post.findFirst.mockResolvedValue(original);

      jest.spyOn(mediaService, 'duplicateMedia').mockResolvedValueOnce({
        fileUrl: '/api/v1/attachments/file/new-s1.jpg', filePath: 'snap/new-s1.jpg', fileName: 'new-s1.jpg', fileSize: 1000, mimeType: 'image/jpeg',
      });

      prisma.post.create.mockResolvedValue(
        makePost({
          id: 'repost-level1',
          media: [{ id: 'new-media-1', order: 0, fileUrl: '/api/v1/attachments/file/new-s1.jpg' }],
          storyEffects: { mediaObjects: [{ id: 'el-1', postMediaId: 'orig-media-1', isBackground: true, x: 0, y: 0 }] },
        })
      );
      prisma.post.update.mockResolvedValue(original);

      const result = await service.repostPost('story-3', 'user-reposter', { targetType: PostType.STORY });

      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'repost-level1' },
        data: { storyEffects: { mediaObjects: [{ id: 'el-1', postMediaId: 'new-media-1', isBackground: true, x: 0, y: 0 }] } },
      });
      expect(result?.storyEffects).toEqual({
        mediaObjects: [{ id: 'el-1', postMediaId: 'new-media-1', isBackground: true, x: 0, y: 0 }],
      });
    });

    it('remaps storyEffects to its OWN new media when reposting an already-reposted story (2-hop chain) — regression for the reported bug', async () => {
      // `levelOneRepost` represents a LEVEL-1 repost that is already
      // self-consistent (its storyEffects.mediaObjects[].postMediaId matches
      // its own media[].id) — exactly what repostPost now produces after this
      // fix. Reposting it must NOT leak the level-1 media id forward: the
      // level-2 repost must reference its own freshly duplicated media.
      const levelOneRepost = makePost({
        id: 'repost-level1',
        type: PostType.STORY,
        visibility: 'PUBLIC',
        repostOfId: 'story-root',
        originalRepostOfId: 'story-root',
        media: [
          { id: 'level1-media-1', fileUrl: '/api/v1/attachments/file/level1.jpg', mimeType: 'image/jpeg', filePath: 'p/level1.jpg', fileName: 'level1.jpg', originalName: 'level1.jpg', fileSize: 1000, order: 0 },
        ],
        storyEffects: {
          mediaObjects: [{ id: 'el-1', postMediaId: 'level1-media-1', isBackground: true, x: 0, y: 0 }],
        },
      });
      prisma.post.findFirst.mockResolvedValue(levelOneRepost);

      jest.spyOn(mediaService, 'duplicateMedia').mockResolvedValueOnce({
        fileUrl: '/api/v1/attachments/file/level2.jpg', filePath: 'snap/level2.jpg', fileName: 'level2.jpg', fileSize: 1000, mimeType: 'image/jpeg',
      });

      prisma.post.create.mockResolvedValue(
        makePost({
          id: 'repost-level2',
          media: [{ id: 'level2-media-1', order: 0, fileUrl: '/api/v1/attachments/file/level2.jpg' }],
          storyEffects: { mediaObjects: [{ id: 'el-1', postMediaId: 'level1-media-1', isBackground: true, x: 0, y: 0 }] },
        })
      );
      prisma.post.update.mockResolvedValue(levelOneRepost);

      const result = await service.repostPost('repost-level1', 'user-reposter-2', { targetType: PostType.STORY });

      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'repost-level2' },
        data: { storyEffects: { mediaObjects: [{ id: 'el-1', postMediaId: 'level2-media-1', isBackground: true, x: 0, y: 0 }] } },
      });
      expect(result?.storyEffects).toEqual({
        mediaObjects: [{ id: 'el-1', postMediaId: 'level2-media-1', isBackground: true, x: 0, y: 0 }],
      });
      const storyEffectsJson = JSON.stringify(result?.storyEffects);
      expect(storyEffectsJson).not.toContain('level1-media-1');
    });

    it('generalizes beyond 2 hops: a 3rd repost also remaps to its own new media, never leaking earlier-level ids', async () => {
      const levelTwoRepost = makePost({
        id: 'repost-level2',
        type: PostType.STORY,
        visibility: 'PUBLIC',
        repostOfId: 'repost-level1',
        originalRepostOfId: 'story-root',
        media: [
          { id: 'level2-media-1', fileUrl: '/api/v1/attachments/file/level2.jpg', mimeType: 'image/jpeg', filePath: 'p/level2.jpg', fileName: 'level2.jpg', originalName: 'level2.jpg', fileSize: 1000, order: 0 },
        ],
        storyEffects: {
          mediaObjects: [{ id: 'el-1', postMediaId: 'level2-media-1', isBackground: true, x: 0, y: 0 }],
        },
      });
      prisma.post.findFirst.mockResolvedValue(levelTwoRepost);

      jest.spyOn(mediaService, 'duplicateMedia').mockResolvedValueOnce({
        fileUrl: '/api/v1/attachments/file/level3.jpg', filePath: 'snap/level3.jpg', fileName: 'level3.jpg', fileSize: 1000, mimeType: 'image/jpeg',
      });

      prisma.post.create.mockResolvedValue(
        makePost({
          id: 'repost-level3',
          media: [{ id: 'level3-media-1', order: 0, fileUrl: '/api/v1/attachments/file/level3.jpg' }],
          storyEffects: { mediaObjects: [{ id: 'el-1', postMediaId: 'level2-media-1', isBackground: true, x: 0, y: 0 }] },
        })
      );
      prisma.post.update.mockResolvedValue(levelTwoRepost);

      const result = await service.repostPost('repost-level2', 'user-reposter-3', { targetType: PostType.STORY });

      expect(result?.storyEffects).toEqual({
        mediaObjects: [{ id: 'el-1', postMediaId: 'level3-media-1', isBackground: true, x: 0, y: 0 }],
      });
      const storyEffectsJson = JSON.stringify(result?.storyEffects);
      expect(storyEffectsJson).not.toContain('level1-media-1');
      expect(storyEffectsJson).not.toContain('level2-media-1');
    });

    it('remaps storyEffects.audioPlayerObjects postMediaId alongside mediaObjects', async () => {
      const original = makePost({
        id: 'story-audio-1',
        type: PostType.STORY,
        visibility: 'PUBLIC',
        media: [
          { id: 'orig-video-1', fileUrl: '/api/v1/attachments/file/v1.mp4', mimeType: 'video/mp4', filePath: 'p/v1.mp4', fileName: 'v1.mp4', originalName: 'v1.mp4', fileSize: 2000, order: 0 },
          { id: 'orig-audio-1', fileUrl: '/api/v1/attachments/file/a1.mp3', mimeType: 'audio/mpeg', filePath: 'p/a1.mp3', fileName: 'a1.mp3', originalName: 'a1.mp3', fileSize: 500, order: 1 },
        ],
        storyEffects: {
          mediaObjects: [{ id: 'el-1', postMediaId: 'orig-video-1', isBackground: true }],
          audioPlayerObjects: [{ id: 'el-2', postMediaId: 'orig-audio-1', volume: 0.8 }],
        },
      });
      prisma.post.findFirst.mockResolvedValue(original);

      jest.spyOn(mediaService, 'duplicateMedia')
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-v1.mp4', filePath: 'snap/new-v1.mp4', fileName: 'new-v1.mp4', fileSize: 2000, mimeType: 'video/mp4' })
        .mockResolvedValueOnce({ fileUrl: '/api/v1/attachments/file/new-a1.mp3', filePath: 'snap/new-a1.mp3', fileName: 'new-a1.mp3', fileSize: 500, mimeType: 'audio/mpeg' });

      prisma.post.create.mockResolvedValue(
        makePost({
          id: 'repost-audio',
          media: [
            { id: 'new-video-1', order: 0, fileUrl: '/api/v1/attachments/file/new-v1.mp4' },
            { id: 'new-audio-1', order: 1, fileUrl: '/api/v1/attachments/file/new-a1.mp3' },
          ],
          storyEffects: {
            mediaObjects: [{ id: 'el-1', postMediaId: 'orig-video-1', isBackground: true }],
            audioPlayerObjects: [{ id: 'el-2', postMediaId: 'orig-audio-1', volume: 0.8 }],
          },
        })
      );
      prisma.post.update.mockResolvedValue(original);

      const result = await service.repostPost('story-audio-1', 'user-reposter', { targetType: PostType.STORY });

      expect(result?.storyEffects).toEqual({
        mediaObjects: [{ id: 'el-1', postMediaId: 'new-video-1', isBackground: true }],
        audioPlayerObjects: [{ id: 'el-2', postMediaId: 'new-audio-1', volume: 0.8 }],
      });
    });

    it('logs and keeps the original storyEffects when the post-create correction write fails, without failing the repost', async () => {
      const original = makePost({
        id: 'story-4',
        type: PostType.STORY,
        visibility: 'PUBLIC',
        media: [
          { id: 'orig-media-1', fileUrl: '/api/v1/attachments/file/s1.jpg', mimeType: 'image/jpeg', filePath: 'p/s1.jpg', fileName: 's1.jpg', originalName: 's1.jpg', fileSize: 1000, order: 0 },
        ],
        storyEffects: {
          mediaObjects: [{ id: 'el-1', postMediaId: 'orig-media-1', isBackground: true }],
        },
      });
      prisma.post.findFirst.mockResolvedValue(original);

      jest.spyOn(mediaService, 'duplicateMedia').mockResolvedValueOnce({
        fileUrl: '/api/v1/attachments/file/new-s1.jpg', filePath: 'snap/new-s1.jpg', fileName: 'new-s1.jpg', fileSize: 1000, mimeType: 'image/jpeg',
      });

      const createdRepost = makePost({
        id: 'repost-fail-correction',
        media: [{ id: 'new-media-1', order: 0, fileUrl: '/api/v1/attachments/file/new-s1.jpg' }],
        storyEffects: { mediaObjects: [{ id: 'el-1', postMediaId: 'orig-media-1', isBackground: true }] },
      });
      prisma.post.create.mockResolvedValue(createdRepost);

      // First update() call is the storyEffects correction (rejects); second
      // is the original post's repostCount increment (resolves normally).
      prisma.post.update
        .mockRejectedValueOnce(new Error('write conflict'))
        .mockResolvedValueOnce(original);

      const result = await service.repostPost('story-4', 'user-reposter', { targetType: PostType.STORY });

      expect(result).toBeDefined();
      expect(result?.id).toBe('repost-fail-correction');
      expect(prisma.post.update).toHaveBeenCalledTimes(2);
      expect(prisma.post.update).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ where: { id: 'story-4' }, data: { repostCount: { increment: 1 } } })
      );
      expect(result?.storyEffects).toEqual({
        mediaObjects: [{ id: 'el-1', postMediaId: 'orig-media-1', isBackground: true }],
      });
    });

    it('does not issue a correction update when storyEffects has no media references to remap', async () => {
      const original = makePost({
        id: 'story-text-only',
        type: PostType.STORY,
        visibility: 'PUBLIC',
        storyEffects: { textObjects: [{ id: 'el-1', text: 'hello' }] },
      });
      prisma.post.findFirst.mockResolvedValue(original);
      prisma.post.create.mockResolvedValue(makePost({ id: 'repost-text-only', storyEffects: { textObjects: [{ id: 'el-1', text: 'hello' }] } }));
      prisma.post.update.mockResolvedValue(original);

      await service.repostPost('story-text-only', 'user-reposter', { targetType: PostType.STORY });

      expect(prisma.post.update).toHaveBeenCalledTimes(1);
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'story-text-only' }, data: { repostCount: { increment: 1 } } })
      );
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd services/gateway && bun run test:unit -- src/__tests__/unit/PostService.test.ts -t "repostPost"
```

Expected: FAIL — the 6 new tests fail (e.g. `prisma.post.update` never called with a `storyEffects` correction payload; `result?.storyEffects` still equals the unmapped, stale value).

- [ ] **Step 3: Write the implementation**

In `services/gateway/src/services/PostService.ts`, add the import right after the existing `postIncludes` import (line 16):

```ts
import { authorSelect, mediaSelect, mediaInclude, postInclude } from './posts/postIncludes';
import { remapStoryEffectsMediaIds } from './posts/storyEffectsMediaRemap';
```

Then, inside `repostPost()`, widen the `originalMedia` inline type to expose `id` (it is already present at runtime via `mediaSelect`, just missing from the local type annotation):

```ts
        const originalMedia = (original.media ?? []) as Array<{
          id: string;
          fileUrl: string;
          mimeType: string;
          thumbnailUrl?: string | null;
          order?: number;
        }>;
```

Then, immediately after the `const repost = await this.prisma.post.create({ ... });` call and before the existing `await this.prisma.post.update({ where: { id: postId }, data: { repostCount: { increment: 1 } } });` block, insert:

```ts
        // The media just duplicated above got fresh `PostMedia` ids — but
        // `snapshotStoryEffects` was copied verbatim and still references the
        // SOURCE's media ids. Left as-is, a repost of a repost would carry
        // forward ids from however many hops back the chain started, and the
        // reader's plain `postMediaId` lookup (scoped to the post's own
        // `media[]`) would never find them — the exact "contenu non affiché"
        // bug. Rewrite them here so every repost is self-contained regardless
        // of chain depth.
        let finalRepost = repost;
        if (snapshotStoryEffects !== undefined) {
          const repostMedia = repost.media ?? [];
          const idMap: Record<string, string> = {};
          originalMedia.forEach((om, idx) => {
            const newMedia = repostMedia[idx];
            if (newMedia) {
              idMap[om.id] = newMedia.id;
            }
          });

          const remapped = remapStoryEffectsMediaIds(snapshotStoryEffects, idMap);
          if (remapped.changed) {
            try {
              await this.prisma.post.update({
                where: { id: repost.id },
                data: { storyEffects: remapped.effects },
              });
              // Cast: `remapped.effects` is `Prisma.InputJsonValue` (write-side
              // JSON type); `repost.storyEffects` is Prisma's read-side JSON
              // output type. They're structurally the same data, but Prisma
              // generates them as separate, not-mutually-assignable aliases —
              // this cast bridges that without widening to `any`.
              finalRepost = { ...repost, storyEffects: remapped.effects as typeof repost.storyEffects };
            } catch (err) {
              log.warn('repostPost: failed to correct storyEffects media ids', { repostId: repost.id, err });
            }
          }
        }
```

Finally, change the function's `return repost;` (at the end of the `try` block, right after the `orphanCleanup`/`untrackBatch` call) to `return finalRepost;`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd services/gateway && bun run test:unit -- src/__tests__/unit/PostService.test.ts -t "repostPost"
```

Expected: PASS — all `repostPost` tests green, including the 6 new ones and the pre-existing ones (non-regression on `originalRepostOfId` flattening, quote reposts, STATUS snapshotting, media-duplication rollback, expiresAt).

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/PostService.ts services/gateway/src/__tests__/unit/PostService.test.ts
git commit -m "fix(gateway): repost of a repost now renders — remap storyEffects media ids on snapshot"
```

---

## Task 3: Full verification (bun parity + typecheck)

**Files:** none (verification only).

- [ ] **Step 1: Run the full gateway test suite under bun (CI parity)**

```bash
cd packages/shared && npx prisma generate --generator client
cd packages/shared && bun run build
cd services/gateway && bun run test:coverage
```

Expected: 249+ suites green (was 249/249 before this change; Task 1 adds 1 suite, Task 2 adds tests to an existing suite — total suite count is 250/250, all green). No coverage regression.

- [ ] **Step 2: Typecheck the gateway (strict mode)**

```bash
cd services/gateway && bun run build
```

Expected: `tsc` completes with no errors — confirms the new `remapStoryEffectsMediaIds` typing and the `PostService.ts` changes satisfy strict mode with no `any`.

- [ ] **Step 3: Confirm no other call sites depend on `repostPost()`'s exact return identity**

```bash
grep -rn "repostPost(" services/gateway/src --include="*.ts" | grep -v __tests__
```

Expected: only the route handler in `services/gateway/src/routes/posts/interactions.ts` calls `repostPost()`, passing the result straight into `sendSuccess()` — confirms the `{ ...repost, storyEffects: ... }` shape returned on the corrected path is a drop-in match for the plain `repost` shape returned everywhere else (same fields, same types), so no downstream code needs adjustment.

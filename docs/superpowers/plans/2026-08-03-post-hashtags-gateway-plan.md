# Hashtags Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hashtag extraction, persistence, search, and trending to the gateway — the backend foundation the iOS and web plans depend on.

**Architecture:** New `Hashtag`/`PostHashtag` Prisma models (mirroring `Mention`/`PostMention`'s shape, but with edit-time cleanup that mentions don't have, because `Hashtag.usageCount` drives trending). New `HashtagService` (mirrors `MentionService`), wired into the existing create/edit paths in `routes/posts/core.ts`. Two new read endpoints in a new `routes/posts/hashtag.ts` file (mirrors `routes/posts/nearby.ts`).

**Tech Stack:** Fastify 5, Prisma 6/MongoDB, Zod, Jest/bun test.

**Spec:** `docs/superpowers/specs/2026-08-03-post-hashtags-and-rich-content-design.md`

## Global Constraints

- Hashtag character class: Unicode `[\p{L}\p{N}_]`, 1–50 chars, no hyphen (spec §2).
- `MAX_HASHTAGS_PER_POST = 30` (spec §2, §7).
- Extraction NEVER throws / blocks publication — same invariant as `MentionService.extractMentions` and `SoundCaptureService.captureSounds` (spec §7).
- Hashtag matching is case-insensitive (`Hashtag.tag` stores lowercase); original casing preserved per-use on `PostHashtag.display`.
- Search/trending endpoints scope to `PostType` in `[POST, REEL]` only (spec Décisions).
- No retroactive indexing — only future publications (spec Décisions).
- Response format: `sendSuccess()`/`sendError()` from `utils/response.ts`, pagination top-level (per `services/gateway/CLAUDE.md`).

---

### Task 1: Schema — `Hashtag` + `PostHashtag` models

**Files:**
- Modify: `packages/shared/prisma/schema.prisma` (near `Mention` at `:1236`, and `Post.postMentions` at `:3012`)

**Interfaces:**
- Produces: `Hashtag { id, tag, usageCount, createdAt, lastUsedAt }`, `PostHashtag { id, postId, hashtagId, display, createdAt }`, `Post.postHashtags: PostHashtag[]`

- [ ] **Step 1: Add the two models**

Insert directly after the `PostMention` model (`:3964-3977`):

```prisma
model Hashtag {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  /// Normalisé minuscule — clé de correspondance. La casse d'affichage
  /// d'origine vit sur PostHashtag, pas ici (un même tag peut être tapé
  /// "#Paris" et "#paris" par deux auteurs différents).
  tag         String   @unique
  usageCount  Int      @default(0)
  createdAt   DateTime @default(now())
  lastUsedAt  DateTime @default(now())
  postHashtags PostHashtag[]

  @@index([usageCount(sort: Desc)])
}

/// Jointure post↔hashtag. Miroir de PostMention, MAIS avec un comportement
/// différent à l'édition : les lignes retirées SONT supprimées (voir
/// HashtagService.reconcileRemovedHashtags), contrairement à PostMention qui
/// laisse ses lignes orphelines (acceptable là-bas car rien n'y compte).
model PostHashtag {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  postId     String   @db.ObjectId
  hashtagId  String   @db.ObjectId
  /// Casse telle que tapée par l'auteur — affichage uniquement.
  display    String
  createdAt  DateTime @default(now())

  post       Post     @relation("PostHashtags", fields: [postId], references: [id], onDelete: Cascade)
  hashtag    Hashtag  @relation(fields: [hashtagId], references: [id], onDelete: Cascade)

  @@unique([postId, hashtagId], name: "post_hashtag_unique")
  @@index([hashtagId])
  @@index([postId])
}
```

On `model Post`, add the inverse relation directly after `postMentions` (`:3012`):

```prisma
  postHashtags  PostHashtag[]  @relation("PostHashtags")
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `cd packages/shared && npx prisma generate --generator client`
Expected: `✔ Generated Prisma Client` — no errors. This is required before any code below type-checks (`Hashtag`/`PostHashtag` don't exist on `PrismaClient` until regenerated).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git commit -m "feat(gateway/hashtags): schema Hashtag + PostHashtag"
```

---

### Task 2: `HashtagService.extractHashtags` (pure extraction)

**Files:**
- Create: `services/gateway/src/services/HashtagService.ts`
- Test: `services/gateway/src/__tests__/unit/services/HashtagService.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, no DB)
- Produces: `HashtagService.extractHashtags(content: string): { tag: string; display: string }[]` — `tag` lowercase, `display` original casing, deduplicated by `tag` (first occurrence wins), capped at `MAX_HASHTAGS_PER_POST`.

- [ ] **Step 1: Write the failing tests**

```typescript
// services/gateway/src/__tests__/unit/services/HashtagService.test.ts
import { describe, it, expect } from '@jest/globals';
import { HashtagService } from '../../../services/HashtagService';

describe('HashtagService.extractHashtags', () => {
  const service = new HashtagService({} as any);

  it('test_extractHashtags_findsASingleHashtag', () => {
    expect(service.extractHashtags('Belle journée #paris aujourd\'hui'))
      .toEqual([{ tag: 'paris', display: '#paris' }]);
  });

  it('test_extractHashtags_lowercasesTheMatchingTagButKeepsDisplayCasing', () => {
    expect(service.extractHashtags('#Paris est belle'))
      .toEqual([{ tag: 'paris', display: '#Paris' }]);
  });

  it('test_extractHashtags_allowsUnicodeLetters', () => {
    expect(service.extractHashtags('#été à #café'))
      .toEqual([{ tag: 'été', display: '#été' }, { tag: 'café', display: '#café' }]);
  });

  it('test_extractHashtags_deduplicatesByTag_firstDisplayWins', () => {
    expect(service.extractHashtags('#Paris et encore #paris'))
      .toEqual([{ tag: 'paris', display: '#Paris' }]);
  });

  it('test_extractHashtags_ignoresHashInsideAWord', () => {
    expect(service.extractHashtags('C#paris')).toEqual([]);
  });

  it('test_extractHashtags_ignoresUrlFragment', () => {
    // Un fragment d'URL (`exemple.com/#section`) n'est pas un hashtag —
    // frontière gauche exclut aussi le `/`, pas seulement les caractères de mot.
    expect(service.extractHashtags('Voir https://exemple.com/#section'))
      .toEqual([]);
  });

  it('test_extractHashtags_rejectsHyphens_stopsAtTheHyphen', () => {
    // Convention hashtag : pas de tiret (contrairement aux mentions). Le
    // hashtag s'arrête au tiret, il n'est pas rejeté entièrement.
    expect(service.extractHashtags('#paris-2026'))
      .toEqual([{ tag: 'paris', display: '#paris' }]);
  });

  it('test_extractHashtags_emptyContent_returnsEmpty', () => {
    expect(service.extractHashtags('')).toEqual([]);
  });

  it('test_extractHashtags_tooLong_returnsEmpty', () => {
    expect(service.extractHashtags('#a '.repeat(4000))).toEqual([]);
  });

  it('test_extractHashtags_capsAtMaxHashtagsPerPost', () => {
    const content = Array.from({ length: 40 }, (_, i) => `#tag${i}`).join(' ');
    expect(service.extractHashtags(content)).toHaveLength(30);
  });

  it('test_extractHashtags_singleCharTooShortIsStillValid', () => {
    // Un hashtag d'1 caractère est valide (ex. "#1", "#a") — pas de longueur minimale.
    expect(service.extractHashtags('#a')).toEqual([{ tag: 'a', display: '#a' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/gateway && bun run test -- --testPathPatterns="HashtagService"`
Expected: FAIL — `Cannot find module '../../../services/HashtagService'`

- [ ] **Step 3: Write the implementation**

```typescript
// services/gateway/src/services/HashtagService.ts
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'HashtagService' });

export interface ExtractedHashtag {
  /** Normalisé minuscule — clé de correspondance sur `Hashtag.tag`. */
  tag: string;
  /** Casse telle que tapée par l'auteur — `PostHashtag.display`. */
  display: string;
}

const MAX_CONTENT_LENGTH = 10000;
const MAX_HASHTAGS_PER_POST = 30;

// `#` + 1-50 caractères Unicode lettre/chiffre/underscore. PAS de tiret
// (convention hashtag, différente des mentions qui l'autorisent). Frontière
// gauche : ni caractère de mot ni `/` — exclut aussi bien "C#paris" qu'un
// fragment d'URL "exemple.com/#section".
const HASHTAG_REGEX = /(?<![\p{L}\p{N}_/])#([\p{L}\p{N}_]{1,50})/gu;

export class HashtagService {
  constructor(private prisma: PrismaClient) {}

  extractHashtags(content: string): ExtractedHashtag[] {
    if (!content || content.length > MAX_CONTENT_LENGTH) {
      if (content) log.warn(`[HashtagService] Content too long: ${content.length} bytes`);
      return [];
    }

    const seen = new Set<string>();
    const result: ExtractedHashtag[] = [];

    for (const match of content.matchAll(HASHTAG_REGEX)) {
      const raw = match[1];
      if (!raw) continue;
      const tag = raw.toLowerCase();
      if (seen.has(tag)) continue;
      seen.add(tag);
      result.push({ tag, display: `#${raw}` });
      if (result.length >= MAX_HASHTAGS_PER_POST) {
        log.warn(`[HashtagService] Max hashtags limit reached (${MAX_HASHTAGS_PER_POST}), truncating`);
        break;
      }
    }

    return result;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/gateway && bun run test -- --testPathPatterns="HashtagService"`
Expected: PASS — 12/12

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/HashtagService.ts services/gateway/src/__tests__/unit/services/HashtagService.test.ts
git commit -m "feat(gateway/hashtags): extraction pure — HashtagService.extractHashtags"
```

---

### Task 3: `HashtagService.createPostHashtags` (persistence + recount)

**Files:**
- Modify: `services/gateway/src/services/HashtagService.ts`
- Modify: `services/gateway/src/__tests__/unit/services/HashtagService.test.ts`

**Interfaces:**
- Consumes: `ExtractedHashtag[]` from Task 2
- Produces: `HashtagService.createPostHashtags(postId: string, hashtags: ExtractedHashtag[]): Promise<void>` — upserts `Hashtag` + `PostHashtag`, recounts `Hashtag.usageCount`. Never throws.

- [ ] **Step 1: Write the failing tests**

```typescript
// Add to services/gateway/src/__tests__/unit/services/HashtagService.test.ts

describe('HashtagService.createPostHashtags', () => {
  function buildPrisma(overrides: Record<string, unknown> = {}) {
    return {
      hashtag: {
        upsert: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'h1' }),
        update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      },
      postHashtag: {
        upsert: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(1),
      },
      ...overrides,
    } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
  }

  it('test_createPostHashtags_emptyList_touchesNothing', async () => {
    const prisma = buildPrisma();
    await new HashtagService(prisma).createPostHashtags('p1', []);
    expect(prisma.hashtag.upsert).not.toHaveBeenCalled();
  });

  it('test_createPostHashtags_upsertsHashtagByNormalizedTag', async () => {
    const prisma = buildPrisma();
    await new HashtagService(prisma).createPostHashtags('p1', [{ tag: 'paris', display: '#Paris' }]);
    expect(prisma.hashtag.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tag: 'paris' },
      create: expect.objectContaining({ tag: 'paris' }),
    }));
  });

  it('test_createPostHashtags_upsertsPostHashtagWithDisplayCasing', async () => {
    const prisma = buildPrisma();
    await new HashtagService(prisma).createPostHashtags('p1', [{ tag: 'paris', display: '#Paris' }]);
    expect(prisma.postHashtag.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { post_hashtag_unique: { postId: 'p1', hashtagId: 'h1' } },
      create: expect.objectContaining({ postId: 'p1', hashtagId: 'h1', display: '#Paris' }),
      update: expect.objectContaining({ display: '#Paris' }),
    }));
  });

  it('test_createPostHashtags_recountsUsageCountAfterWrite_neverIncrements', async () => {
    const prisma = buildPrisma({
      postHashtag: {
        upsert: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(7),
      },
    });
    await new HashtagService(prisma).createPostHashtags('p1', [{ tag: 'paris', display: '#paris' }]);
    expect(prisma.hashtag.update).toHaveBeenCalledWith({
      where: { id: 'h1' },
      data: { usageCount: 7, lastUsedAt: expect.any(Date) },
    });
  });

  it('test_createPostHashtags_prismaThrows_neverRejects', async () => {
    const prisma = buildPrisma({
      hashtag: { upsert: jest.fn().mockRejectedValue(new Error('DB down')), update: jest.fn() },
    });
    await expect(new HashtagService(prisma).createPostHashtags('p1', [{ tag: 'paris', display: '#paris' }]))
      .resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/gateway && bun run test -- --testPathPatterns="HashtagService"`
Expected: FAIL — `createPostHashtags is not a function`

- [ ] **Step 3: Implement**

Add to `HashtagService`:

```typescript
  /**
   * Upsert `Hashtag` (créer si absent, réutiliser sinon) puis `PostHashtag`
   * par `(postId, hashtagId)` — une republication met à jour `display`, elle
   * n'est jamais avalée en silence (même raison que l'upsert de `SoundUsage`
   * cette session). Recompte `Hashtag.usageCount` après coup plutôt que
   * d'incrémenter à l'aveugle : jamais de dérive rejouable.
   */
  async createPostHashtags(postId: string, hashtags: ExtractedHashtag[]): Promise<void> {
    for (const { tag, display } of hashtags) {
      try {
        const hashtag = await this.prisma.hashtag.upsert({
          where: { tag },
          create: { tag },
          update: {},
        });
        await this.prisma.postHashtag.upsert({
          where: { post_hashtag_unique: { postId, hashtagId: hashtag.id } },
          create: { postId, hashtagId: hashtag.id, display },
          update: { display },
        });
        await this.recountHashtag(hashtag.id);
      } catch (error) {
        log.error('createPostHashtags a échoué', error instanceof Error ? error : new Error(String(error)),
          { postId, tag });
      }
    }
  }

  private async recountHashtag(hashtagId: string): Promise<void> {
    const usageCount = await this.prisma.postHashtag.count({ where: { hashtagId } });
    await this.prisma.hashtag.update({ where: { id: hashtagId }, data: { usageCount, lastUsedAt: new Date() } });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/gateway && bun run test -- --testPathPatterns="HashtagService"`
Expected: PASS — 17/17

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/HashtagService.ts services/gateway/src/__tests__/unit/services/HashtagService.test.ts
git commit -m "feat(gateway/hashtags): persistance createPostHashtags + recompte usageCount"
```

---

### Task 4: `HashtagService.reconcileRemovedHashtags` (edit-time cleanup)

**Files:**
- Modify: `services/gateway/src/services/HashtagService.ts`
- Modify: `services/gateway/src/__tests__/unit/services/HashtagService.test.ts`

**Interfaces:**
- Consumes: nothing new (uses `postHashtag`/`hashtag` from Prisma client)
- Produces: `HashtagService.reconcileRemovedHashtags(postId: string, keptTags: string[]): Promise<void>` — deletes `PostHashtag` rows for this post whose `hashtag.tag` is NOT in `keptTags`, recounts the affected `Hashtag`s.

- [ ] **Step 1: Write the failing tests**

```typescript
// Add to services/gateway/src/__tests__/unit/services/HashtagService.test.ts

describe('HashtagService.reconcileRemovedHashtags', () => {
  function buildPrisma(overrides: Record<string, unknown> = {}) {
    return {
      postHashtag: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
        deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
      },
      hashtag: {
        update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      },
      ...overrides,
    } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
  }

  it('test_reconcile_noExistingHashtags_touchesNothing', async () => {
    const prisma = buildPrisma();
    await new HashtagService(prisma).reconcileRemovedHashtags('p1', ['paris']);
    expect(prisma.postHashtag.deleteMany).not.toHaveBeenCalled();
  });

  it('test_reconcile_removesHashtagsNoLongerInContent_recountsThem', async () => {
    const prisma = buildPrisma({
      postHashtag: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { id: 'ph1', hashtagId: 'h-paris', hashtag: { tag: 'paris' } },
          { id: 'ph2', hashtagId: 'h-lyon', hashtag: { tag: 'lyon' } },
        ]),
        deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 1 }),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(4),
      },
      hashtag: { update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}) },
    });
    // "paris" reste dans le texte édité, "lyon" a été retiré.
    await new HashtagService(prisma).reconcileRemovedHashtags('p1', ['paris']);

    expect(prisma.postHashtag.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['ph2'] } } });
    expect(prisma.hashtag.update).toHaveBeenCalledWith({
      where: { id: 'h-lyon' },
      data: { usageCount: 4 },
    });
    expect(prisma.hashtag.update).toHaveBeenCalledTimes(1);
  });

  it('test_reconcile_prismaThrows_neverRejects', async () => {
    const prisma = buildPrisma({
      postHashtag: { findMany: jest.fn().mockRejectedValue(new Error('DB down')) },
    });
    await expect(new HashtagService(prisma).reconcileRemovedHashtags('p1', []))
      .resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/gateway && bun run test -- --testPathPatterns="HashtagService"`
Expected: FAIL — `reconcileRemovedHashtags is not a function`

- [ ] **Step 3: Implement**

Add to `HashtagService`:

```typescript
  /**
   * À l'édition, retire les `PostHashtag` dont le tag n'est plus dans le
   * contenu édité (`keptTags`, déjà normalisés minuscule par l'appelant) et
   * recompte les `Hashtag` touchés. Contrairement à `MentionService` (qui
   * laisse les mentions retirées orphelines — sans conséquence, aucun
   * compteur n'en dépend), `Hashtag.usageCount` alimente les tendances : une
   * ligne orpheline gonflerait un compteur qui ne redescend jamais.
   */
  async reconcileRemovedHashtags(postId: string, keptTags: string[]): Promise<void> {
    try {
      const existing = await this.prisma.postHashtag.findMany({
        where: { postId },
        select: { id: true, hashtagId: true, hashtag: { select: { tag: true } } },
      });
      const kept = new Set(keptTags);
      const removed = existing.filter((ph) => !kept.has(ph.hashtag.tag));
      if (removed.length === 0) return;

      await this.prisma.postHashtag.deleteMany({ where: { id: { in: removed.map((ph) => ph.id) } } });
      const touchedHashtagIds = [...new Set(removed.map((ph) => ph.hashtagId))];
      for (const hashtagId of touchedHashtagIds) {
        await this.recountHashtag(hashtagId);
      }
    } catch (error) {
      log.error('reconcileRemovedHashtags a échoué', error instanceof Error ? error : new Error(String(error)),
        { postId });
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/gateway && bun run test -- --testPathPatterns="HashtagService"`
Expected: PASS — 20/20

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/HashtagService.ts services/gateway/src/__tests__/unit/services/HashtagService.test.ts
git commit -m "feat(gateway/hashtags): nettoyage des hashtags retirés à l'édition"
```

---

### Task 5: Wire `HashtagService` into `routes/posts/core.ts`

**Files:**
- Modify: `services/gateway/src/routes/posts/core.ts:1-15` (imports), `:48` (service instantiation area), `:157-166` (create path), `:298-322` (edit path)
- Modify: `services/gateway/src/__tests__/unit/routes/posts/core.test.ts` (or `core-extended.test.ts` — check which file already covers create/edit mention-forwarding tests, add hashtag equivalents alongside)

**Interfaces:**
- Consumes: `HashtagService.extractHashtags`, `.createPostHashtags`, `.reconcileRemovedHashtags` (Tasks 2-4)
- Produces: post create/edit now also persist hashtags. No new exported symbols.

- [ ] **Step 1: Write the failing tests**

Add to `services/gateway/src/__tests__/unit/routes/posts/core.test.ts` (find the existing `describe('POST /posts — geo discoverability'` block added earlier this session for the pattern to follow — same `buildApp()`/`mockCreatePost` harness):

```typescript
describe('POST /posts — hashtags', () => {
  it('extracts hashtags from content and persists them via HashtagService', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'POST', content: 'Belle journée #paris #été' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockCreatePostHashtags).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        { tag: 'paris', display: '#paris' },
        { tag: 'été', display: '#été' },
      ]),
    );
  });

  it('does not call createPostHashtags when content has no hashtags', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/posts', payload: { type: 'POST', content: 'Rien ici' } });
    expect(mockCreatePostHashtags).not.toHaveBeenCalled();
  });
});

describe('PUT /posts/:postId — hashtags', () => {
  it('persists new hashtags and reconciles removed ones on edit', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT', url: `/posts/${EXISTING_POST_ID}`,
      payload: { content: '#lyon uniquement maintenant' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockCreatePostHashtags).toHaveBeenCalledWith(
      expect.any(String), [{ tag: 'lyon', display: '#lyon' }],
    );
    expect(mockReconcileRemovedHashtags).toHaveBeenCalledWith(expect.any(String), ['lyon']);
  });
});
```

(Adapt `mockCreatePostHashtags`/`mockReconcileRemovedHashtags` to however this test file mocks `HashtagService` — mirror exactly how `mockCreatePost`/`mockCreatePostMentions` are already mocked in this file's `jest.mock(...)` block at the top, same module-mock pattern, same `EXISTING_POST_ID`/`buildApp()` helpers already defined in the file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/gateway && bun run test -- --testPathPatterns="posts/core.test"`
Expected: FAIL — `mockCreatePostHashtags is not defined` (or hashtags never called)

- [ ] **Step 3: Implement**

In `services/gateway/src/routes/posts/core.ts`:

Add import near the `MentionService` import (`:10`):
```typescript
import { HashtagService } from '../../services/HashtagService';
```

Near the `mentionService` instantiation (`:48`):
```typescript
  const hashtagService = new HashtagService(prisma);
```

In the create path, right after the existing mention block (`:157-166`, inside `if (postContent) { ... }`), add:
```typescript
      if (postContent) {
        const hashtags = hashtagService.extractHashtags(postContent);
        if (hashtags.length > 0) {
          hashtagService.createPostHashtags((post as any).id as string, hashtags).catch((err: unknown) => {
            fastify.log.error(`[POST /posts] hashtag persist failed: ${err}`);
          });
        }
      }
```

In the edit path, right after the existing mention block (`:298-322`, inside `if (editedContent) { ... }`), add:
```typescript
      if (editedContent) {
        const hashtags = hashtagService.extractHashtags(editedContent);
        if (hashtags.length > 0) {
          hashtagService.createPostHashtags(postId, hashtags).catch((err: unknown) => {
            fastify.log.error(`[PUT /posts/:postId] hashtag persist failed: ${err}`);
          });
        }
        hashtagService.reconcileRemovedHashtags(postId, hashtags.map((h) => h.tag)).catch((err: unknown) => {
          fastify.log.error(`[PUT /posts/:postId] hashtag reconcile failed: ${err}`);
        });
      } else {
        // Contenu vidé entièrement à l'édition → tous les hashtags sont retirés.
        hashtagService.reconcileRemovedHashtags(postId, []).catch((err: unknown) => {
          fastify.log.error(`[PUT /posts/:postId] hashtag reconcile failed: ${err}`);
        });
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/gateway && bun run test -- --testPathPatterns="posts/core.test"`
Expected: PASS, all tests in the file green (check the full file, not just the new tests — confirm no regression)

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/posts/core.ts services/gateway/src/__tests__/unit/routes/posts/core.test.ts
git commit -m "feat(gateway/hashtags): câblage création + édition de post"
```

---

### Task 6: Search + trending endpoints

**Files:**
- Create: `services/gateway/src/routes/posts/hashtag.ts` (mirrors `services/gateway/src/routes/posts/nearby.ts`)
- Create: `services/gateway/src/routes/posts/__tests__/hashtag.test.ts`
- Modify: `services/gateway/src/routes/posts/index.ts` (register the new routes)

**Interfaces:**
- Consumes: `postInclude`, `NOT_DELETED` from `./postIncludes`; `getCommunityCoMemberIds` from `../../services/posts/communityVisibility`; `hoistLocationDeep` from `../../services/location/sharedPlace`
- Produces: `GET /posts/hashtag/:tag`, `GET /hashtags/trending`. No new exported functions consumed elsewhere.

- [ ] **Step 1: Write the failing tests**

```typescript
// services/gateway/src/routes/posts/__tests__/hashtag.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { registerHashtagRoutes } from '../hashtag';

// Adapt buildApp/auth-mocking to whatever harness nearby.test.ts already
// uses in this same directory — same requiredAuth stub, same prisma mock
// shape (prisma.postHashtag.findMany, prisma.post.findMany, prisma.hashtag.findMany).

describe('GET /posts/hashtag/:tag', () => {
  it('returns posts and reels tagged with the given hashtag, most recent first', async () => {
    // prisma.hashtag.findUnique resolves {id: 'h1', tag: 'paris'}
    // prisma.postHashtag.findMany resolves [{postId: 'p1'}, {postId: 'p2'}]
    // prisma.post.findMany resolves matching posts (PostType POST and REEL)
    // assert response.data has both posts, pagination top-level
  });

  it('returns empty array for an unknown hashtag, not a 404', async () => {
    // prisma.hashtag.findUnique resolves null
    // assert 200, data: []
  });

  it('normalizes the :tag param to lowercase before lookup', async () => {
    // request /posts/hashtag/Paris
    // assert prisma.hashtag.findUnique called with {where: {tag: 'paris'}}
  });

  it('never returns a PRIVATE/FRIENDS-only post even if it carries the hashtag', async () => {
    // prisma.post.findMany mock includes visibility filter assertion:
    // expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
    //   where: expect.objectContaining({
    //     OR: expect.arrayContaining([
    //       {visibility: 'PUBLIC'},
    //       expect.objectContaining({visibility: 'COMMUNITY'}),
    //     ]),
    //   }),
    // }));
  });
});

describe('GET /hashtags/trending', () => {
  it('returns hashtags ordered by usageCount descending', async () => {
    // prisma.hashtag.findMany resolves already-sorted rows (orderBy asserted)
    // assert response shape [{tag, usageCount}, ...]
  });

  it('respects the limit query param, default 20, max 50', async () => {
    // assert prisma.hashtag.findMany called with take: 20 by default
  });
});
```

(Write these out fully against the real mock harness pattern already established in `nearby.test.ts` in the same directory — read that file first for the exact `buildApp`/auth/prisma-mock shape before finalizing these bodies; the assertions above are the CONTRACT to hit, not pseudocode to leave as-is.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/gateway && bun run test -- --testPathPatterns="posts/hashtag"`
Expected: FAIL — `Cannot find module '../hashtag'`

- [ ] **Step 3: Implement**

```typescript
// services/gateway/src/routes/posts/hashtag.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendBadRequest } from '../../utils/response';
import { postInclude, NOT_DELETED } from '../../services/posts/postIncludes';
import { hoistLocationDeep } from '../../services/location/sharedPlace';
import { getCommunityCoMemberIds } from '../../services/posts/communityVisibility';

/**
 * GET /posts/hashtag/:tag + GET /hashtags/trending — recherche et tendances
 * de hashtags (Hashtag/PostHashtag, écrits par HashtagService).
 *
 * Design : docs/superpowers/specs/2026-08-03-post-hashtags-and-rich-content-design.md §3
 *
 * Visibilité volontairement PLUS ÉTROITE que le feed personnalisé complet
 * (`buildPostVisibilityOrFilter`, qui inclut FRIENDS/EXCEPT/ONLY) : la
 * découverte par hashtag est une surface de DÉCOUVERTE (comme
 * `getDiscoverStatuses`/`GET /posts/nearby`), pas le feed personnalisé —
 * PUBLIC + COMMUNITY (co-membre) uniquement, jamais FRIENDS-only même si le
 * viewer fait partie de l'audience. Décision assumée (spec §Décisions).
 */

const HashtagPostsQuerySchema = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const TrendingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#/, '');
}

export function registerHashtagRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
) {
  fastify.get('/posts/hashtag/:tag', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = (request as UnifiedAuthRequest).authContext;
    if (!authContext?.registeredUser) {
      return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    }

    const parsedQuery = HashtagPostsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
    }
    const { cursor, limit } = parsedQuery.data;
    const tag = normalizeTag((request.params as { tag: string }).tag);

    const hashtag = await prisma.hashtag.findUnique({ where: { tag } });
    if (!hashtag) {
      return sendSuccess(reply, [], { pagination: { limit, hasMore: false, nextCursor: null } });
    }

    const links = await prisma.postHashtag.findMany({
      where: { hashtagId: hashtag.id },
      orderBy: { createdAt: 'desc' },
      skip: cursor,
      take: limit + 1,
      select: { postId: true },
    });
    const hasMore = links.length > limit;
    const pageLinks = hasMore ? links.slice(0, limit) : links;
    const orderedIds = pageLinks.map((l) => l.postId);
    const nextCursor = hasMore ? String(cursor + limit) : null;

    if (orderedIds.length === 0) {
      return sendSuccess(reply, [], { pagination: { limit, hasMore: false, nextCursor: null } });
    }

    const communityCoMemberIds = await getCommunityCoMemberIds(prisma, authContext.registeredUser.id);
    const posts = await prisma.post.findMany({
      where: {
        id: { in: orderedIds },
        type: { in: ['POST', 'REEL'] },
        deletedAt: NOT_DELETED,
        OR: [
          { authorId: authContext.registeredUser.id },
          { visibility: 'PUBLIC' },
          { visibility: 'COMMUNITY', authorId: { in: communityCoMemberIds } },
        ],
      },
      include: postInclude,
    });
    const postsById = new Map(posts.map((post) => [post.id, post]));

    const data = orderedIds
      .map((id) => postsById.get(id))
      .filter((post): post is NonNullable<typeof post> => post !== undefined)
      .map((post) => hoistLocationDeep(post));

    return sendSuccess(reply, data, { pagination: { limit, hasMore, nextCursor } });
  });

  fastify.get('/hashtags/trending', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = (request as UnifiedAuthRequest).authContext;
    if (!authContext?.registeredUser) {
      return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    }

    const parsed = TrendingQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
    }

    const hashtags = await prisma.hashtag.findMany({
      where: { usageCount: { gt: 0 } },
      orderBy: { usageCount: 'desc' },
      take: parsed.data.limit,
      select: { tag: true, usageCount: true },
    });

    return sendSuccess(reply, hashtags);
  });
}
```

Register in `services/gateway/src/routes/posts/index.ts` — add import next to `registerNearbyRoutes` and call it next to its registration:
```typescript
import { registerHashtagRoutes } from './hashtag';
// ...
  registerHashtagRoutes(fastify, prisma, requiredAuth);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/gateway && bun run test -- --testPathPatterns="posts/hashtag|posts/index"`
Expected: PASS

- [ ] **Step 5: Full verification**

Run: `cd services/gateway && npx tsc --noEmit`
Expected: 0 errors

Run: `cd services/gateway && bun run test:coverage`
Expected: all suites green (no regression elsewhere)

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/routes/posts/hashtag.ts services/gateway/src/routes/posts/__tests__/hashtag.test.ts services/gateway/src/routes/posts/index.ts
git commit -m "feat(gateway/hashtags): endpoints recherche + tendances"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (Task 1), §2 (Tasks 2-5), §3 (Task 6). §4/§5 (client rendering) are out of scope for this plan — covered by the iOS and web plans.
- **Type consistency:** `ExtractedHashtag {tag, display}` defined in Task 2, used identically through Tasks 3-6. `HashtagService` constructor `(prisma: PrismaClient)` consistent across all tasks.
- **Divergence from spec's literal §3 wording:** the spec said "mêmes règles de visibilité que le feed existant" for the search endpoint; this plan narrows that to PUBLIC+COMMUNITY only (excluding FRIENDS/EXCEPT/ONLY), matching the existing `getDiscoverStatuses`/`GET /posts/nearby` discovery-surface precedent rather than the full personalized-feed filter (`buildPostVisibilityOrFilter`, which needs a friends-ids computation that's private to `PostFeedService` and not worth duplicating for a discovery surface). Documented inline in `hashtag.ts`'s file header comment so this isn't silently narrower than a future reader expects from the spec text.

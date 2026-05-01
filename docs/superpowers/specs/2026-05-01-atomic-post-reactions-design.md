# S3 — Atomic Post Reactions Migration

**Date:** 2026-05-01
**Status:** Proposed (awaiting sprint allocation)
**Scope:** Gateway service, Prisma schema, optional iOS/web cache hints
**Severity:** P0 (data corruption + 16 MB doc cap timebomb)
**Owner:** TBD
**Related audits:** S3 (server audit), B8 (feed perf)

---

## Problem

`Post.reactions` is stored as an embedded JSON array inside each `Post` document:

```prisma
model Post {
  reactions       Json? @default("[]")  // [{ userId, emoji, createdAt }, ...]
  reactionSummary Json?
  reactionCount   Int  @default(0)
}
```

`PostService.likePost` uses a non-atomic **read-modify-write** pattern (`PostService.ts:493-519`):

```typescript
const post = await prisma.post.findFirst({ where: { id: postId } });   // 1️⃣ READ
const reactions = post.reactions ?? [];
if (reactions.find(r => r.userId === userId)) return post;
const updated = [...reactions, { userId, emoji, createdAt: ... }];
return prisma.post.update({                                            // 2️⃣ WRITE
  where: { id: postId },
  data: { reactions: updated, reactionCount: { increment: 1 }, ... }
});
```

This produces **three production-impacting issues**:

### P0a — Race condition: lost likes under concurrency

Two concurrent likes on the same post both read N reactions, both write N+1 (each containing only their own addition). One like is silently lost. `reactionCount: { increment: 1 }` runs atomically and ends at N+2, leaving `reactionCount` permanently desynchronized from `reactions.length`.

Bug surfaces under any concurrent-like load (viral story, batch test, multi-device of same author).

### P0b — MongoDB 16 MB document cap

Each `{userId, emoji, createdAt}` ≈ 80–100 bytes. At ~50 000 likes a single Post can hit the cap. Combined with the parallel `storyViews: Json[]` (same pattern), viral stories become unwriteable: every subsequent view, like, edit fails with `BSONObjTooLarge`. There is no recovery path other than data migration.

### P1 — Quadratic feed read cost

Every feed query (`getStories`, `getFeed`) returns the full `reactions[]` JSON inline per post. Then `enrichWithLikeStatus` does a linear `reactions.find(r => r.userId === me)` per post. With 50 posts × 10 000 reactions each = **500 000 in-memory comparisons per feed request, per user**. Hot path P1 (audit B8.5).

---

## Solution

Move `reactions` to a dedicated `PostReaction` collection with a `@@unique([postId, userId])` index. The pattern already exists for `Comment.reactions` in this codebase — same idiom, same Prisma conventions.

`likePost` becomes a single atomic insert (gated by the unique index); `unlikePost` becomes an atomic delete; counters are recomputed via `groupBy` aggregation or maintained as approximate cached fields.

---

## Design

### 1. Schema additions

```prisma
model PostReaction {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  postId    String   @db.ObjectId
  userId    String   @db.ObjectId
  emoji     String   // single grapheme; max 8 chars at validation layer
  createdAt DateTime @default(now())

  post      Post     @relation("PostReactionsV2", fields: [postId], references: [id], onDelete: Cascade)
  user      User     @relation("UserPostReactions", fields: [userId], references: [id])

  @@unique([postId, userId])    // atomic gate: one reaction per (post, user)
  @@index([postId, createdAt])  // list all reactions for a post, newest first
  @@index([userId, createdAt])  // "what has this user liked recently"
}

model Post {
  // ...existing fields...

  /// @deprecated as of 2026-05-XX. Read-only during migration window.
  /// Removed in S3.4 cleanup once `reactionsV2` is the sole source of truth.
  reactions       Json? @default("[]")

  reactionsV2     PostReaction[] @relation("PostReactionsV2")
}

model User {
  // ...existing fields...
  postReactions   PostReaction[] @relation("UserPostReactions")
}
```

**Migration command:** `cd packages/shared && pnpm prisma db push` (MongoDB doesn't use migration files; `db push` syncs the new collection + indexes).

**No data move at this step** — the legacy `reactions` JSON stays untouched. Reads merge both sources during the transition.

### 2. Service-layer changes (`PostService.ts`)

#### 2.1 `likePost` — atomic create

```typescript
async likePost(postId: string, userId: string, emoji: string = '❤️') {
  // Validate post exists + accessible (preserves existing visibility check)
  const accessible = await this.assertPostVisible(postId, userId);
  if (!accessible) return null;

  try {
    await this.prisma.postReaction.create({
      data: { postId, userId, emoji },
    });
  } catch (err) {
    // P2002 = unique constraint failure → user already liked this post.
    // We treat that as idempotent success (no double-counting).
    if (this.isUniqueViolation(err)) {
      return this.fetchPostWithReactionStatus(postId, userId);
    }
    throw err;
  }

  // Increment counters atomically via Prisma's built-in $inc.
  // `reactionCount` and `likeCount` were both incremented in the legacy code;
  // we keep both for backward-compat consumers until S3.4.
  await this.prisma.post.update({
    where: { id: postId },
    data: {
      likeCount: { increment: 1 },
      reactionCount: { increment: 1 },
    },
  });

  // `reactionSummary` is a hot read field (rendered in feed badges); recompute
  // it via groupBy and write back. Deliberately NOT inline in the create
  // transaction — the summary is approximate by design (we accept a 1-event
  // staleness window to keep likePost fast).
  await this.refreshReactionSummary(postId);

  return this.fetchPostWithReactionStatus(postId, userId);
}

private async refreshReactionSummary(postId: string): Promise<void> {
  const grouped = await this.prisma.postReaction.groupBy({
    by: ['emoji'],
    where: { postId },
    _count: { _all: true },
  });
  const summary = grouped.reduce<Record<string, number>>((acc, row) => {
    acc[row.emoji] = row._count._all;
    return acc;
  }, {});
  await this.prisma.post.update({
    where: { id: postId },
    data: { reactionSummary: summary },
  });
}

private isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'code' in err
    && (err as { code: string }).code === 'P2002';
}
```

#### 2.2 `unlikePost` — atomic delete

```typescript
async unlikePost(postId: string, userId: string) {
  const deleted = await this.prisma.postReaction.deleteMany({
    where: { postId, userId },
  });

  if (deleted.count === 0) {
    // Either the user hadn't liked, OR the like was migrated and we need to
    // also clean the legacy JSON. Read-merge below handles the legacy case.
    await this.removeLegacyReactionIfPresent(postId, userId);
    return this.fetchPostWithReactionStatus(postId, userId);
  }

  await this.prisma.post.update({
    where: { id: postId },
    data: {
      likeCount: { decrement: 1 },
      reactionCount: { decrement: 1 },
    },
  });

  await this.refreshReactionSummary(postId);
  return this.fetchPostWithReactionStatus(postId, userId);
}

/// Used during the migration window to handle posts whose reactions were never
/// migrated yet (created BEFORE S3.1, never received a write since). Removed
/// in S3.4.
private async removeLegacyReactionIfPresent(postId: string, userId: string): Promise<void> {
  const post = await this.prisma.post.findUnique({
    where: { id: postId },
    select: { reactions: true },
  });
  if (!post) return;
  const legacy = (post.reactions as Array<{ userId: string }> | null) ?? [];
  if (!legacy.some(r => r.userId === userId)) return;
  const filtered = legacy.filter(r => r.userId !== userId);
  await this.prisma.post.update({
    where: { id: postId },
    data: {
      reactions: filtered as unknown as Prisma.InputJsonValue,
      likeCount: { decrement: 1 },
      reactionCount: { decrement: 1 },
    },
  });
  await this.refreshReactionSummary(postId);
}
```

#### 2.3 Feed read path — `fetchPostWithReactionStatus`

```typescript
/// Returns the post with `currentUserLiked: boolean` and a fresh
/// `reactionSummary`. Pulls reactions from the new `PostReaction` collection
/// FIRST, falls back to the legacy JSON for posts not yet migrated.
private async fetchPostWithReactionStatus(postId: string, userId: string) {
  const post = await this.prisma.post.findFirst({
    where: { id: postId },
    include: {
      ...postInclude,
      reactionsV2: {
        where: { userId },         // ← only the row for the current user
        select: { emoji: true },
      },
    },
  });
  if (!post) return null;
  // Merge: liked = either the new collection has a row, OR the legacy JSON contains us
  const newLiked = (post as any).reactionsV2.length > 0;
  const legacyLiked = ((post.reactions as Array<{ userId: string }> | null) ?? [])
    .some(r => r.userId === userId);
  return { ...post, currentUserLiked: newLiked || legacyLiked };
}
```

For batch reads (`getStories`, `getFeed`), use one Prisma `include` with the user-scoped where clause — Prisma compiles this into a single `$lookup` aggregation per query, **not** N+1.

### 3. Migration script (S3.3)

`scripts/migrate-post-reactions.ts`:

```typescript
import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient();
const BATCH_SIZE = 100;
const SLEEP_MS_BETWEEN_BATCHES = 200; // throttle to avoid spiking DB

async function main() {
  let cursor: string | undefined = undefined;
  let totalMigrated = 0;
  let totalSkipped = 0;
  let batchIdx = 0;

  while (true) {
    const posts = await prisma.post.findMany({
      where: { reactions: { not: null } },
      select: { id: true, reactions: true },
      orderBy: { id: 'asc' },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: BATCH_SIZE,
    });

    if (posts.length === 0) break;
    cursor = posts[posts.length - 1].id;
    batchIdx++;

    const rows: { postId: string; userId: string; emoji: string; createdAt: Date }[] = [];
    for (const post of posts) {
      const reactions = (post.reactions as any[] | null) ?? [];
      for (const r of reactions) {
        if (typeof r?.userId !== 'string' || typeof r?.emoji !== 'string') continue;
        const createdAt = r.createdAt ? new Date(r.createdAt) : new Date();
        if (Number.isNaN(createdAt.getTime())) continue;
        rows.push({ postId: post.id, userId: r.userId, emoji: r.emoji, createdAt });
      }
    }

    if (rows.length > 0) {
      // `skipDuplicates: true` makes the script idempotent — re-running won't
      // create dupes thanks to the @@unique([postId, userId]) constraint.
      const result = await prisma.postReaction.createMany({
        data: rows,
        skipDuplicates: true,
      });
      totalMigrated += result.count;
    } else {
      totalSkipped += posts.length;
    }

    console.log(
      `[migrate-post-reactions] batch=${batchIdx} processed=${posts.length} ` +
      `inserted=${rows.length} totalMigrated=${totalMigrated} cursor=${cursor}`
    );

    await new Promise(r => setTimeout(r, SLEEP_MS_BETWEEN_BATCHES));
  }

  console.log(`[migrate-post-reactions] DONE. migrated=${totalMigrated} skipped=${totalSkipped}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

**Idempotent:** safe to re-run. Cursor-based for resumability if interrupted.

### 4. Cleanup (S3.4 — defer 2+ weeks after S3.3)

Once the migration script has been verified on staging + production:

```typescript
// scripts/null-legacy-post-reactions.ts
await prisma.post.updateMany({
  where: { reactions: { not: null } },
  data: { reactions: Prisma.JsonNull },
});
```

Then in a follow-up schema commit:

```prisma
model Post {
  // reactions       Json? @default("[]")  ← REMOVED
  reactionsV2     PostReaction[] @relation("PostReactionsV2")
}
```

And drop all the `legacy*` helpers from `PostService.ts`.

---

## Implementation Order (sub-batches)

| Batch | Scope | Code | Risk |
|---|---|---|---|
| **S3.1** | Schema + create-only path: add `PostReaction` model, write to BOTH new + legacy in `likePost`/`unlikePost`, no read change yet | ~80 LOC | Bas (additive) |
| **S3.2** | Read path: include `reactionsV2` in feed queries, merge with legacy in `fetchPostWithReactionStatus` | ~60 LOC | Bas (read fall-through) |
| **S3.3** | Migration script + run on staging | ~100 LOC + ops time | Bas (idempotent) |
| **S3.4** | Stop writing to legacy JSON; null out the field in DB; remove the column from schema; remove fallback helpers | ~30 LOC | Bas (after verification) |

Each sub-batch is a single PR. **Production deploys can pause between any two.** S3.1 + S3.2 are both safe to run alone (they leave the legacy JSON intact and consistent).

---

## Testing

### Unit tests (`PostService.test.ts`)

```typescript
describe('PostService.likePost (atomic)', () => {
  it('rejects double-like via unique constraint, returns idempotent success', async () => {
    await service.likePost(postId, userId, '❤️');
    const result = await service.likePost(postId, userId, '❤️');
    expect(result.likeCount).toBe(1);
    const reactions = await prisma.postReaction.count({ where: { postId } });
    expect(reactions).toBe(1);
  });

  it('handles 100 concurrent likes from 100 distinct users without losing any', async () => {
    const userIds = Array.from({ length: 100 }, () => generateMongoId());
    await Promise.all(userIds.map(uid => service.likePost(postId, uid, '🔥')));
    const reactions = await prisma.postReaction.count({ where: { postId } });
    expect(reactions).toBe(100);
    const post = await prisma.post.findUnique({ where: { id: postId } });
    expect(post?.reactionCount).toBe(100);
  });

  it('handles 100 concurrent likes from THE SAME user without losing the increment count consistency', async () => {
    await Promise.all(Array.from({ length: 100 }, () =>
      service.likePost(postId, sameUserId, '❤️')
    ));
    const reactions = await prisma.postReaction.count({ where: { postId } });
    expect(reactions).toBe(1);
    const post = await prisma.post.findUnique({ where: { id: postId } });
    expect(post?.reactionCount).toBe(1);
  });
});

describe('PostService.unlikePost (atomic)', () => {
  it('removes only the caller\'s reaction', async () => {
    await service.likePost(postId, alice, '❤️');
    await service.likePost(postId, bob, '🔥');
    await service.unlikePost(postId, alice);
    const reactions = await prisma.postReaction.findMany({ where: { postId } });
    expect(reactions).toHaveLength(1);
    expect(reactions[0].userId).toBe(bob);
  });

  it('falls back to legacy JSON for un-migrated posts', async () => {
    await prisma.post.update({
      where: { id: postId },
      data: { reactions: [{ userId: alice, emoji: '❤️', createdAt: new Date().toISOString() }] as any },
    });
    await service.unlikePost(postId, alice);
    const post = await prisma.post.findUnique({ where: { id: postId } });
    expect((post?.reactions as any[]).length).toBe(0);
  });
});
```

### Migration tests

```typescript
describe('migrate-post-reactions script', () => {
  it('is idempotent — re-running creates 0 dupes', async () => {
    await runMigration();
    const before = await prisma.postReaction.count();
    await runMigration();
    const after = await prisma.postReaction.count();
    expect(after).toBe(before);
  });

  it('handles malformed legacy entries gracefully (missing userId/emoji)', async () => {
    await prisma.post.update({
      where: { id: postId },
      data: { reactions: [{ userId: alice }, { emoji: '❤️' }, null, undefined] as any },
    });
    await runMigration();
    expect(await prisma.postReaction.count({ where: { postId } })).toBe(0);
  });
});
```

### Load test

Run the existing `services/gateway/src/__tests__/performance/` suite with a new scenario: **1000 concurrent likes on the same post from 1000 distinct users**. Assert `reactionCount === 1000` and `PostReaction.count() === 1000`.

---

## Rollout

1. **S3.1 deploy** to staging → verify likes work, check that BOTH `reactions` JSON and `reactionsV2` collection get populated on new likes.
2. **Soak 24h** on staging with synthetic load.
3. **S3.1 prod deploy** during low-traffic window.
4. **24h prod observation**: monitor `PostReaction.count()` growth = expected new-likes rate.
5. **S3.2 deploy** (read path) — both staging + prod. No user-visible change.
6. **S3.3 migration** — run on staging, then on prod. Throttled, ~50ms/100 reactions ≈ 5h for 1M reactions.
7. **2 weeks observation** — verify no consumer reads from the legacy JSON.
8. **S3.4 deploy** — stop legacy writes + null-out + remove fallback. Final cleanup.

---

## Failure modes & mitigations

| Failure | Mitigation |
|---|---|
| Migration script crashes mid-run | Cursor-based + idempotent `skipDuplicates`; restart from saved cursor |
| `PostReaction.create` succeeds but `Post.update` (counter increment) fails | The next read returns `currentUserLiked: true` correctly via the `reactionsV2.length > 0` check; `reactionCount` resyncs on next `refreshReactionSummary` call. Worst case = 1-event staleness on the badge |
| Production load spike during S3.3 migration | The throttle (`200ms` between batches) limits sustained DB load to ~500 inserts/sec. Pause the script via SIGTERM if needed |
| Need to roll back S3.1 mid-deploy | Legacy JSON is still being written → fully reversible. Roll back the deploy and `prisma.postReaction.deleteMany({})` to clear the new collection |
| Migration produces wrong counts due to stale `reactionCount` | After S3.3 completes, run `scripts/recompute-reaction-counts.ts` once to set `reactionCount = PostReaction.count({where: {postId}})` per post |

---

## Out of scope (defer)

- **Reaction notifications** — separate concern; existing `notificationService.createPostLikeNotification` keeps working unchanged.
- **Comment reactions** — already on the proper collection; no work needed.
- **`storyViews` Json field** — same anti-pattern as `Post.reactions`. Should follow S3 with an analogous `PostView` migration in **S3-bis** (collection `PostView` already exists per `schema.prisma:2858` — only the gateway doesn't use it consistently). Listed as audit S3 second half.
- **Real-time `STORY_REACTED` Socket.IO event semantics** — already handled in batch 5 (`a1b04b6`). The migration to atomic reactions does not change the broadcast payload.

---

## Estimated effort

| Phase | Engineering | DBA / Ops | Calendar |
|---|---|---|---|
| S3.1 | 1 day | 0 | 1 day |
| S3.2 | 1 day | 0 | 1 day |
| S3.3 | 0.5 day code + run on staging + prod | 0.5 day for monitoring | 1 day + 24h observation |
| S3.4 | 0.5 day | 0 | 0.5 day + 2 weeks observation between S3.3 and S3.4 |
| **Total** | **3 days** | **0.5 day** | **1 sprint (with the observation gates)** |

---

## Acceptance criteria

- [ ] No data loss observed under 1000 concurrent likes test
- [ ] Feed query for 50 stories returns `currentUserLiked` for current user without scanning the embedded JSON
- [ ] Migration script logs `migrated=N skipped=0` and `prisma.postReaction.count() ≥ sum(post.reactions.length)` (legacy)
- [ ] After S3.4, `Post.reactions` field no longer present in the schema; `grep -r "post.reactions" services/gateway/src` returns 0 matches
- [ ] Existing `/posts/:id/like` rate-limit test (10/min/user) still passes
- [ ] No regression on iOS reaction UX (batch 5's `LikeRequest` body still honoured; emoji preserved end-to-end)

---

## References

- Audit S3 (server-side): commit message of `62b0430` ("non-atomic embedded array push")
- Pattern precedent: `Comment.reactions` collection (`schema.prisma:981`)
- Hot-path read concern: audit B8.5 ("`enrichWithLikeStatus` linear scan")
- Related: `STORY_REACTED` privacy fix (commit `a1b04b6`, batch 5)

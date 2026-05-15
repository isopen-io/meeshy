#!/usr/bin/env tsx
/**
 * Phase 3G — Backfill Post.reactions: Json[] into PostReaction rows.
 *
 * WHEN TO RUN
 * -----------
 * After Phase 3A–3F have been deployed to production. Phase 3A created the
 * PostReaction table. Phase 3C made PostService write to both the old Json
 * field and the new table for all NEW reactions. This script backfills all
 * EXISTING embedded reactions (written before Phase 3) into PostReaction rows.
 *
 * Run from the repo root (or inside the gateway container):
 *   pnpm tsx scripts/migrate-post-reactions.ts [--dry-run] [--batch-size=1000] [--from-cursor=<postId>]
 *
 * Docker (gateway container):
 *   docker cp scripts/migrate-post-reactions.ts meeshy-gateway:/tmp/
 *   docker exec meeshy-gateway pnpm tsx /tmp/migrate-post-reactions.ts --dry-run
 *   docker exec meeshy-gateway pnpm tsx /tmp/migrate-post-reactions.ts
 *
 * IDEMPOTENCY
 * -----------
 * Individual inserts that conflict with the @@unique([postId, userId, emoji])
 * constraint are silently dropped (Prisma error code P2002). Running this
 * script twice is safe and produces no duplicate rows.
 *
 * RESUMING
 * --------
 * If the script is interrupted, resume it with --from-cursor=<postId> where
 * <postId> is the last "Last cursor:" value printed to stdout. Cursor-based
 * pagination (not offset) guarantees no posts are skipped even if new posts
 * are inserted during the migration.
 *
 * NON-DESTRUCTIVE
 * ---------------
 * Post.reactions: Json[] is NOT modified. Deprecation is deferred to Phase 4.
 *
 * EXPECTED RUNTIME ESTIMATE
 * -------------------------
 * ~1M posts × ~5ms per post (network + DB) = ~80 minutes single-threaded.
 * Tune --batch-size upward (e.g. 5000) to reduce DB round-trips; each batch
 * issues one SELECT and N individual INSERT calls (one per reaction row).
 * Running from inside the gateway container collocated with MongoDB is fastest.
 *
 * NOTE on createMany + skipDuplicates
 * ------------------------------------
 * MongoDB with Prisma 6 does NOT support createMany({ skipDuplicates: true }).
 * We fall back to individual prisma.postReaction.create() calls, catching P2002
 * (unique constraint violation) to swallow duplicates. This is the established
 * pattern in this codebase (see MentionService, user-deletions route).
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { embeddedReactionsToRows } from './lib/embedded-reactions-to-rows.js';

type Args = {
  readonly dryRun: boolean;
  readonly batchSize: number;
  readonly fromCursor: string | undefined;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  return {
    dryRun: argv.includes('--dry-run'),
    batchSize: Number(
      argv.find((a) => a.startsWith('--batch-size='))?.split('=')[1] ?? 1000,
    ),
    fromCursor: argv.find((a) => a.startsWith('--from-cursor='))?.split('=')[1],
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const prisma = new PrismaClient();

  console.log(
    `[migrate-post-reactions] start — dry-run=${args.dryRun}, batch-size=${args.batchSize}, from-cursor=${args.fromCursor ?? 'none'}`,
  );

  let processedPosts = 0;
  let createdRows = 0;
  let skippedDuplicates = 0;
  let totalMalformed = 0;
  let cursor: string | undefined = args.fromCursor;

  try {
    while (true) {
      const posts = await prisma.post.findMany({
        where: {
          isDeleted: false,
          reactions: { not: null },
        },
        select: { id: true, reactions: true },
        orderBy: { id: 'asc' },
        take: args.batchSize,
        ...(cursor !== undefined
          ? { cursor: { id: cursor }, skip: 1 }
          : {}),
      });

      if (posts.length === 0) break;

      for (const post of posts) {
        const { rows, malformedCount } = embeddedReactionsToRows(
          post.id,
          post.reactions,
        );
        totalMalformed += malformedCount;

        if (rows.length === 0) continue;

        if (args.dryRun) {
          createdRows += rows.length;
          continue;
        }

        // MongoDB + Prisma 6 does not support createMany({ skipDuplicates: true }).
        // Insert individually and catch P2002 (unique constraint) as a no-op.
        for (const row of rows) {
          try {
            await prisma.postReaction.create({
              data: {
                postId: row.postId,
                userId: row.userId,
                emoji: row.emoji,
                ...(row.createdAt !== undefined
                  ? { createdAt: row.createdAt }
                  : {}),
              },
            });
            createdRows += 1;
          } catch (err: unknown) {
            if (
              err !== null &&
              typeof err === 'object' &&
              'code' in err &&
              (err as { code: unknown }).code === 'P2002'
            ) {
              skippedDuplicates += 1;
            } else {
              throw err;
            }
          }
        }
      }

      processedPosts += posts.length;
      cursor = posts[posts.length - 1].id;

      if (processedPosts % 1000 === 0 || posts.length < args.batchSize) {
        console.log(
          `[migrate-post-reactions] processed=${processedPosts} posts, created=${createdRows} rows, duplicates-skipped=${skippedDuplicates}, malformed-skipped=${totalMalformed}. Last cursor: ${cursor}`,
        );
      }
    }

    console.log(
      `[migrate-post-reactions] DONE — processed=${processedPosts} posts, created=${createdRows} rows, duplicates-skipped=${skippedDuplicates}, malformed-skipped=${totalMalformed}, dry-run=${args.dryRun}`,
    );

    if (totalMalformed > 0) {
      console.warn(
        `[migrate-post-reactions] WARNING: ${totalMalformed} embedded reaction entries were skipped due to missing or invalid fields (userId not a valid ObjectId, or emoji not a non-empty string).`,
      );
    }
  } catch (err) {
    console.error('[migrate-post-reactions] ERROR:', err);
    console.error(
      `[migrate-post-reactions] Resume with: --from-cursor=${cursor ?? 'none'}`,
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();

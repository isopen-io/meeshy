/**
 * One-shot migration script to fix ConversationReadCursor entries
 * where participantId was incorrectly set to userId.
 *
 * For each ConversationReadCursor:
 *   1. Check if participantId matches any Participant.id
 *   2. If NOT: look up Participant by userId=cursor.participantId + conversationId
 *   3. If found: update cursor.participantId to the real participant.id
 *   4. If not found: delete the orphan cursor
 *
 * Usage: npx tsx scripts/fix-orphan-cursors.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function fixOrphanCursors() {
  if (dryRun) {
    console.log('DRY RUN — no changes will be made\n');
  }

  const cursors = await prisma.conversationReadCursor.findMany();
  console.log(`Found ${cursors.length} total cursors\n`);

  let fixed = 0;
  let deleted = 0;
  let valid = 0;

  for (const cursor of cursors) {
    const participant = await prisma.participant.findUnique({
      where: { id: cursor.participantId },
    });

    if (participant) {
      valid++;
      continue;
    }

    // participantId doesn't match any Participant — it's probably a userId
    const realParticipant = await prisma.participant.findFirst({
      where: {
        userId: cursor.participantId,
        conversationId: cursor.conversationId,
      },
    });

    if (realParticipant) {
      if (!dryRun) {
        await prisma.conversationReadCursor.update({
          where: { id: cursor.id },
          data: { participantId: realParticipant.id },
        });
      }
      fixed++;
      console.log(
        `${dryRun ? '[DRY] ' : ''}Fixed cursor ${cursor.id}: ${cursor.participantId} -> ${realParticipant.id}`,
      );
    } else {
      if (!dryRun) {
        await prisma.conversationReadCursor.delete({
          where: { id: cursor.id },
        });
      }
      deleted++;
      console.log(
        `${dryRun ? '[DRY] ' : ''}Deleted orphan cursor ${cursor.id} (conversationId=${cursor.conversationId})`,
      );
    }
  }

  console.log(`\nResults: ${valid} valid, ${fixed} fixed, ${deleted} deleted`);
}

fixOrphanCursors()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

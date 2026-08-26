/**
 * GC des participants orphelins — lignes `Participant` dont le
 * `conversationId` ne résout plus aucune `Conversation` (conversation
 * supprimée hors Prisma).
 *
 * La relation `conversation` étant REQUISE côté schéma, ces lignes font
 * rejeter toute lecture qui la charge (`PrismaClientUnknownRequestError:
 * Field conversation is required to return data, got null`) — dont le
 * snapshot de pastilles à la reconnexion
 * (`MeeshySocketIOManager._emitUnreadCountsSnapshot`), désormais tolérant,
 * qui publie les ids orphelins en warn structuré pour alimenter ce script.
 *
 * Dry-run PAR DÉFAUT : liste les orphelins sans rien toucher.
 * `--apply` les supprime.
 *
 * Usage (depuis services/gateway, ou le conteneur gateway) :
 *   npx tsx ../../scripts/maintenance/fix-orphan-participants.ts [--apply]
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

const BATCH_SIZE = 1000;

type OrphanParticipant = {
  id: string;
  conversationId: string;
  userId: string | null;
  displayName: string | null;
};

async function findOrphanParticipants(): Promise<OrphanParticipant[]> {
  const orphans: OrphanParticipant[] = [];
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.participant.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, conversationId: true, userId: true, displayName: true },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    const conversationIds = [...new Set(batch.map(p => p.conversationId))];
    const existing = await prisma.conversation.findMany({
      where: { id: { in: conversationIds } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map(c => c.id));
    orphans.push(...batch.filter(p => !existingIds.has(p.conversationId)));

    if (batch.length < BATCH_SIZE) break;
  }

  return orphans;
}

async function fixOrphanParticipants(): Promise<void> {
  console.log(
    apply
      ? 'APPLY — orphan participants will be DELETED\n'
      : 'DRY RUN — no changes will be made (pass --apply to delete)\n'
  );

  const orphans = await findOrphanParticipants();

  if (orphans.length === 0) {
    console.log('No orphan participants found');
    return;
  }

  for (const orphan of orphans) {
    console.log(
      `${apply ? '' : '[DRY] '}Orphan participant ${orphan.id} ` +
        `(conversationId=${orphan.conversationId}, ` +
        `userId=${orphan.userId ?? 'anonymous'}, ` +
        `displayName=${orphan.displayName ?? '-'})`
    );
  }

  if (!apply) {
    console.log(`\nFound ${orphans.length} orphan participants — re-run with --apply to delete`);
    return;
  }

  const { count } = await prisma.participant.deleteMany({
    where: { id: { in: orphans.map(o => o.id) } },
  });
  console.log(`\nDeleted ${count} orphan participants`);
}

fixOrphanParticipants()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

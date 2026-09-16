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
 * `Message.sender` est, lui, une relation REQUISE vers `Participant` (#6501) :
 * effacer un participant qui a écrit sans retirer ses messages les rend
 * orphelins à leur tour. Leur conversation ayant disparu, aucune lecture
 * directe ne les atteint — mais un message TRANSFÉRÉ ailleurs qui cite l'un
 * d'eux charge son expéditeur (`enrichForwardedMessagesForList`), et fait
 * alors rejeter toute la page chez le destinataire. Ce script retire donc les
 * messages d'un participant orphelin AVANT de le supprimer — `prisma` émule
 * les `onDelete: Cascade` de leurs enfants (`MessageStatusEntry`, `Reaction`,
 * `MessageAttachment`, …).
 *
 * Dry-run PAR DÉFAUT : liste les orphelins (et compte leurs messages) sans
 * rien toucher. `--apply` les supprime.
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

  const orphanIds = orphans.map(o => o.id);

  if (!apply) {
    const orphanedMessages = await prisma.message.count({ where: { senderId: { in: orphanIds } } });
    console.log(
      `\nFound ${orphans.length} orphan participants ` +
        `(${orphanedMessages} of their messages would also be deleted) — re-run with --apply to delete`
    );
    return;
  }

  // Retirer d'abord les messages de ces participants : un orphelin qui a
  // écrit ne doit jamais survivre à son auteur (#6518). `prisma` émule les
  // `onDelete: Cascade` déclarés au schéma pour leurs enfants.
  const { count: deletedMessages } = await prisma.message.deleteMany({
    where: { senderId: { in: orphanIds } },
  });
  if (deletedMessages > 0) {
    console.log(`Deleted ${deletedMessages} messages of orphan participants (and their cascaded children)`);
  }

  const { count } = await prisma.participant.deleteMany({
    where: { id: { in: orphanIds } },
  });
  console.log(`\nDeleted ${count} orphan participants`);
}

fixOrphanParticipants()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

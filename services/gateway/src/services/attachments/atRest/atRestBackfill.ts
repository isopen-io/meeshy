/**
 * #13100 — le RATTRAPAGE : les pièces jointes des conversations `server` /
 * `hybrid` déposées avant le scellement au repos sont encore en clair sur le
 * disque. Ce balayage les scelle par le MÊME site que l'envoi
 * (`sealAttachmentFiles`) ; il est donc idempotent — une pièce déjà scellée
 * est comptée, jamais rescellée — et se rejoue après une interruption.
 *
 * À blanc, il ne fait que LIRE (`planAttachmentSealing`) et compte : pièces,
 * fichiers à sceller, pièces déjà scellées, pièces écartées et pourquoi. Il ne
 * journalise ni nom, ni chemin, ni contenu : des identifiants et des nombres.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { sealsAtRest } from '../../messaging/atRestWrite';
import { isServerAtRestMode } from '../../messaging/serverAtRest';
import { planAttachmentSealing, sealAttachmentFiles, type SealAttachmentDeps } from './sealAttachmentFiles';

export type AtRestBackfillDeps = SealAttachmentDeps & {
  readonly prisma: Pick<PrismaClient, 'messageAttachment' | 'message' | 'conversation'>;
};

export type AtRestBackfillReport = {
  readonly conversations: number;
  readonly pieces: number;
  readonly toSeal: number;
  readonly filesToSeal: number;
  readonly sealed: number;
  readonly alreadySealed: number;
  readonly skipped: Readonly<Record<string, number>>;
  readonly failed: number;
};

const MESSAGE_BATCH = 500;

type RegimeRow = { readonly id: string; readonly encryptionMode?: string | null; readonly encryptionEnabledAt?: Date | null };

async function atRestConversations(prisma: AtRestBackfillDeps['prisma']): Promise<readonly string[]> {
  const rows: readonly RegimeRow[] = await prisma.conversation.findMany({
    where: { encryptionMode: { in: ['server', 'hybrid', 'SERVER', 'HYBRID', 'Server', 'Hybrid'] } },
    select: { id: true, encryptionMode: true, encryptionEnabledAt: true },
  });
  return rows.filter((row) => isServerAtRestMode(row.encryptionMode) && sealsAtRest(row)).map((row) => row.id);
}

async function piecesOf(prisma: AtRestBackfillDeps['prisma'], conversationId: string): Promise<readonly string[]> {
  const messages = await prisma.message.findMany({ where: { conversationId }, select: { id: true } });
  const batches = Array.from({ length: Math.ceil(messages.length / MESSAGE_BATCH) }, (_, index) =>
    messages.slice(index * MESSAGE_BATCH, (index + 1) * MESSAGE_BATCH).map((message) => message.id)
  );
  const pieces = await Promise.all(
    batches.map((ids) => prisma.messageAttachment.findMany({ where: { messageId: { in: ids } }, select: { id: true } }))
  );
  return pieces.flat().map((piece) => piece.id);
}

export async function backfillAtRestAttachments(
  deps: AtRestBackfillDeps,
  options: { readonly dryRun: boolean; readonly log: (line: string) => void }
): Promise<AtRestBackfillReport> {
  const conversations = await atRestConversations(deps.prisma);
  const report = { conversations: conversations.length, pieces: 0, toSeal: 0, filesToSeal: 0, sealed: 0, alreadySealed: 0, failed: 0 };
  const skipped: Record<string, number> = {};
  for (const conversationId of conversations) {
    for (const attachmentId of await piecesOf(deps.prisma, conversationId)) {
      report.pieces += 1;
      const plan = await planAttachmentSealing(deps, attachmentId);
      if (plan.kind === 'skip') {
        if (plan.outcome.status === 'already-sealed') report.alreadySealed += 1;
        if (plan.outcome.status === 'skipped') skipped[plan.outcome.reason] = (skipped[plan.outcome.reason] ?? 0) + 1;
        continue;
      }
      report.toSeal += 1;
      report.filesToSeal += plan.toSeal.length;
      if (options.dryRun) continue;
      try {
        const outcome = await sealAttachmentFiles(deps, { attachmentId, conversationId });
        if (outcome.status === 'sealed') report.sealed += 1;
      } catch (error) {
        report.failed += 1;
        options.log(`  échec : pièce ${attachmentId} (${error instanceof Error ? error.name : 'inconnu'})`);
      }
    }
  }
  const final = { ...report, skipped };
  options.log(`  conversations server/hybrid activées : ${final.conversations}`);
  options.log(`  pièces jointes : ${final.pieces} — déjà scellées : ${final.alreadySealed}, à sceller : ${final.toSeal} (${final.filesToSeal} fichiers)`);
  options.log(`  écartées : ${JSON.stringify(final.skipped)}`);
  if (!options.dryRun) options.log(`  scellées : ${final.sealed}, échecs : ${final.failed}`);
  return final;
}

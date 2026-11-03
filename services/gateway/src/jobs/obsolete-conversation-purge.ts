/**
 * #14643 — LA PURGE DES CONVERSATIONS OBSOLÈTES, 48 h après leur obsolescence.
 *
 * `DELETE /conversations/:id/obsolete` (`services/conversations/obsoleteConversation.ts`)
 * rend le contenu illisible tout de suite et pose `purgeAfter`. Ce balayage
 * efface ensuite, en cascade : fichiers et pièces (par `AttachmentService.
 * deleteAttachment`, qui n'efface des octets que lorsque plus aucune ligne ne
 * les désigne), lignes de scellement, réactions, mentions, accusés, enveloppes
 * E2EE, traductions partagées, messages, liens de suivi et de partage, appels,
 * préférences, résumés d'agent, participants, enregistrements d'appel (sans
 * relation Prisma) et clés serveur qu'aucune autre conversation n'utilise. La ligne `Conversation` reste,
 * vidée de son titre et de ses images : c'est la pierre tombale que lisent les
 * anciens clients (`closedAt`), et `purgeAfter: null` marque la purge faite.
 *
 * L'INTERRUPTEUR. La purge n'écrit que si `OBSOLETE_CONVERSATION_PURGE_ENABLED`
 * vaut exactement `true`. Désarmée, elle COMPTE ce qu'elle effacerait. En
 * production, l'armer attend le feu vert du porteur et une sauvegarde vérifiée.
 *
 * CE QU'ELLE PEUT VISER. Trois marques que seule l'obsolescence pose ensemble —
 * `purgeAfter` échu, `deletedAt` vieux de 48 h, `isActive: false` — relues en
 * mémoire après la requête, et jamais la conversation globale.
 *
 * IDEMPOTENTE. Chaque étape est un `deleteMany` filtré : une passe interrompue
 * laisse `purgeAfter` posé, et la suivante reprend là où elle s'est arrêtée.
 * Une pièce dont le fichier résiste arrête SA conversation avant les messages,
 * et la fait reculer de six heures dans la file : un échec tenace ne bloque
 * jamais les suivantes.
 *
 * AUCUN GEL PAR SIGNALEMENT (#14691, décision porteur du 2026-11-03). Une
 * conversation obsolète n'est pas un objet de signalement : gelée côté serveur
 * dès l'émission, sans trace chez les clients, elle est détruite à 48 h. Ces
 * 48 h SONT la fenêtre de modération ; un signalement ouvert ne la prolonge pas.
 * Le gel qu'avait posé #14676 (option a, 2026-11-02) est retiré.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { isProtectedFromObsolescence, OBSOLETE_PURGE_DELAY_MS } from '../services/conversations/obsoleteConversation';

const logger = enhancedLogger.child({ module: 'ObsoleteConversationPurge' });

export const OBSOLETE_PURGE_EVERY_MS = 60 * 60 * 1000;
/** Le recul d'une conversation dont la purge a échoué : elle cède la tête de file aux suivantes. */
export const OBSOLETE_PURGE_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
const CONVERSATIONS_PER_PASS = 20;
const MESSAGE_PAGE = 500;
const MAX_MESSAGE_PAGES = 200;

export function obsoletePurgeArmed(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.OBSOLETE_CONVERSATION_PURGE_ENABLED === 'true';
}

export function obsoletePurgeWhere(now: Date) {
  return {
    purgeAfter: { lte: now },
    deletedAt: { lte: new Date(now.getTime() - OBSOLETE_PURGE_DELAY_MS) },
    isActive: false,
  };
}

export type ObsoletePurgeReport = {
  readonly applied: boolean;
  readonly candidates: number;
  readonly purged: number;
  readonly failed: number;
  /** Une conversation a plus de messages qu'une passe n'en balaie : elle reprend à la suivante. */
  readonly truncated: boolean;
};

export interface ObsoleteAttachmentRemover {
  deleteAttachment(attachmentId: string): Promise<void>;
}

type DeleteManyDelegate = { deleteMany(args: { where: Record<string, unknown> }): Promise<unknown> };

export type ObsoletePurgePrisma = Pick<
  PrismaClient,
  | 'conversation' | 'message' | 'messageAttachment' | 'attachmentFileAtRest' | 'trackingLink' | 'trackingLinkClick'
  | 'attachmentReaction' | 'attachmentStatusEntry' | 'reaction' | 'mention' | 'messageStatusEntry'
  | 'userMessageDeletion' | 'messageStar' | 'sharedTranslation' | 'messageEnvelope' | 'notification'
  | 'conversationReadCursor' | 'callSession' | 'conversationPreference' | 'userConversationPreferences'
  | 'conversationPublicKey' | 'conversationShare' | 'agentConfig' | 'agentUserRole' | 'agentConversationSummary'
  | 'agentAnalysisSnapshot' | 'conversationMessageStats' | 'agentAnalytic' | 'agentScanLog' | 'agentTopicUsageLog'
  | 'conversationShareLink' | 'participant' | 'callRecording' | 'serverEncryptionKey'
>;

/** Ce qui pend à un message, effacé avant lui. */
const messageScoped = (prisma: ObsoletePurgePrisma): readonly DeleteManyDelegate[] => [
  prisma.attachmentReaction, prisma.attachmentStatusEntry, prisma.reaction, prisma.mention, prisma.messageStatusEntry,
  prisma.userMessageDeletion, prisma.messageStar, prisma.sharedTranslation, prisma.messageEnvelope, prisma.notification,
] as unknown as readonly DeleteManyDelegate[];

/**
 * Ce qui pend à la conversation, effacé APRÈS ses messages ; les appels avant
 * les participants (un `CallParticipant` retient son `Participant`), les
 * participants en dernier (un `Message` retient son expéditeur).
 */
const conversationScoped = (prisma: ObsoletePurgePrisma): readonly DeleteManyDelegate[] => [
  prisma.messageStatusEntry, prisma.attachmentStatusEntry, prisma.conversationReadCursor, prisma.messageEnvelope,
  prisma.sharedTranslation, prisma.messageStar, prisma.callSession, prisma.conversationPreference,
  prisma.userConversationPreferences, prisma.conversationPublicKey, prisma.conversationShare, prisma.agentConfig,
  prisma.agentUserRole, prisma.agentConversationSummary, prisma.agentAnalysisSnapshot, prisma.conversationMessageStats,
  prisma.agentAnalytic, prisma.agentScanLog, prisma.agentTopicUsageLog, prisma.conversationShareLink, prisma.participant,
] as unknown as readonly DeleteManyDelegate[];

const alreadyGone = (error: unknown): boolean => error instanceof Error && error.message === 'Attachment not found';

async function eraseAttachments(remover: ObsoleteAttachmentRemover, attachmentIds: readonly string[]): Promise<void> {
  const outcomes = await Promise.allSettled(attachmentIds.map((id) => remover.deleteAttachment(id)));
  const resisted = outcomes.filter((outcome) => outcome.status === 'rejected' && !alreadyGone(outcome.reason));
  if (resisted.length > 0) throw new Error(`${resisted.length} attachment(s) could not be erased`);
}

async function purgeMessagePage(
  prisma: ObsoletePurgePrisma,
  remover: ObsoleteAttachmentRemover,
  conversationId: string,
  messageIds: readonly string[],
): Promise<void> {
  const ids = [...messageIds];
  const attachments = await prisma.messageAttachment.findMany({ where: { messageId: { in: ids } }, select: { id: true } });
  const attachmentIds = attachments.map((attachment) => attachment.id);
  if (attachmentIds.length > 0) {
    await eraseAttachments(remover, attachmentIds);
    await prisma.attachmentFileAtRest.deleteMany({ where: { attachmentId: { in: attachmentIds } } });
  }
  for (const delegate of messageScoped(prisma)) {
    await delegate.deleteMany({ where: { messageId: { in: ids } } });
  }
  await prisma.message.updateMany({ where: { conversationId, replyToId: { in: ids } }, data: { replyToId: null } });
  await prisma.message.deleteMany({ where: { conversationId, id: { in: ids } } });
}

/** Rend `true` si la conversation est entièrement purgée, `false` si ses messages dépassent la passe. */
async function purgeConversation(
  prisma: ObsoletePurgePrisma,
  remover: ObsoleteAttachmentRemover,
  conversationId: string,
): Promise<boolean> {
  for (let page = 0; page < MAX_MESSAGE_PAGES; page += 1) {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: MESSAGE_PAGE,
    });
    if (messages.length === 0) {
      await purgeConversationScoped(prisma, conversationId);
      return true;
    }
    await purgeMessagePage(prisma, remover, conversationId, messages.map((message) => message.id));
  }
  return false;
}

/** `CallRecording` ne pend à son appel par aucune relation Prisma : il part avant lui, explicitement. */
async function purgeCallRecordings(prisma: ObsoletePurgePrisma, conversationId: string): Promise<void> {
  const calls = await prisma.callSession.findMany({ where: { conversationId }, select: { id: true } });
  if (calls.length === 0) return;
  await prisma.callRecording.deleteMany({ where: { callSessionId: { in: calls.map((call) => call.id) } } });
}

/**
 * Les clés serveur de la conversation — celles qu'elle désigne et celles qui la
 * nomment — partent, sauf celles qu'une AUTRE conversation désigne encore ou
 * qui scellent encore un fichier d'une autre conversation.
 */
async function purgeServerEncryptionKeys(prisma: ObsoletePurgePrisma, conversationId: string): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { serverEncryptionKeyId: true },
  });
  const owned = await prisma.serverEncryptionKey.findMany({ where: { conversationId }, select: { id: true } });
  const candidates = [...new Set([...owned.map((key) => key.id), ...(conversation?.serverEncryptionKeyId ? [conversation.serverEncryptionKeyId] : [])])];
  const usedElsewhere = await Promise.all(
    candidates.map(async (keyId) => {
      const conversations = await prisma.conversation.count({ where: { serverEncryptionKeyId: keyId, id: { not: conversationId } } });
      if (conversations > 0) return true;
      const files = await prisma.attachmentFileAtRest.count({ where: { keyId, conversationId: { not: conversationId } } });
      return files > 0;
    }),
  );
  const orphans = candidates.filter((_, index) => !usedElsewhere[index]);
  if (orphans.length === 0) return;
  await prisma.serverEncryptionKey.deleteMany({ where: { id: { in: orphans } } });
}

async function purgeConversationScoped(prisma: ObsoletePurgePrisma, conversationId: string): Promise<void> {
  await purgeCallRecordings(prisma, conversationId);
  const trackingLinks = await prisma.trackingLink.findMany({ where: { conversationId }, select: { id: true } });
  const trackingLinkIds = trackingLinks.map((link) => link.id);
  if (trackingLinkIds.length > 0) {
    await prisma.trackingLinkClick.deleteMany({ where: { trackingLinkId: { in: trackingLinkIds } } });
    await prisma.trackingLink.deleteMany({ where: { id: { in: trackingLinkIds } } });
  }
  for (const delegate of conversationScoped(prisma)) {
    await delegate.deleteMany({ where: { conversationId } });
  }
  await purgeServerEncryptionKeys(prisma, conversationId);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { purgeAfter: null, title: null, description: null, avatar: null, banner: null, serverEncryptionKeyId: null },
  });
}

type PurgeCandidate = {
  readonly id: string;
  readonly type: string;
  readonly identifier: string;
  readonly isActive: boolean | null;
  readonly deletedAt: Date | null;
  readonly purgeAfter: Date | null;
};

/** La relecture en mémoire des trois marques : une requête mal formée ne suffit pas à effacer. */
function stillMarkedForPurge(conversation: PurgeCandidate, now: Date): boolean {
  if (isProtectedFromObsolescence(conversation)) return false;
  if (conversation.isActive !== false) return false;
  if (!conversation.purgeAfter || conversation.purgeAfter.getTime() > now.getTime()) return false;
  if (!conversation.deletedAt) return false;
  return conversation.deletedAt.getTime() <= now.getTime() - OBSOLETE_PURGE_DELAY_MS;
}

/**
 * Un candidat qui échoue recule de `OBSOLETE_PURGE_RETRY_DELAY_MS` : trié par
 * `purgeAfter` croissant, il resterait sinon en tête pour toujours, et vingt
 * échecs tenaces bloqueraient toute la file. Seul `purgeAfter` bouge — les
 * deux autres marques restent, la conversation reste une cible.
 */
async function postponePurge(prisma: ObsoletePurgePrisma, conversationId: string, now: Date): Promise<void> {
  try {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { purgeAfter: new Date(now.getTime() + OBSOLETE_PURGE_RETRY_DELAY_MS) },
    });
  } catch (error) {
    logger.error('obsolete conversation purge could not be postponed', { conversationId, error });
  }
}

export async function purgeObsoleteConversations(
  prisma: ObsoletePurgePrisma,
  options: { readonly now?: Date; readonly apply: boolean; readonly attachmentRemover: ObsoleteAttachmentRemover },
): Promise<ObsoletePurgeReport> {
  const now = options.now ?? new Date();
  const where = obsoletePurgeWhere(now);

  if (!options.apply) {
    const candidates = await prisma.conversation.count({ where });
    return { applied: false, candidates, purged: 0, failed: 0, truncated: false };
  }

  const rows: readonly PurgeCandidate[] = await prisma.conversation.findMany({
    where,
    select: { id: true, type: true, identifier: true, isActive: true, deletedAt: true, purgeAfter: true },
    orderBy: { purgeAfter: 'asc' },
    take: CONVERSATIONS_PER_PASS,
  });
  const marked = rows.filter((row) => stillMarkedForPurge(row, now));
  if (marked.length === 0) return { applied: true, candidates: rows.length, purged: 0, failed: 0, truncated: false };

  let purged = 0;
  let failed = 0;
  let truncated = false;
  for (const conversation of marked) {
    try {
      if (await purgeConversation(prisma, options.attachmentRemover, conversation.id)) {
        purged += 1;
      } else {
        truncated = true;
      }
    } catch (error) {
      failed += 1;
      logger.error('obsolete conversation purge stopped — it retries after its delay', { conversationId: conversation.id, error });
      await postponePurge(prisma, conversation.id, now);
    }
  }
  return { applied: true, candidates: rows.length, purged, failed, truncated };
}

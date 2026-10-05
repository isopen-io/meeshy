import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  EPHEMERAL_UNAVAILABILITY_GRACE_MS,
  isAfterReadEphemeral,
} from '@meeshy/shared/utils/ephemeral-countdown';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { unsetOrNull } from '../../utils/prisma-unset';
import type { EphemeralExpiryEntry } from '../EphemeralRecipientExpiryService';

const logger = enhancedLogger.child({ module: 'consumeAfterReadMessages' });

/**
 * CONSOMMER une flamme-œil — « vu puis quitté » (#8302, directive porteur
 * 2026-09-27).
 *
 * ─── CE QUE LA CONSOMMATION ÉCRIT ───────────────────────────────────────────
 *
 * 1. `MessageStatusEntry.ephemeralExpiresAt = now` sur la ligne de l'APPELANT,
 *    et d'elle seule : c'est `D(u)` d'un éphémère à durée, posée par la
 *    consommation au lieu de la réception. Le balayage par lecteur
 *    (`EphemeralRecipientExpiryService`) la reconnaît telle quelle ; la route
 *    l'expire sans l'attendre (`expireNow`).
 * 2. `Message.expiresAt` RAPPROCHÉ à `max D(u) + 1 h` quand le DERNIER
 *    destinataire actif a consommé — l'expéditeur garde la bulle jusque-là,
 *    puis la destruction du contenu la retire pour toute la room. Tant qu'un
 *    destinataire manque, la colonne garde le plafond de rétention posé à
 *    l'envoi (`ephemeralSendFields`).
 *
 * ─── FERMÉ PAR DÉFAUT ───────────────────────────────────────────────────────
 *
 * Un identifiant qui ne désigne pas une flamme-œil de CETTE conversation,
 * encore servie, dont l'appelant n'est pas l'auteur, est ignoré sans bruit :
 * la réponse ne dit que ce qui a été consommé.
 *
 * ─── IDEMPOTENTE ────────────────────────────────────────────────────────────
 *
 * Une échéance déjà passée n'est jamais repoussée ; un second appel rend la
 * même ligne, et c'est la revendication write-once de `expireNow` qui refuse
 * de rejouer l'annonce.
 */

export type AfterReadConsumePrisma = Pick<PrismaClient, 'message' | 'messageStatusEntry' | 'participant'>;

export interface ConsumeAfterReadParams {
  readonly conversationId: string;
  /** `Participant.id` de l'appelant — la clé de `MessageStatusEntry`. */
  readonly participantId: string;
  readonly messageIds: readonly string[];
  readonly now: Date;
}

export interface ConsumedAfterRead {
  /** Les messages consommés par l'appelant — cet appel ou un précédent. */
  readonly consumed: string[];
  /** Ses lignes, à remettre à `EphemeralRecipientExpiryService.expireNow`. */
  readonly entries: EphemeralExpiryEntry[];
}

/**
 * Au-delà, « tous ont vu » ne se prouve pas en une lecture bornée : la
 * destruction attend alors le plafond de rétention, jamais une supposition.
 */
const RECIPIENT_SCAN_CAP = 500;

interface FlameRow {
  id: string;
  senderId: string;
  effectFlags: number | null;
}

const DEADLINE_SET = [
  { ephemeralExpiresAt: { isSet: true } },
  { ephemeralExpiresAt: { not: null } },
];

export async function consumeAfterReadMessages(
  prisma: AfterReadConsumePrisma,
  params: ConsumeAfterReadParams,
): Promise<ConsumedAfterRead> {
  const rows = (await prisma.message.findMany({
    where: {
      id: { in: [...params.messageIds] },
      conversationId: params.conversationId,
      ...unsetOrNull('deletedAt'),
    },
    select: { id: true, senderId: true, effectFlags: true },
  })) as FlameRow[];

  const flames = rows.filter(
    (row) => isAfterReadEphemeral(row.effectFlags) && row.senderId !== params.participantId,
  );

  const consumed: string[] = [];
  const entries: EphemeralExpiryEntry[] = [];
  for (const row of flames) {
    const entry = await claimReaderDeadline(prisma, params, row.id);
    if (!entry) continue;
    consumed.push(row.id);
    entries.push(entry);
    await scheduleDestructionWhenAllSeen(prisma, params, row).catch((err) =>
      logger.warn('after-read destruction scheduling failed', { messageId: row.id, err }),
    );
  }

  return { consumed, entries };
}

async function claimReaderDeadline(
  prisma: AfterReadConsumePrisma,
  params: ConsumeAfterReadParams,
  messageId: string,
): Promise<EphemeralExpiryEntry | null> {
  const { participantId, conversationId, now } = params;
  const written = await prisma.messageStatusEntry.updateMany({
    where: {
      messageId,
      participantId,
      OR: [...unsetOrNull('ephemeralExpiresAt').OR, { ephemeralExpiresAt: { gt: now } }],
    },
    data: { ephemeralExpiresAt: now },
  });

  if ((written?.count ?? 0) === 0) {
    // Vu avant l'accusé de réception : la ligne n'existe pas encore. Même
    // patron que la vue unique (`recordViewOnceConsumption`) — une création
    // concurrente perd sur l'index unique et relit la ligne gagnante.
    const existing = await prisma.messageStatusEntry.findFirst({
      where: { messageId, participantId },
      select: { id: true },
    });
    if (!existing) {
      try {
        await prisma.messageStatusEntry.create({
          data: { messageId, conversationId, participantId, ephemeralExpiresAt: now },
        });
      } catch (err) {
        if ((err as { code?: string } | null)?.code !== 'P2002') throw err;
      }
    }
  }

  const entry = (await prisma.messageStatusEntry.findFirst({
    where: { messageId, participantId },
    select: { id: true, messageId: true, conversationId: true, participantId: true, ephemeralExpiresAt: true },
  })) as EphemeralExpiryEntry | null;

  return entry?.ephemeralExpiresAt instanceof Date ? entry : null;
}

async function scheduleDestructionWhenAllSeen(
  prisma: AfterReadConsumePrisma,
  params: ConsumeAfterReadParams,
  row: FlameRow,
): Promise<void> {
  const participants = (await prisma.participant.findMany({
    where: { conversationId: params.conversationId, isActive: true },
    select: { id: true },
    take: RECIPIENT_SCAN_CAP,
  })) as Array<{ id: string }>;
  if (participants.length >= RECIPIENT_SCAN_CAP) return;

  const recipients = participants.map((p) => p.id).filter((id) => id !== row.senderId);
  if (recipients.length === 0) return;

  const seen = (await prisma.messageStatusEntry.findMany({
    where: { messageId: row.id, participantId: { in: recipients }, AND: DEADLINE_SET },
    select: { participantId: true, ephemeralExpiresAt: true },
  })) as Array<{ participantId: string; ephemeralExpiresAt: Date | null }>;

  const deadlines = seen
    .map((entry) => entry.ephemeralExpiresAt)
    .filter((deadline): deadline is Date => deadline instanceof Date);
  const seenBy = new Set(seen.filter((entry) => entry.ephemeralExpiresAt instanceof Date).map((e) => e.participantId));
  if (!recipients.every((id) => seenBy.has(id))) return;

  const latest = Math.max(...deadlines.map((deadline) => deadline.getTime()));
  const destruction = new Date(latest + EPHEMERAL_UNAVAILABILITY_GRACE_MS);

  // RAPPROCHER seulement : ni le plafond de rétention ni la grâce d'une vue
  // unique ne se repoussent.
  await prisma.message.updateMany({
    where: {
      id: row.id,
      OR: [...unsetOrNull('expiresAt').OR, { expiresAt: { gt: destruction } }],
    },
    data: { expiresAt: destruction },
  });
}

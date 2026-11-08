/**
 * QUI PEUT LIRE QUOI ENSEMBLE (#17011, #17012) — jugé à l'invitation, puis REJUGÉ à
 * chaque acceptation, synchronisation et changement du lien (`togetherRelay.ts`).
 *
 * 1. les deux comptes sont utilisables (actifs, ni supprimés, ni désactivés) ;
 * 2. la LOI (`pairAccess`, feature `together`) : dès Proche, rien si l'un a bloqué
 *    l'autre, le privilège d'équipe et le bouclier des mineurs selon la matrice ;
 * 3. le média est une pièce jointe AUDIO ou VIDÉO d'un message non supprimé, ni à vue
 *    unique (pièce ou message), ni éphémère, de la conversation nommée ;
 * 4. les deux sont membres ACTIFS de cette conversation.
 *
 * Tout refus rend le même verdict : un inconnu n'apprend ni l'existence d'un média, ni
 * l'appartenance de quelqu'un à une conversation. Une lecture qui échoue LÈVE : le relais
 * ferme (`TOGETHER_UNAVAILABLE`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { TogetherMediaKind } from '@meeshy/shared/types/together';
import { pairAccess, type PairAccessDb } from '../relations/pairAccess';
import { ACCOUNT_STATE_SELECT, isUsableAccount } from '../relations/usableAccount';

export type TogetherGateDb = PairAccessDb & Pick<PrismaClient, 'participant' | 'messageAttachment'>;

export type TogetherSubject = {
  readonly hostId: string;
  readonly guestId: string;
  readonly conversationId: string;
  readonly attachmentId: string;
};

export type TogetherVerdict = { readonly ok: true; readonly media: TogetherMediaKind } | { readonly ok: false };

const REFUSED: TogetherVerdict = { ok: false };

const mediaOf = (mimeType: unknown): TogetherMediaKind | null => {
  if (typeof mimeType !== 'string') return null;
  const lower = mimeType.toLowerCase();
  if (lower.startsWith('video/')) return 'video';
  if (lower.startsWith('audio/')) return 'audio';
  return null;
};

async function playableMedia(prisma: TogetherGateDb, subject: TogetherSubject): Promise<TogetherMediaKind | null> {
  const attachment = await prisma.messageAttachment.findUnique({
    where: { id: subject.attachmentId },
    select: {
      mimeType: true,
      isViewOnce: true,
      message: { select: { conversationId: true, deletedAt: true, expiresAt: true, isViewOnce: true } },
    },
  });
  const message = attachment?.message;
  if (!attachment || !message || attachment.isViewOnce || message.isViewOnce) return null;
  if (message.conversationId !== subject.conversationId || message.deletedAt || message.expiresAt) return null;
  return mediaOf(attachment.mimeType);
}

async function bothActiveMembers(prisma: TogetherGateDb, subject: TogetherSubject): Promise<boolean> {
  const rows = await prisma.participant.findMany({
    where: {
      conversationId: subject.conversationId,
      userId: { in: [subject.hostId, subject.guestId] },
      isActive: true,
      leftAt: null,
      bannedAt: null,
    },
    select: { userId: true },
  });
  const members = new Set(rows.map((row) => row.userId));
  return members.has(subject.hostId) && members.has(subject.guestId);
}

async function bothUsable(prisma: TogetherGateDb, subject: TogetherSubject): Promise<boolean> {
  const rows = await prisma.user.findMany({
    where: { id: { in: [subject.hostId, subject.guestId] } },
    select: { id: true, ...ACCOUNT_STATE_SELECT },
  });
  const usable = new Set(rows.filter((row) => isUsableAccount(row)).map((row) => row.id));
  return usable.has(subject.hostId) && usable.has(subject.guestId);
}

export async function judgeTogether(
  deps: { readonly prisma: TogetherGateDb; readonly now: Date },
  subject: TogetherSubject,
): Promise<TogetherVerdict> {
  if (!subject.hostId || !subject.guestId || subject.hostId === subject.guestId) return REFUSED;
  const [usable, access, media, members] = await Promise.all([
    bothUsable(deps.prisma, subject),
    pairAccess(deps.prisma, { feature: 'together', viewerId: subject.hostId, targetId: subject.guestId, now: deps.now }),
    playableMedia(deps.prisma, subject),
    bothActiveMembers(deps.prisma, subject),
  ]);
  return usable && access.allowed && media && members ? { ok: true, media } : REFUSED;
}

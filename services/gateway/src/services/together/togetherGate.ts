/**
 * QUI PEUT LIRE QUOI ENSEMBLE (#17011, #17012) — jugé à l'invitation, puis REJUGÉ à
 * chaque acceptation, synchronisation et changement du lien (`togetherRelay.ts`).
 *
 * 1. les deux comptes sont utilisables (actifs, ni supprimés, ni désactivés) ;
 * 2. la LOI (`pairAccess`, feature `together`) : dès Proche, rien si l'un a bloqué
 *    l'autre, le privilège d'équipe et le bouclier des mineurs selon la matrice ;
 * 3. le média est une pièce jointe AUDIO ou VIDÉO d'un message non supprimé, ni à vue
 *    unique (pièce ou message), ni éphémère, de la conversation nommée ;
 * 4. les deux sont membres ACTIFS de cette conversation — actifs, ni bannis, ni
 *    partis, ni l'ayant supprimée « pour eux » (les trois colonnes de départ,
 *    #19690) ;
 * 5. la conversation est OUVERTE : ni close (`isActive: false`, `closedAt`), ni supprimée
 *    (#17147). Une clôture garde messages et participants actifs : sans cette lecture, une
 *    séance y continuait, rejugée ou non.
 *
 * Tout refus rend le même verdict : un inconnu n'apprend ni l'existence d'un média, ni
 * l'appartenance de quelqu'un à une conversation. Une lecture qui échoue LÈVE : le relais
 * ferme (`TOGETHER_UNAVAILABLE`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { TogetherMediaKind } from '@meeshy/shared/types/together';
import { pairAccess, type PairAccessDb } from '../relations/pairAccess';
import { ACCOUNT_STATE_SELECT, isUsableAccount } from '../relations/usableAccount';
import { PARTICIPATION_VIVANTE } from '../../routes/conversations/utils/access-control';
import { unsetOrNull } from '../../utils/prisma-unset';

export type TogetherGateDb = PairAccessDb & Pick<PrismaClient, 'participant' | 'messageAttachment' | 'conversation'>;

export type TogetherSubject = {
  readonly hostId: string;
  readonly guestId: string;
  readonly conversationId: string;
  readonly attachmentId: string;
};

export type TogetherVerdict = { readonly ok: true; readonly media: TogetherMediaKind } | { readonly ok: false };

const REFUSED: TogetherVerdict = { ok: false };

/** Le genre d'un média qui se lit ensemble, ou `null` : la seule définition, que les sites de coupure relisent. */
export const togetherMediaOf = (mimeType: unknown): TogetherMediaKind | null => {
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
  return togetherMediaOf(attachment.mimeType);
}

/**
 * Les prédicats d'ABSENCE des TROIS colonnes de départ, composés par `AND`
 * (#19690).
 *
 * `leftAt: null` et `bannedAt: null` en ÉGALITÉ n'appariaient pas une clé
 * ABSENTE — l'état de tout membre qui n'est ni parti ni banni, Prisma n'écrivant
 * pas un `DateTime?` qu'on ne lui donne pas. Cette fonction rendait donc `false`
 * pour presque toutes les paires, et la séance « Ensemble » était INERTE pour la
 * population entière. La règle était récitée treize lignes plus bas pour
 * `closedAt` (`openConversation`) et oubliée pour ces voisines.
 *
 * `AND` de PRÉDICATS COMPLETS, et non un double spread : `PARTICIPATION_VIVANTE`
 * et `unsetOrNull` rendent chacun une clé `OR`, dont la seconde écraserait la
 * première. Jamais un `AND` des deux BRANCHES d'un même prédicat
 * (`AND: [{ leftAt: null }, { leftAt: { isSet: false } }]`) : cette conjonction
 * est IMPOSSIBLE et n'apparie aucun document.
 *
 * `deletedForMe` est la TROISIÈME, et elle est ici parce que ce correctif la
 * rendait atteignable. `Participant` porte trois colonnes de départ que le dépôt
 * lit ENSEMBLE à l'endroit qui en dépend (`routes/sync/conversations.ts`), et
 * `delete-for-me` écrit `{ deletedForMe: now, isActive: false }` d'un seul geste
 * — donc `isActive: true` suffisait pour une ligne BIEN écrite. Restent les
 * lignes HÉRITÉES d'avant #17072, qui portent `isActive: true` ET `deletedForMe`
 * posé : l'égalité nue les refusait par ACCIDENT, et la forme juste les
 * admettrait. Une conversation que `core-list` cache à ce lecteur et que la
 * corbeille liste encore n'a pas à ressurgir en invitation live. Règle du
 * cycle 84 : réparer ce qui rendait une donnée invisible oblige à décider, dans
 * le même lot, si elle a le droit d'être vue.
 *
 * ─── CE QUE CETTE CLAUSE NE JUGE PAS, et où c'est instruit ───────────────────
 *
 * Elle juge l'APPARTENANCE, pas le DROIT DE LECTURE du lecteur sur le média :
 * ni plancher d'historique, ni `canViewHistory`, ni cycle de vie par lecteur
 * (#9589). La loi unique qui les tient — `resolveAttachmentReadVerdict` — prend
 * une `FastifyRequest`, que ce chemin socket n'a pas : **#19756**.
 *
 * Et elle ne lit pas `messageRequestAt`, quand la porte JUMELLE (la sonnerie,
 * `callRingPolicy`) refuse de sonner dès qu'une demande est en attente. C'est
 * une question de produit, pas un oubli : **#19757**.
 */
async function bothActiveMembers(prisma: TogetherGateDb, subject: TogetherSubject): Promise<boolean> {
  const rows = await prisma.participant.findMany({
    where: {
      conversationId: subject.conversationId,
      userId: { in: [subject.hostId, subject.guestId] },
      AND: [PARTICIPATION_VIVANTE, unsetOrNull('leftAt'), unsetOrNull('deletedForMe')],
    },
    select: { userId: true },
  });
  const members = new Set(rows.map((row) => row.userId));
  return members.has(subject.hostId) && members.has(subject.guestId);
}

/** Lue en JS plutôt qu'en `where` : sous MongoDB, `closedAt: null` ne retient pas un champ ABSENT. */
async function openConversation(prisma: TogetherGateDb, subject: TogetherSubject): Promise<boolean> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: subject.conversationId },
    select: { isActive: true, closedAt: true, deletedAt: true },
  });
  return Boolean(conversation && conversation.isActive !== false && !conversation.closedAt && !conversation.deletedAt);
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
  const [usable, access, media, members, open] = await Promise.all([
    bothUsable(deps.prisma, subject),
    pairAccess(deps.prisma, { feature: 'together', viewerId: subject.hostId, targetId: subject.guestId, now: deps.now }),
    playableMedia(deps.prisma, subject),
    bothActiveMembers(deps.prisma, subject),
    openConversation(deps.prisma, subject),
  ]);
  return usable && access.allowed && media && members && open ? { ok: true, media } : REFUSED;
}

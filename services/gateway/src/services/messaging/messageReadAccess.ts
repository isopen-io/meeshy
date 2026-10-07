/**
 * QUI PEUT LIRE CE MESSAGE — le droit de lecture d'UN message, jugé à la
 * participation COURANTE du lecteur (#9579).
 *
 * La règle existait, écrite une fois : dans `MessageStarWriter.star`, qui
 * refuse d'étoiler ce qu'on ne lit pas. Elle n'y était joignable par personne
 * d'autre. Un envoi qui DÉSIGNE un message par son identifiant (un transfert)
 * pose pourtant exactement la même question — et ne la posait à personne.
 * Elle vit donc ici, et le favori l'appelle comme le transfert.
 *
 * Rien n'est réécrit : cette unité COMPOSE les lois que le fil applique déjà.
 *
 * ─── LE LECTEUR (`readerMayReadMessage`) — le favori ET l'envoi ─────────────
 *
 * | borne | loi | quand la lecture échoue |
 * |---|---|---|
 * | participation active, non bannie, dans la conversation DU MESSAGE | le `where` ci-dessous | propage |
 * | message non supprimé pour tous | `deletedAt` | — |
 * | lien de partage non échu | `shareLinkReadGate.ts` | propage |
 * | plancher d'historique | `historyFloor.ts` | propage |
 * | masquage personnel (retiré de sa vue, historique vidé) | `personalHistoryFilter.ts` | L'APPELANT LE DIT |
 *
 * La participation se lit dans la conversation DU MESSAGE, jamais dans celle
 * d'où part la demande : un `Participant` est scopé par conversation. Un
 * compte se retrouve par son `User.id` ; un invité n'a que sa ligne, donc ne
 * lit que SA conversation.
 *
 * Un lien de partage INTROUVABLE ne ferme ni ne borne : c'est la posture du
 * fil (`shareLinkReadGate.ts`, `historyFloor.ts`), et #3734 retire l'invité
 * d'un lien retiré par un autre chemin. Diverger ici refuserait un transfert à
 * quelqu'un à qui le fil sert le message.
 *
 * Le masquage personnel n'a PAS de posture par défaut. Pour le favori c'est
 * une courtoisie, et illisible elle sert (décision #7377). Pour un envoi qui
 * fait SORTIR le contenu, une lecture qui n'a pas répondu ne prouve pas qu'il
 * le voit encore. `whenHidingUnreadable` est donc REQUIS.
 *
 * ─── LE CONTENU (`contentStillVisibleToReader`) — l'envoi seul ──────────────
 *
 * Lire une conversation ne suffit pas quand le contenu a déjà DISPARU POUR CE
 * LECTEUR : le décompte d'une flamme fini chez lui, une flamme après lecture
 * qu'il a consommée, une vue unique qu'il a ouverte. Le désigner alors, c'est
 * lui rendre une seconde vie chez d'autres.
 *
 * La borne est celle de la BULLE — `D(u)`, l'échéance SERVIE à ce lecteur
 * (`servedEphemeralExpiresAt`) — et PAS celle du service
 * (`isEphemeralServableToReader`, `D(u) + 1 h`). La grâce d'une heure est une
 * tolérance de BALAYAGE : elle sert ce qu'un client en retard affiche encore,
 * pour qu'un second appareil apprenne l'expiration. Ce n'est pas un droit de
 * l'utilisateur. Un transfert est un geste NEUF, qui relance un décompte
 * complet chez d'autres : l'admettre pendant la grâce ressusciterait un
 * contenu déjà parti de l'écran de celui qui le désigne. Même borne stricte
 * pour la vue unique ouverte et la flamme après lecture consommée.
 *
 * L'AUTEUR suit la même loi, avec SON échéance servie : la plus tardive de
 * celles de ses destinataires. Tant que personne n'a reçu, rien ne décompte
 * pour lui ; quand le dernier décompte est fini, sa bulle part aussi.
 *
 * Le favori ne passe pas par ce second cran : il sert un éphémère vivant en
 * placeholder et refuse la vue unique par sa propre loi
 * (`starredMessageVerdict`).
 *
 * Ce qui PROPAGE n'est pas rattrapé ici : une lecture qui ne conclut pas
 * n'autorise rien, et c'est à l'appelant de dire ce que « rien » veut dire
 * chez lui (un 404, une source indisponible).
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { hasPerReaderEphemeralDeadline, servedEphemeralExpiresAt } from '@meeshy/shared/utils/ephemeral-countdown';

import {
  readEphemeralReaderResolution,
  type EphemeralReaderResolution,
} from '../../routes/conversations/ephemeralReaderDeadlines';
import { unsetOrNull } from '../../utils/prisma-unset';
import { HISTORY_FLOOR_PARTICIPANT_SELECT, loadHistoryFloor, type HistoryReader } from '../historyFloor';
import { loadPersonalHistoryHiding, readPersonalHistoryHiding } from '../personalHistoryFilter';
import { shareLinkHasExpired } from '../shareLinkReadGate';
import { readableByReader } from './messageStars/starredMessageVerdict';
import { readViewOnceOpenedByReader } from './viewOnceAudience';

/** Les colonnes dont dépend le droit du LECTEUR — aucun contenu. */
export type ReadableMessageRow = {
  readonly id: string;
  readonly conversationId: string;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
};

/** Celles dont dépend, en plus, ce que le contenu est encore POUR lui. */
export type ReaderVisibleMessageRow = ReadableMessageRow & {
  readonly senderId: string;
  readonly ephemeralDuration: number | null;
  readonly effectFlags: number | null;
  readonly expiresAt: Date | null;
  readonly isViewOnce: boolean | null;
  readonly viewOnceBurnedAt: Date | null;
};

export const READER_VISIBLE_MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  createdAt: true,
  deletedAt: true,
  senderId: true,
  ephemeralDuration: true,
  effectFlags: true,
  expiresAt: true,
  isViewOnce: true,
  viewOnceBurnedAt: true,
} as const;

/** Ce que vaut un masquage personnel ILLISIBLE — chaque appelant le dit. */
export type UnreadableHidingPosture = 'serve' | 'refuse';

type ReaderParticipation = { readonly id: string };

function participationWhere(reader: HistoryReader, conversationId: string): Prisma.ParticipantWhereInput {
  return reader.kind === 'anonymous'
    ? { id: reader.participantId, conversationId, isActive: true, ...unsetOrNull('bannedAt') }
    : { conversationId, userId: reader.userId, isActive: true, ...unsetOrNull('bannedAt') };
}

async function readerParticipation(
  prisma: PrismaClient,
  params: {
    readonly reader: HistoryReader;
    readonly message: ReadableMessageRow;
    readonly now: Date;
    readonly whenHidingUnreadable: UnreadableHidingPosture;
  },
): Promise<ReaderParticipation | null> {
  const { reader, message, now, whenHidingUnreadable } = params;

  const participation = await prisma.participant.findFirst({
    where: participationWhere(reader, message.conversationId),
    select: { id: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT },
  });
  if (!participation) return null;
  if (message.deletedAt) return null;

  const link = participation.shareLinkId
    ? await prisma.conversationShareLink.findUnique({
        where: { id: participation.shareLinkId },
        select: { id: true, allowViewHistory: true, expiresAt: true },
      })
    : null;
  if (shareLinkHasExpired(link, now)) return null;

  const hidingOf = whenHidingUnreadable === 'refuse' ? readPersonalHistoryHiding : loadPersonalHistoryHiding;
  const [floor, hiding] = await Promise.all([
    loadHistoryFloor(prisma, participation, { link }),
    hidingOf(prisma, {
      userId: reader.kind === 'user' ? reader.userId : null,
      conversationId: message.conversationId,
    }),
  ]);
  return readableByReader(message, { floor, hiding }) ? { id: participation.id } : null;
}

export async function readerMayReadMessage(
  prisma: PrismaClient,
  params: {
    readonly reader: HistoryReader;
    readonly message: ReadableMessageRow;
    readonly now: Date;
    readonly whenHidingUnreadable: UnreadableHidingPosture;
  },
): Promise<boolean> {
  return (await readerParticipation(prisma, params)) !== null;
}

/**
 * LA BORNE DE LA BULLE : l'éphémère est-il encore à l'écran de ce lecteur ?
 * `D(u)` exclu — à l'instant de l'échéance, la bulle est partie. Aucune grâce
 * (voir l'en-tête). Un décompte qui n'a pas démarré ne ferme rien.
 */
export function ephemeralStillOnReaderScreen(
  message: Pick<ReaderVisibleMessageRow, 'ephemeralDuration' | 'effectFlags' | 'expiresAt'>,
  resolution: EphemeralReaderResolution,
  now: Date,
): boolean {
  const servedDeadline = servedEphemeralExpiresAt({
    ephemeralDuration: message.ephemeralDuration,
    effectFlags: message.effectFlags,
    rawExpiresAt: message.expiresAt,
    isSender: resolution.isSender,
    readerDeadline: resolution.readerDeadline,
    latestRecipientDeadline: resolution.latestRecipientDeadline,
  });
  return servedDeadline === null || now.getTime() < servedDeadline.getTime();
}

/**
 * `readerParticipantId` est la ligne du lecteur DANS la conversation du
 * message : c'est la clé de ses accusés (`MessageStatusEntry`).
 *
 * Chaque état se lit de façon CIBLÉE — SA ligne, jamais le balayage plafonné
 * d'une page : une ligne absente d'une tranche tronquée se lirait « décompte
 * pas démarré », « pas encore ouverte », et ouvrirait la sortie.
 */
export async function contentStillVisibleToReader(
  prisma: PrismaClient,
  params: { readonly readerParticipantId: string; readonly message: ReaderVisibleMessageRow; readonly now: Date },
): Promise<boolean> {
  const { readerParticipantId, message, now } = params;

  if (hasPerReaderEphemeralDeadline(message)) {
    const resolution = await readEphemeralReaderResolution(prisma, message, readerParticipantId);
    if (!ephemeralStillOnReaderScreen(message, resolution, now)) return false;
  }

  if (message.isViewOnce === true) {
    if (message.viewOnceBurnedAt) return false;
    if (await readViewOnceOpenedByReader(prisma, { messageId: message.id, readerParticipantId })) return false;
  }

  return true;
}

/**
 * Le lecteur DERRIÈRE une ligne `Participant` : son compte s'il en a un, sa
 * seule ligne sinon. `null` quand la ligne n'existe pas — personne ne lit.
 */
export async function messageReaderOfParticipant(
  prisma: Pick<PrismaClient, 'participant'>,
  participantId: string,
): Promise<HistoryReader | null> {
  const row = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { id: true, userId: true },
  });
  if (!row) return null;
  return row.userId ? { kind: 'user', userId: row.userId } : { kind: 'anonymous', participantId: row.id };
}

/**
 * La forme d'un ENVOI : il connaît son expéditeur par sa ligne `Participant`,
 * et ce qu'il désigne par un identifiant. Rend le message quand l'expéditeur
 * le lit ET que son contenu est encore là pour lui, `null` sinon — « n'existe
 * pas », « pas pour lui » et « plus pour lui » ne se distinguent pas, par
 * construction.
 */
export async function loadMessageReadableByParticipant(
  prisma: PrismaClient,
  params: { readonly participantId: string; readonly messageId: string; readonly now: Date },
): Promise<ReaderVisibleMessageRow | null> {
  if (!params.participantId || !params.messageId) return null;

  const [reader, message] = await Promise.all([
    messageReaderOfParticipant(prisma, params.participantId),
    prisma.message.findUnique({ where: { id: params.messageId }, select: READER_VISIBLE_MESSAGE_SELECT }),
  ]);
  if (!reader || !message) return null;

  const participation = await readerParticipation(prisma, {
    reader,
    message,
    now: params.now,
    whenHidingUnreadable: 'refuse',
  });
  if (!participation) return null;

  const visible = await contentStillVisibleToReader(prisma, {
    readerParticipantId: participation.id,
    message,
    now: params.now,
  });
  return visible ? message : null;
}

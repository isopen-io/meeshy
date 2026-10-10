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
 * `readerMayReadMessages` est la MÊME loi pour une page de messages d'une seule
 * conversation (#9899) : tout ce qui précède le verdict ne dépend que du
 * lecteur, donc se lit une fois ; seul le verdict se rejoue par message.
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
 * Et une réponse MEURT avec ce qu'elle cite (#8630) : le fil lui sert la plus
 * proche des échéances de sa chaîne de citations (`quoteCascade.ts`), et sa
 * bulle part à cet instant. La borne lit donc la même chaîne, maillon par
 * maillon, sur les mêmes {@link MAX_QUOTE_DEPTH} crans — mais de façon CIBLÉE
 * (un message par identifiant, l'échéance de CE lecteur par sa ligne) : le
 * chargeur du fil est plafonné et SERT quand il échoue (#9625). Une réponse à
 * une flamme morte pour lui, contaminée (#8557) ou non, ne se désigne plus.
 *
 * L'AUTEUR suit la même loi, avec SON échéance servie : la plus tardive de
 * celles de ses destinataires. Tant que personne n'a reçu, rien ne décompte
 * pour lui ; quand le dernier décompte est fini, sa bulle part aussi. Et
 * l'expéditeur d'une COPIE transférée (durée ET après lecture, #9588) la perd
 * à « envoi + durée » : c'est `servedEphemeralExpiresAt` qui le dit, ici on ne
 * fait que lui remettre l'heure d'envoi.
 *
 * Le favori ne passe pas par ce second cran : il sert un éphémère vivant en
 * placeholder et refuse la vue unique par sa propre loi
 * (`starredMessageVerdict`).
 *
 * Ce qui PROPAGE n'est pas rattrapé ici : une lecture qui ne conclut pas
 * n'autorise rien, et c'est à l'appelant de dire ce que « rien » veut dire
 * chez lui (un 404, une source indisponible).
 *
 * ─── LE COÛT NE DIT RIEN NON PLUS ───────────────────────────────────────────
 *
 * Une réponse identique ne suffit pas si le TRAVAIL diffère : un identifiant
 * qui ne désigne rien coûtait deux lectures, un message d'une conversation
 * d'où l'on est absent en coûtait trois. L'identifiant inconnu paie donc la
 * même lecture de participation — dans une conversation qui n'existe pas
 * ({@link NO_CONVERSATION}). Ce qui suit la participation n'est payé que par
 * qui lit déjà la conversation du message.
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import {
  hasPerReaderEphemeralDeadline,
  inheritedEphemeralExpiresAt,
  servedEphemeralExpiresAt,
} from '@meeshy/shared/utils/ephemeral-countdown';

import {
  readEphemeralReaderResolution,
  type EphemeralReaderResolution,
} from '../../routes/conversations/ephemeralReaderDeadlines';
import { unsetOrNull } from '../../utils/prisma-unset';
import { HISTORY_FLOOR_PARTICIPANT_SELECT, loadHistoryFloor, type HistoryReader } from '../historyFloor';
import { loadPersonalHistoryHiding, readPersonalHistoryHiding, type PersonalHistoryHiding } from '../personalHistoryFilter';
import { shareLinkHasExpired } from '../shareLinkReadGate';
import { readableByReader } from './messageStars/starredMessageVerdict';
import { MAX_QUOTE_DEPTH } from './quoteCascade';
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
  readonly replyToId: string | null;
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
  replyToId: true,
  senderId: true,
  ephemeralDuration: true,
  effectFlags: true,
  expiresAt: true,
  isViewOnce: true,
  viewOnceBurnedAt: true,
} as const;

/** Ce que la chaîne de citations demande à chaque maillon — aucun contenu. */
const QUOTED_LINK_SELECT = {
  id: true,
  replyToId: true,
  senderId: true,
  createdAt: true,
  ephemeralDuration: true,
  effectFlags: true,
  expiresAt: true,
} as const;

type BubbleRow = Pick<
  ReaderVisibleMessageRow,
  'id' | 'senderId' | 'ephemeralDuration' | 'effectFlags' | 'expiresAt' | 'createdAt'
>;
type QuotedLink = BubbleRow & { readonly replyToId: string | null };

/**
 * Un ObjectId valide qu'aucune conversation ne porte (horodatage nul) : la
 * conversation d'un identifiant qui ne désigne rien. Voir l'en-tête, « le coût
 * ne dit rien ».
 */
const NO_CONVERSATION = '000000000000000000000000';

const unknownMessage = (id: string): ReadableMessageRow => ({
  id,
  conversationId: NO_CONVERSATION,
  createdAt: new Date(0),
  deletedAt: null,
});

/** Ce que vaut un masquage personnel ILLISIBLE — chaque appelant le dit. */
export type UnreadableHidingPosture = 'serve' | 'refuse';

type ReaderParticipation = { readonly id: string };

function participationWhere(reader: HistoryReader, conversationId: string): Prisma.ParticipantWhereInput {
  return reader.kind === 'anonymous'
    ? { id: reader.participantId, conversationId, isActive: true, ...unsetOrNull('bannedAt') }
    : { conversationId, userId: reader.userId, isActive: true, ...unsetOrNull('bannedAt') };
}

function findReaderParticipation(prisma: PrismaClient, reader: HistoryReader, conversationId: string) {
  return prisma.participant.findFirst({
    where: participationWhere(reader, conversationId),
    select: { id: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT },
  });
}

/** Ce qui borne la lecture d'une conversation pour CE lecteur : le plancher et le masquage personnel. */
type ReadingLaw = { readonly floor: Date | null; readonly hiding: PersonalHistoryHiding };

/**
 * La loi de lecture de la conversation, jugée une fois : le lien de partage
 * (échu ⇒ `null`, personne ne lit), puis le plancher et le masquage. Elle ne
 * dépend d'aucun message — c'est ce qui permet à la forme ensembliste de la
 * payer une fois pour toute la page.
 */
async function readingLawOf(
  prisma: PrismaClient,
  params: {
    readonly reader: HistoryReader;
    readonly participation: NonNullable<Awaited<ReturnType<typeof findReaderParticipation>>>;
    readonly conversationId: string;
    readonly now: Date;
    readonly whenHidingUnreadable: UnreadableHidingPosture;
  },
): Promise<ReadingLaw | null> {
  const { reader, participation, conversationId, now, whenHidingUnreadable } = params;

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
    hidingOf(prisma, { userId: reader.kind === 'user' ? reader.userId : null, conversationId }),
  ]);
  return { floor, hiding };
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

  const participation = await findReaderParticipation(prisma, reader, message.conversationId);
  if (!participation) return null;
  if (message.deletedAt) return null;

  const law = await readingLawOf(prisma, {
    reader,
    participation,
    conversationId: message.conversationId,
    now,
    whenHidingUnreadable,
  });
  if (!law) return null;
  return readableByReader(message, law) ? { id: participation.id } : null;
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
 * La forme ENSEMBLISTE : lesquels de ces messages, TOUS de `conversationId`, ce
 * lecteur lit-il ? Rend les identifiants lisibles.
 *
 * C'est la même loi que {@link readerMayReadMessage}, lue UNE fois : la
 * participation, le lien, le plancher et le masquage ne dépendent que du
 * lecteur et de la conversation, jamais du message — seul le verdict final
 * (`readableByReader`) se rejoue par message. Cent messages coûtent les mêmes
 * lectures qu'un seul, au lieu de trois cents. Un témoin confronte les deux
 * formes ligne à ligne : la loi n'a toujours qu'un énoncé.
 *
 * Un message d'une AUTRE conversation que `conversationId`, ou supprimé pour
 * tous, n'est jamais lisible ici, et ne coûte aucune lecture : s'il n'en reste
 * aucun à juger, rien n'est lu. Comme la forme unitaire, elle PROPAGE ses
 * erreurs de lecture, sauf le masquage quand l'appelant a dit `'serve'`.
 */
export async function readerMayReadMessages(
  prisma: PrismaClient,
  params: {
    readonly reader: HistoryReader;
    readonly conversationId: string;
    readonly messages: readonly ReadableMessageRow[];
    readonly now: Date;
    readonly whenHidingUnreadable: UnreadableHidingPosture;
  },
): Promise<ReadonlySet<string>> {
  const { reader, conversationId, messages, now, whenHidingUnreadable } = params;

  const candidates = messages.filter((message) => message.conversationId === conversationId && !message.deletedAt);
  if (candidates.length === 0) return new Set();

  const participation = await findReaderParticipation(prisma, reader, conversationId);
  if (!participation) return new Set();

  const law = await readingLawOf(prisma, { reader, participation, conversationId, now, whenHidingUnreadable });
  if (!law) return new Set();

  return new Set(candidates.filter((message) => readableByReader(message, law)).map((message) => message.id));
}

/** L'échéance que CE lecteur voit sur une bulle — `null` quand rien ne décompte pour lui. */
function servedBubbleDeadline(row: BubbleRow, resolution: EphemeralReaderResolution): Date | null {
  return servedEphemeralExpiresAt({
    ephemeralDuration: row.ephemeralDuration,
    effectFlags: row.effectFlags,
    rawExpiresAt: row.expiresAt,
    sentAt: row.createdAt,
    isSender: resolution.isSender,
    readerDeadline: resolution.readerDeadline,
    latestRecipientDeadline: resolution.latestRecipientDeadline,
  });
}

async function readerBubbleDeadline(
  prisma: PrismaClient,
  row: BubbleRow,
  readerParticipantId: string,
): Promise<Date | null> {
  if (!hasPerReaderEphemeralDeadline(row)) return null;
  return servedBubbleDeadline(row, await readEphemeralReaderResolution(prisma, row, readerParticipantId));
}

/**
 * La chaîne de ce qu'un message cite, maillon par maillon, sur les crans de
 * la loi du fil. Elle s'arrête sur un maillon introuvable ou déjà vu, comme
 * `quoteCascade`, et PROPAGE ses erreurs.
 */
async function readQuotedChain(
  prisma: PrismaClient,
  quotedId: string | null,
  seen: ReadonlySet<string>,
): Promise<readonly QuotedLink[]> {
  if (!quotedId || seen.has(quotedId) || seen.size > MAX_QUOTE_DEPTH) return [];
  const link = await prisma.message.findUnique({ where: { id: quotedId }, select: QUOTED_LINK_SELECT });
  if (!link) return [];
  return [link, ...(await readQuotedChain(prisma, link.replyToId, new Set([...seen, link.id])))];
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

  // LA BORNE DE LA BULLE : la plus proche des échéances servies à ce lecteur,
  // sur le message et sur ce qu'il cite. `D(u)` exclu, aucune grâce (voir
  // l'en-tête). Un décompte qui n'a pas démarré ne ferme rien.
  const chain = await readQuotedChain(prisma, message.replyToId, new Set([message.id]));
  const deadlines = await Promise.all(
    [message, ...chain].map((row) => readerBubbleDeadline(prisma, row, readerParticipantId)),
  );
  const bubbleGoneAt = inheritedEphemeralExpiresAt(deadlines);
  if (bubbleGoneAt && now.getTime() >= bubbleGoneAt.getTime()) return false;

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
  if (!reader) return null;

  const participation = await readerParticipation(prisma, {
    reader,
    message: message ?? unknownMessage(params.messageId),
    now: params.now,
    whenHidingUnreadable: 'refuse',
  });
  if (!message || !participation) return null;

  const visible = await contentStillVisibleToReader(prisma, {
    readerParticipantId: participation.id,
    message,
    now: params.now,
  });
  return visible ? message : null;
}

/**
 * LA BOÎTE DE DEMANDES — le site UNIQUE (#14107, cercles, MSG-01/02, MIN-03, RG-21).
 *
 * Un tête-à-tête ouvert par quelqu'un qui n'est pas au moins Connaissance
 * (`dm.direct`) n'arrive pas dans la liste du destinataire : il arrive dans sa
 * BOÎTE DE DEMANDES. La demande vit sur la ligne `Participant` du destinataire
 * (`messageRequestAt`, `messageRequestRisk`), posée à l'ouverture et effacée
 * quand il accepte ou répond. Aucun rattrapage : un DM antérieur n'y entre
 * jamais, et un ancien client qui ignore le champ voit la conversation comme
 * aujourd'hui.
 *
 * ## Les règles
 *
 * - **Direct dès Connaissance** (`dm.direct`), demande en dessous (`dm.request`).
 *   Le Public ne peut pas écrire à un mineur déclaré (bouclier de la loi, RG-21) :
 *   le refus ne dit pas pourquoi.
 * - **Score de risque** (MIN-03) : âge du compte expéditeur, rafale de
 *   conversations ouvertes en 24 h, absence de communauté commune, renforcé quand
 *   le destinataire est mineur. Au-delà du seuil, la demande est FILTRÉE (rangée à
 *   part) ; elle n'est jamais supprimée.
 * - **Médias** : floutés chez le destinataire (`mediaBlurred`, servi) ; vers un
 *   mineur, FERMÉS côté serveur — l'expéditeur naît sans droit d'envoyer fichier,
 *   image, vidéo ni audio (`attachmentSendRightForMimeType` les refuse), et les
 *   retrouve à l'acceptation.
 * - **Accepter** (ou répondre) fait passer l'expéditeur au moins en Connaissance,
 *   des deux côtés (`recordLevel`), jamais plus bas qu'un lien existant.
 * - **Ignorer** = masquer pour soi (`delete-for-me`), silencieux.
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import type { ParticipantPermissions } from '@meeshy/shared/types/participant';
import { declaredAgeClass } from '@meeshy/shared/utils/age';
import { isBlockedBetween } from '../../utils/blocking';
import { FOUNDING_MEMBER_PERMISSIONS } from '../participantRights';
import { minorShieldedAmong, pairAccess, type PairAccessDb } from '../relations/pairAccess';
import { recordLevel, type UserRelationDb } from '../relations/userRelationWriter';

export type MessageRequestDb = PairAccessDb & Pick<PrismaClient, 'participant' | 'conversation'>;

/** Au-delà de ce score, une demande est rangée parmi les demandes filtrées. */
export const MESSAGE_REQUEST_FILTER_THRESHOLD = 50;

const RISK_CEILING = 100;
const DAY_MS = 86_400_000;

export type MessageRequestRiskSignals = {
  /** Ancienneté du compte expéditeur, en heures ; `null` si illisible. */
  readonly senderAccountAgeHours: number | null;
  /** Conversations que l'expéditeur a ouvertes dans les dernières 24 h. */
  readonly senderRequestsLast24h: number;
  readonly sharesCommunity: boolean;
  /** Le destinataire est un mineur DÉCLARÉ : le filtre est renforcé. */
  readonly recipientMinor: boolean;
};

const accountAgeWeight = (hours: number | null): number => {
  if (hours === null) return 25;
  if (hours < 24) return 40;
  if (hours < 24 * 7) return 20;
  return 0;
};

const burstWeight = (count: number): number => {
  if (count >= 10) return 40;
  if (count >= 3) return 20;
  return 0;
};

/** Le score de risque d'une demande, de 0 à 100 — pur. */
export function messageRequestRiskScore(signals: MessageRequestRiskSignals): number {
  const score =
    accountAgeWeight(signals.senderAccountAgeHours) +
    burstWeight(signals.senderRequestsLast24h) +
    (signals.sharesCommunity ? 0 : 20) +
    (signals.recipientMinor ? 30 : 0);
  return Math.min(RISK_CEILING, score);
}

export type DirectOpening =
  | { readonly kind: 'direct' }
  | { readonly kind: 'request'; readonly risk: number; readonly recipientMinor: boolean }
  | { readonly kind: 'refused' };

async function riskSignals(
  prisma: MessageRequestDb,
  params: { readonly senderId: string; readonly recipientId: string; readonly sharesCommunity: boolean; readonly now: Date },
): Promise<MessageRequestRiskSignals> {
  const [people, burst] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [params.senderId, params.recipientId] } },
      select: { id: true, createdAt: true, birthDate: true },
    }),
    prisma.participant.count({
      where: { userId: params.senderId, role: 'creator', joinedAt: { gte: new Date(params.now.getTime() - DAY_MS) } },
    }),
  ]);
  const sender = people.find((p) => p.id === params.senderId);
  const recipient = people.find((p) => p.id === params.recipientId);
  const createdAt = sender?.createdAt instanceof Date ? sender.createdAt : null;
  return {
    senderAccountAgeHours: createdAt ? (params.now.getTime() - createdAt.getTime()) / 3_600_000 : null,
    senderRequestsLast24h: burst,
    sharesCommunity: params.sharesCommunity,
    recipientMinor: declaredAgeClass(recipient?.birthDate ?? null, params.now) === 'minor',
  };
}

/** À l'ouverture d'un tête-à-tête : direct, demande, ou refus (MSG-01, RG-21). */
export async function decideDirectOpening(
  prisma: MessageRequestDb,
  params: { readonly senderId: string; readonly recipientId: string; readonly now?: Date },
): Promise<DirectOpening> {
  const now = params.now ?? new Date();
  const pair = { viewerId: params.senderId, targetId: params.recipientId, now };
  const [direct, request] = await Promise.all([
    pairAccess(prisma, { ...pair, feature: 'dm.direct' }),
    pairAccess(prisma, { ...pair, feature: 'dm.request' }),
  ]);
  if (direct.allowed) return { kind: 'direct' };
  if (!request.allowed) return { kind: 'refused' };

  const signals = await riskSignals(prisma, {
    senderId: params.senderId,
    recipientId: params.recipientId,
    sharesCommunity: request.effectiveLevel === 'COMMUNITY',
    now,
  });
  return { kind: 'request', risk: messageRequestRiskScore(signals), recipientMinor: signals.recipientMinor };
}

/**
 * Les mineurs DÉCLARÉS que `senderId` ne peut pas atteindre (bouclier RG-21) :
 * le Public ne fait pas entrer un mineur dans un groupe, pas plus qu'il ne lui
 * écrit — un groupe ne débloque rien (RG-22). Le blocage n'en fait pas partie :
 * il garde sa propre règle, qui ne vise que le tête-à-tête. Les portes rendent
 * ces comptes comme INTROUVABLES : l'âge de la cible ne se révèle jamais.
 */
export async function shieldedRecipients(
  prisma: PairAccessDb,
  senderId: string,
  recipientIds: readonly string[],
  now: Date = new Date(),
): Promise<ReadonlySet<string>> {
  return minorShieldedAmong(prisma, { feature: 'dm.request', senderId, recipientIds, now });
}

/** Les colonnes que la ligne `Participant` du DESTINATAIRE reçoit à l'ouverture. */
export const requestRecipientFields = (
  opening: DirectOpening,
  now: Date,
): { messageRequestAt: Date; messageRequestRisk: number } | Record<string, never> =>
  opening.kind === 'request' ? { messageRequestAt: now, messageRequestRisk: opening.risk } : {};

/** Les droits de l'EXPÉDITEUR : vers un mineur, aucun média tant que la demande n'est pas acceptée. */
export const requesterPermissionsFor = (opening: DirectOpening, base: Readonly<ParticipantPermissions>): ParticipantPermissions =>
  opening.kind === 'request' && opening.recipientMinor
    ? { ...base, canSendFiles: false, canSendImages: false, canSendVideos: false, canSendAudios: false }
    : { ...base };

export type ServedMessageRequest = {
  readonly since: string;
  readonly filtered: boolean;
  readonly mediaBlurred: true;
};

/** La demande telle que le destinataire la reçoit ; `null` pour une conversation ordinaire. */
export function servedMessageRequest(row: { readonly messageRequestAt?: Date | null; readonly messageRequestRisk?: number | null }): ServedMessageRequest | null {
  if (!(row.messageRequestAt instanceof Date)) return null;
  return {
    since: row.messageRequestAt.toISOString(),
    filtered: (row.messageRequestRisk ?? 0) >= MESSAGE_REQUEST_FILTER_THRESHOLD,
    mediaBlurred: true,
  };
}

export type MessageRequestListMode = 'exclude' | 'only' | 'filtered';

export const MESSAGE_REQUEST_LIST_MODES: readonly MessageRequestListMode[] = ['exclude', 'only', 'filtered'];

/**
 * Le fragment de la clause `participants.some` du LECTEUR pour `GET /conversations?requests=` :
 * `exclude` = la liste principale, `only` = la boîte de demandes, `filtered` = les demandes filtrées.
 * Le champ ABSENT (document antérieur) vaut « pas une demande ».
 */
export function viewerRequestClause(mode: MessageRequestListMode): Prisma.ParticipantWhereInput {
  if (mode === 'exclude') return { OR: [{ messageRequestAt: null }, { messageRequestAt: { isSet: false } }] };
  if (mode === 'filtered') return { messageRequestAt: { not: null }, messageRequestRisk: { gte: MESSAGE_REQUEST_FILTER_THRESHOLD } };
  return {
    messageRequestAt: { not: null },
    OR: [{ messageRequestRisk: null }, { messageRequestRisk: { isSet: false } }, { messageRequestRisk: { lt: MESSAGE_REQUEST_FILTER_THRESHOLD } }],
  };
}

export type MessageRequestAcceptance =
  | {
      readonly kind: 'accepted';
      readonly requesterId: string;
      /** La ligne dont les droits viennent d'être rouverts : son cache de lecture s'invalide. */
      readonly requesterParticipantId: string;
      readonly levelRaised: boolean;
    }
  | { readonly kind: 'not-pending' };

const NOT_PENDING: MessageRequestAcceptance = { kind: 'not-pending' };

/**
 * Le DESTINATAIRE accepte : le lien monte d'abord (au moins Connaissance des deux
 * côtés), puis la demande s'efface et l'expéditeur retrouve ses droits fondateurs.
 * Un lien qui échoue laisse la demande en attente, rejouable. Un blocage, une
 * demande déjà traitée ou l'expéditeur lui-même : `not-pending`, sans rien écrire.
 */
export async function acceptMessageRequest(
  prisma: MessageRequestDb,
  params: { readonly conversationId: string; readonly userId: string; readonly now?: Date },
): Promise<MessageRequestAcceptance> {
  const now = params.now ?? new Date();
  const own = await prisma.participant.findFirst({
    where: { conversationId: params.conversationId, userId: params.userId, isActive: true, messageRequestAt: { not: null } },
    select: { id: true },
  });
  if (!own) return NOT_PENDING;

  const requester = await prisma.participant.findFirst({
    where: { conversationId: params.conversationId, isActive: true, userId: { not: params.userId } },
    select: { id: true, userId: true },
  });
  if (!requester?.userId) return NOT_PENDING;
  if (await isBlockedBetween(prisma, params.userId, requester.userId)) return NOT_PENDING;

  const outcome = await recordLevel(prisma as unknown as UserRelationDb, {
    userA: params.userId,
    userB: requester.userId,
    level: 'ACQUAINTANCE',
    origin: 'request',
    at: now,
  });
  const cleared = await prisma.participant.updateMany({
    where: { id: own.id, messageRequestAt: { not: null } },
    data: { messageRequestAt: null, messageRequestRisk: null },
  });
  if (cleared.count === 0) return NOT_PENDING;

  await prisma.participant.updateMany({
    where: { id: requester.id },
    data: { permissions: { ...FOUNDING_MEMBER_PERMISSIONS } },
  });
  // La ligne de liste change de boîte : la synchronisation delta (`updatedSince`) doit la revoir.
  await prisma.conversation.updateMany({ where: { id: params.conversationId }, data: { updatedAt: now } });
  return {
    kind: 'accepted',
    requesterId: requester.userId,
    requesterParticipantId: requester.id,
    levelRaised: outcome === 'created' || outcome === 'raised',
  };
}

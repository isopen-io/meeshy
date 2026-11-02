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
 * - **Direct dès Connaissance** (`dm.direct`), demande en dessous — dans un
 *   tête-à-tête comme dans un groupe, à la création, à l'ajout, à l'invitation et
 *   par un lien (RG-22 : un groupe ne débloque rien).
 * - **Aucune issue ne distingue un mineur** (audit B1, B2) : la porte répond
 *   pareil ; le score ne part jamais sur le fil (`withoutRequestColumns`). Vers un
 *   mineur hors Connaissance, la demande est CONTENUE en aval (RG-21) : score
 *   plafond (rangée filtrée), aucune notification ni mention, aucun appel, et
 *   l'expéditeur naît sans média (transferts compris).
 * - **Score de risque** (MIN-03) : âge du compte expéditeur, rafale de
 *   conversations ouvertes en 24 h, absence de communauté commune, renforcé quand
 *   le destinataire est mineur. Au-delà du seuil, la demande est FILTRÉE.
 * - **Accepter** (le geste explicite) relève l'expéditeur au moins en
 *   Connaissance des deux côtés et lui rend ses médias. **Répondre** efface la
 *   demande sans consentement implicite (`answerMessageRequest`, audit M3).
 * - **Ignorer** = masquer pour soi (`delete-for-me`), silencieux.
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import type { ParticipantPermissions } from '@meeshy/shared/types/participant';
import { declaredAgeClass } from '@meeshy/shared/utils/age';
import { isBlockedBetween } from '../../utils/blocking';
import { FOUNDING_MEMBER_PERMISSIONS } from '../participantRights';
import { pairAccessAmong, type PairAccessDb } from '../relations/pairAccess';
import { recordAcquaintance, recordLevel, type UserRelationDb } from '../relations/userRelationWriter';

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
  | { readonly kind: 'request'; readonly risk: number; readonly recipientMinor: boolean };

const DIRECT: DirectOpening = { kind: 'direct' };

type SenderSignals = { readonly accountAgeHours: number | null; readonly requestsLast24h: number };

async function senderSignals(prisma: MessageRequestDb, senderId: string, now: Date): Promise<SenderSignals> {
  const [sender, burst] = await Promise.all([
    prisma.user.findUnique({ where: { id: senderId }, select: { createdAt: true } }),
    prisma.participant.count({ where: { userId: senderId, role: 'creator', joinedAt: { gte: new Date(now.getTime() - DAY_MS) } } }),
  ]);
  const createdAt = sender?.createdAt instanceof Date ? sender.createdAt : null;
  return { accountAgeHours: createdAt ? (now.getTime() - createdAt.getTime()) / 3_600_000 : null, requestsLast24h: burst };
}

/**
 * À l'entrée dans une conversation ouverte par `senderId` — un tête-à-tête, un
 * groupe, l'ajout d'un membre (MSG-01, MSG-03, RG-22) : pour chaque destinataire,
 * DIRECT dès Connaissance, sinon une DEMANDE dans sa boîte. Un groupe ne débloque
 * rien : y faire entrer un inconnu pose une demande sur sa ligne.
 *
 * **Aucune issue de refus** (audit #14107, B2) : vers un mineur hors Connaissance,
 * la porte se comporte exactement comme vers un majeur — mêmes lectures, même
 * réponse. La protection s'applique EN AVAL : la demande contenue par le bouclier
 * (`dm.request`, RG-21) a le score plafond (rangée filtrée), elle ne sonne pas,
 * n'appelle pas, et l'expéditeur naît sans média. Le blocage reste l'affaire de
 * l'appelant (le tête-à-tête le refuse avant d'arriver ici).
 */
export async function decideOpenings(
  prisma: MessageRequestDb,
  params: { readonly senderId: string; readonly recipientIds: readonly string[]; readonly now?: Date },
): Promise<ReadonlyMap<string, DirectOpening>> {
  const now = params.now ?? new Date();
  const ids = [...new Set(params.recipientIds)].filter((id) => id && id !== params.senderId);
  if (ids.length === 0) return new Map();
  const among = { subjectId: params.senderId, otherIds: ids, subjectIs: 'viewer' as const, now };
  const [direct, request, sender, recipients] = await Promise.all([
    pairAccessAmong(prisma, { ...among, feature: 'dm.direct' }),
    pairAccessAmong(prisma, { ...among, feature: 'dm.request' }),
    senderSignals(prisma, params.senderId, now),
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, birthDate: true } }),
  ]);
  const minors = new Set(recipients.filter((r) => declaredAgeClass(r.birthDate ?? null, now) === 'minor').map((r) => r.id));

  return new Map(
    ids.map((id): [string, DirectOpening] => {
      if (direct.get(id)?.allowed === true) return [id, DIRECT];
      const verdict = request.get(id);
      const contained = verdict?.allowed !== true;
      const risk = contained
        ? RISK_CEILING
        : messageRequestRiskScore({
            senderAccountAgeHours: sender.accountAgeHours,
            senderRequestsLast24h: sender.requestsLast24h,
            sharesCommunity: verdict?.effectiveLevel === 'COMMUNITY',
            recipientMinor: minors.has(id),
          });
      return [id, { kind: 'request', risk, recipientMinor: minors.has(id) }];
    }),
  );
}

/** {@link decideOpenings} pour UN tête-à-tête. */
export async function decideDirectOpening(
  prisma: MessageRequestDb,
  params: { readonly senderId: string; readonly recipientId: string; readonly now?: Date },
): Promise<DirectOpening> {
  const openings = await decideOpenings(prisma, { senderId: params.senderId, recipientIds: [params.recipientId], now: params.now });
  return openings.get(params.recipientId) ?? DIRECT;
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

/**
 * Les lignes `Participant` sans leurs colonnes de demande (audit #14107, B1) :
 * la demande ne se sert qu'à son destinataire, par `servedMessageRequest` — une
 * ligne remise telle quelle à quelqu'un d'autre (réponse de création, socket)
 * porterait la date et le score, et le score dit l'âge.
 */
export const withoutRequestColumns = <T extends object>(rows: readonly T[]): Array<Omit<T, 'messageRequestAt' | 'messageRequestRisk'>> =>
  rows.map((row) => {
    const { messageRequestAt: _at, messageRequestRisk: _risk, ...rest } = row as T & { messageRequestAt?: unknown; messageRequestRisk?: unknown };
    return rest;
  });

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

/**
 * Le destinataire RÉPOND à une demande sans l'accepter d'un geste (audit #14107,
 * M3) : un ancien client, qui ne connaît pas la boîte, reste fonctionnel — la
 * demande s'efface (la conversation retrouve son son). Mais une réponse n'est
 * pas un consentement :
 * - le lien ne monte à Connaissance que si aucune baisse volontaire n'est gravée
 *   (RG-07, `recordAcquaintance` la respecte sans condition de date) ;
 * - un MINEUR qui répond ne fait monter aucun lien et ne rouvre aucun média :
 *   seul le geste explicite « Accepter » le fait.
 * L'expéditeur qui relance n'efface rien (sa ligne ne porte pas de demande).
 */
export async function answerMessageRequest(
  prisma: MessageRequestDb,
  params: { readonly conversationId: string; readonly userId: string; readonly now?: Date },
): Promise<{ readonly answered: boolean }> {
  const now = params.now ?? new Date();
  const own = await prisma.participant.findFirst({
    where: { conversationId: params.conversationId, userId: params.userId, isActive: true, messageRequestAt: { not: null } },
    select: { id: true },
  });
  if (!own) return { answered: false };
  const requester = await prisma.participant.findFirst({
    where: { conversationId: params.conversationId, isActive: true, userId: { not: params.userId } },
    select: { userId: true },
  });
  if (!requester?.userId || (await isBlockedBetween(prisma, params.userId, requester.userId))) return { answered: false };

  const replier = await prisma.user.findUnique({ where: { id: params.userId }, select: { birthDate: true } });
  if (declaredAgeClass(replier?.birthDate ?? null, now) !== 'minor') {
    await recordAcquaintance(prisma as unknown as UserRelationDb, { userA: params.userId, userB: requester.userId, at: now });
  }
  const cleared = await prisma.participant.updateMany({
    where: { id: own.id, messageRequestAt: { not: null } },
    data: { messageRequestAt: null, messageRequestRisk: null },
  });
  if (cleared.count === 0) return { answered: false };
  await prisma.conversation.updateMany({ where: { id: params.conversationId }, data: { updatedAt: now } });
  return { answered: true };
}

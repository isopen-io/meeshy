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
 *   plafond (rangée filtrée), aucune notification ni mention, aucun appel.
 * - **Score de risque** (MIN-03) : âge du compte expéditeur, rafale de
 *   conversations ouvertes en 24 h, absence de communauté commune, renforcé quand
 *   le destinataire est mineur. Au-delà du seuil, la demande est FILTRÉE.
 * - **Médias** : l'expéditeur d'un tête-à-tête en demande n'en envoie aucun,
 *   QUEL QUE SOIT l'âge du destinataire (contre-audit C1), jusqu'à ce que le
 *   destinataire accepte ou réponde.
 * - **Accepter** (le geste explicite) relève au moins en Connaissance, des deux
 *   côtés, le lien avec CELUI qui a fait entrer (`messageRequestFromId`, E1), et
 *   ne rouvre que ses médias fermés — jamais les droits d'un autre membre.
 * - **Répondre** (`answerMessageRequest`) vaut accord dans un tête-à-tête
 *   (décision porteur du 2026-11-04, #16053, qui remplace l'audit 3 H1) : la
 *   demande est consommée et les médias de l'expéditeur se rouvrent, mêmes
 *   gardes qu'« Accepter », sauf demande encore CONTENUE (RG-21) — mais aucun lien ne monte : une Connaissance
 *   implicite reste l'affaire de `autoAcquaintance` et de ses gardes (mineur,
 *   refus, baisse volontaire RG-07). Dans un groupe, répondre sort seulement la
 *   conversation de la boîte (RG-22 : un groupe ne débloque rien).
 * - **Ignorer** = masquer pour soi (`delete-for-me`), silencieux.
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import type { ParticipantPermissions } from '@meeshy/shared/types/participant';
import { declaredAgeClass } from '@meeshy/shared/utils/age';
import { isBlockedBetween } from '../../utils/blocking';
import { pairAccessAmong, type PairAccessDb } from '../relations/pairAccess';
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

type RequestColumns = { messageRequestAt: Date | null; messageRequestRisk: number | null; messageRequestFromId: string | null };

/**
 * Les colonnes que la ligne `Participant` du DESTINATAIRE reçoit à l'ouverture —
 * et qui l'a fait entrer (`fromId`, audit E1). Une entrée DIRECTE les écrit à
 * `null` : un retour (rejoin) ne garde pas une demande d'un passage précédent (F1).
 */
export const requestRecipientFields = (opening: DirectOpening, now: Date, fromId: string): RequestColumns =>
  opening.kind === 'request'
    ? { messageRequestAt: now, messageRequestRisk: opening.risk, messageRequestFromId: fromId }
    : { messageRequestAt: null, messageRequestRisk: null, messageRequestFromId: null };

const MEDIA_RIGHTS = ['canSendFiles', 'canSendImages', 'canSendVideos', 'canSendAudios'] as const;

/**
 * Les droits de l'EXPÉDITEUR d'un tête-à-tête : aucun média tant que la demande
 * n'est pas ACCEPTÉE, quel que soit l'âge du destinataire (audit #14107, C1) —
 * une règle qui dépendrait de l'âge se lirait dans les droits servis et dans le
 * refus d'envoyer une image. Même règle que `mediaBlurred`, servi pour toute demande.
 */
export const requesterPermissionsFor = (opening: DirectOpening, base: Readonly<ParticipantPermissions>): ParticipantPermissions =>
  opening.kind === 'request'
    ? { ...base, ...Object.fromEntries(MEDIA_RIGHTS.map((right) => [right, false])) }
    : { ...base };

/**
 * Les lignes `Participant` sans leurs colonnes de demande (audit #14107, B1) :
 * la demande ne se sert qu'à son destinataire, par `servedMessageRequest` — une
 * ligne remise telle quelle à quelqu'un d'autre (réponse de création, socket)
 * porterait la date et le score, et le score dit l'âge.
 */
export const withoutRequestFields = <T extends object>(row: T): Omit<T, 'messageRequestAt' | 'messageRequestRisk' | 'messageRequestFromId'> => {
  const { messageRequestAt: _at, messageRequestRisk: _risk, messageRequestFromId: _from, ...rest } = row as T & {
    messageRequestAt?: unknown;
    messageRequestRisk?: unknown;
    messageRequestFromId?: unknown;
  };
  return rest;
};

export const withoutRequestColumns = <T extends object>(
  rows: readonly T[],
): Array<Omit<T, 'messageRequestAt' | 'messageRequestRisk' | 'messageRequestFromId'>> => rows.map(withoutRequestFields);

export type ServedMessageRequest = {
  /** Date d'arrivée dans la boîte ; `null` une fois qu'on y a répondu (la conversation a quitté la boîte). */
  readonly since: string | null;
  readonly filtered: boolean;
  readonly mediaBlurred: true;
  /** Le destinataire a répondu sans accepter (groupe, ou tête-à-tête avant #16053) : hors de la boîte, « Accepter » reste possible. */
  readonly answered: boolean;
};

type ServedRequestRow = {
  readonly messageRequestAt?: Date | null;
  readonly messageRequestRisk?: number | null;
  readonly messageRequestFromId?: string | null;
};

/**
 * La demande telle que le destinataire la reçoit ; `null` pour une conversation
 * ordinaire ou une demande ACCEPTÉE. Tant qu'elle n'est pas acceptée, elle se
 * sert — dans la boîte (`answered: false`) ou après une réponse (`answered: true`).
 */
export function servedMessageRequest(row: ServedRequestRow): ServedMessageRequest | null {
  if (row.messageRequestAt instanceof Date) {
    return {
      since: row.messageRequestAt.toISOString(),
      filtered: (row.messageRequestRisk ?? 0) >= MESSAGE_REQUEST_FILTER_THRESHOLD,
      mediaBlurred: true,
      answered: false,
    };
  }
  return row.messageRequestFromId ? { since: null, filtered: false, mediaBlurred: true, answered: true } : null;
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
      /** `null` : celui qui a fait entrer est parti ou bloqué — la demande se lève sans lien (audit 3, M-a). */
      readonly requesterId: string | null;
      /** La ligne dont les droits viennent d'être rouverts : son cache de lecture s'invalide. */
      readonly requesterParticipantId: string | null;
      readonly levelRaised: boolean;
    }
  | { readonly kind: 'not-pending' };

const NOT_PENDING: MessageRequestAcceptance = { kind: 'not-pending' };

/**
 * Une demande N'EST PAS ACCEPTÉE tant que sa ligne porte sa date (dans la boîte)
 * ou sa provenance (on y a répondu dans un groupe, ou dans un tête-à-tête avant
 * #16053). « Accepter », et une réponse dans un tête-à-tête, effacent la provenance.
 */
export const NOT_YET_ACCEPTED: Prisma.ParticipantWhereInput = {
  OR: [{ messageRequestAt: { not: null } }, { messageRequestFromId: { not: null } }],
};

const CLEARED_REQUEST = { messageRequestAt: null, messageRequestRisk: null, messageRequestFromId: null } as const;

/**
 * Le DESTINATAIRE accepte — dans la boîte comme après y avoir répondu. Le lien
 * monte d'abord (au moins Connaissance des deux côtés) avec celui qui l'a fait
 * entrer, puis la demande s'efface et, dans un tête-à-tête, l'expéditeur
 * retrouve ses médias. Un lien qui échoue laisse la demande en attente,
 * rejouable. Celui qui a fait entrer est PARTI ou BLOQUÉ : la demande se lève
 * quand même, sans lien ni média (audit 3, M-a). Déjà acceptée, ou l'expéditeur
 * lui-même : `not-pending`, sans rien écrire.
 */
export async function acceptMessageRequest(
  prisma: MessageRequestDb,
  params: { readonly conversationId: string; readonly userId: string; readonly now?: Date },
): Promise<MessageRequestAcceptance> {
  const settled = await settleRequest(prisma, { ...params, now: params.now ?? new Date() }, { raiseLink: true });
  return settled.kind === 'held' ? NOT_PENDING : settled;
}

/**
 * La demande serait-elle encore CONTENUE (RG-21) si elle s'ouvrait maintenant ?
 * Le bouclier exige au moins Connaissance (`dm.request`) — un mineur face à un
 * inconnu. Une réponse ne relevant aucun lien, elle ne peut pas lever ce
 * bouclier : seul « Accepter » le fait (#16053, audit C1).
 */
async function stillContained(prisma: MessageRequestDb, requesterId: string, recipientId: string, now: Date): Promise<boolean> {
  const verdicts = await pairAccessAmong(prisma, { subjectId: requesterId, otherIds: [recipientId], subjectIs: 'viewer', now, feature: 'dm.request' });
  return verdicts.get(recipientId)?.allowed !== true;
}

/**
 * Le tronc commun d'« Accepter » et d'une réponse dans un tête-à-tête : mêmes
 * lectures, mêmes gardes (parti ou bloqué ⇒ aucun média), même ordre d'écriture.
 * Seul « Accepter » relève le lien (`raiseLink`).
 */
async function settleRequest(
  prisma: MessageRequestDb,
  params: { readonly conversationId: string; readonly userId: string; readonly now: Date },
  options: { readonly raiseLink: boolean; readonly holdWhenContained?: boolean },
): Promise<MessageRequestAcceptance | { readonly kind: 'held' }> {
  const now = params.now;
  const own = await prisma.participant.findFirst({
    where: { conversationId: params.conversationId, userId: params.userId, isActive: true, ...NOT_YET_ACCEPTED },
    select: { id: true, messageRequestFromId: true },
  });
  if (!own) return NOT_PENDING;
  const found = await requesterOf(prisma, { conversationId: params.conversationId, userId: params.userId, fromId: own.messageRequestFromId ?? null });
  const requester = found && !(await isBlockedBetween(prisma, params.userId, found.userId)) ? found : null;
  if (requester && options.holdWhenContained && (await stillContained(prisma, requester.userId, params.userId, now))) return { kind: 'held' };

  const outcome = requester && options.raiseLink
    ? await recordLevel(prisma as unknown as UserRelationDb, { userA: params.userId, userB: requester.userId, level: 'ACQUAINTANCE', origin: 'request', at: now })
    : null;
  // Les médias se rouvrent AVANT l'effacement (audit 4, F-e) : une panne entre les
  // deux laisse la demande en attente, et le rejeu termine — jamais l'inverse.
  if (requester?.direct) await reopenMedia(prisma, requester.id);
  const cleared = await prisma.participant.updateMany({ where: { id: own.id, ...NOT_YET_ACCEPTED }, data: CLEARED_REQUEST });
  if (cleared.count === 0) return NOT_PENDING;
  // La ligne de liste change de boîte : la synchronisation delta (`updatedSince`) doit la revoir.
  await prisma.conversation.updateMany({ where: { id: params.conversationId }, data: { updatedAt: now } });
  return {
    kind: 'accepted',
    requesterId: requester?.userId ?? null,
    requesterParticipantId: requester?.direct ? requester.id : null,
    levelRaised: outcome === 'created' || outcome === 'raised',
  };
}

/** Relit les droits JUSTE avant de les réécrire : seules les quatre clés de média changent (audit 3, F-c). */
async function reopenMedia(prisma: MessageRequestDb, participantId: string): Promise<void> {
  const fresh = await prisma.participant.findUnique({ where: { id: participantId }, select: { permissions: true } });
  const permissions = { ...((fresh?.permissions ?? {}) as Record<string, unknown>) };
  await prisma.participant.updateMany({
    where: { id: participantId },
    data: { permissions: { ...permissions, ...Object.fromEntries(MEDIA_RIGHTS.map((right) => [right, true])) } },
  });
}

type Requester = { readonly id: string; readonly userId: string; readonly direct: boolean };

/**
 * QUI a fait entrer le lecteur (audit E1) : le compte gravé à l'ouverture, et lui
 * seul, s'il est encore là. Une ligne antérieure à cette colonne ne vaut que dans
 * un tête-à-tête, où l'autre membre est forcément l'expéditeur ; dans un groupe,
 * personne.
 */
async function requesterOf(
  prisma: MessageRequestDb,
  params: { readonly conversationId: string; readonly userId: string; readonly fromId: string | null },
): Promise<Requester | null> {
  const conversation = await prisma.conversation.findUnique({ where: { id: params.conversationId }, select: { type: true } });
  const direct = conversation?.type === 'direct';
  if (!params.fromId && !direct) return null;
  const row = await prisma.participant.findFirst({
    where: { conversationId: params.conversationId, isActive: true, userId: params.fromId ?? { not: params.userId } },
    select: { id: true, userId: true },
  });
  if (!row?.userId || row.userId === params.userId) return null;
  return { id: row.id, userId: row.userId, direct };
}

export type MessageRequestAnswer = {
  readonly answered: boolean;
  /** La ligne de l'expéditeur dont les médias viennent de se rouvrir : son cache de lecture s'invalide. */
  readonly requesterParticipantId: string | null;
};

const NOT_ANSWERED: MessageRequestAnswer = { answered: false, requesterParticipantId: null };

/**
 * Le destinataire RÉPOND à une demande (décision porteur du 2026-11-04, #16053,
 * qui remplace l'audit 3 H1 : aucun client publié ne porte « Accepter »).
 *
 * - **Tête-à-tête** : la réponse vaut accord — même tronc qu'« Accepter »
 *   (`settleRequest`) : la demande est consommée, et les médias de celui qui a
 *   fait entrer se rouvrent, relus juste avant la réécriture ; parti ou bloqué,
 *   la demande se lève sans rien rouvrir. Aucun lien ne monte (RG-07, mineurs,
 *   refus : la Connaissance implicite reste à `autoAcquaintance`). Une réponse
 *   déjà donnée sous l'ancienne règle (provenance seule) est consommée aussi.
 *   Une demande que le bouclier CONTIENT encore (RG-21 : un mineur face à un
 *   inconnu) n'est pas levée par une réponse, qui ne relève aucun lien : elle
 *   suit la voie du groupe, et seul « Accepter » rouvre (audit C1).
 * - **Groupe** (RG-22) : la conversation quitte la boîte et retrouve son son,
 *   rien d'autre — la provenance reste, « Accepter » reste possible.
 *
 * L'expéditeur qui relance n'efface rien (sa ligne ne porte pas de demande).
 */
export async function answerMessageRequest(
  prisma: MessageRequestDb,
  params: { readonly conversationId: string; readonly userId: string; readonly now?: Date },
): Promise<MessageRequestAnswer> {
  const now = params.now ?? new Date();
  const conversation = await prisma.conversation.findUnique({ where: { id: params.conversationId }, select: { type: true } });
  if (conversation?.type === 'direct') {
    const settled = await settleRequest(prisma, { ...params, now }, { raiseLink: false, holdWhenContained: true });
    if (settled.kind === 'accepted') return { answered: true, requesterParticipantId: settled.requesterParticipantId };
    if (settled.kind === 'not-pending') return NOT_ANSWERED;
  }
  const cleared = await prisma.participant.updateMany({
    where: { conversationId: params.conversationId, userId: params.userId, isActive: true, messageRequestAt: { not: null } },
    data: { messageRequestAt: null, messageRequestRisk: null },
  });
  if (cleared.count === 0) return NOT_ANSWERED;
  await prisma.conversation.updateMany({ where: { id: params.conversationId }, data: { updatedAt: now } });
  return { answered: true, requesterParticipantId: null };
}

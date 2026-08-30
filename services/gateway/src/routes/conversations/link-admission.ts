import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ParticipantPermissions } from '@meeshy/shared/types/participant';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { toAnonymousUsername } from '@meeshy/shared/utils/anonymous-username';
import { generateNickname } from '../../utils/anonymous-nickname';
import { generateSessionToken, hashSessionToken } from '../../utils/session-token';
import { SecuritySanitizer } from '../../utils/sanitize';
import { logError } from '../../utils/logger';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendBadRequest,
  sendUnauthorized,
  sendInternalError,
} from '../../utils/response';
import { errorResponseSchema, validationErrorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { UnifiedAuthContext, UnifiedAuthRequest } from '../../middleware/auth';
import { isConversationClosed } from '../../services/messaging/conversationWriteAdmission';
import {
  admitLinkEntry,
  isLinkAdmissionRefusal,
  type LinkAdmissionIdentity,
  type LinkAdmissionRefusal,
} from '../../services/conversations/linkAdmission';
import {
  REJOIN_PARTICIPANT_STATE,
  type ConversationEntryDecision,
} from '../../services/conversations/conversationEntryAdmission';
import { findFreeAnonymousUsername } from '../../services/conversations/anonymousUsername';
import { postJoinSystemMessage } from '../../services/conversations/joinSystemMessage';
import {
  resolveEntryRights,
  type ParticipantRightName,
} from '../../services/participantRights';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache';

// ─── Types partagés par les trois portes (canonique + deux adaptateurs) ──────

type ParticipantRow = Awaited<ReturnType<PrismaClient['participant']['create']>>;
type ShareLinkRow = Awaited<ReturnType<PrismaClient['conversationShareLink']['findFirst']>>;
/** Le lien AVEC sa conversation incluse — jamais `null` passé ce point. */
type ShareLinkWithConversation = NonNullable<ShareLinkRow> & {
  conversation: { id: string; title: string; type: string; isActive: boolean; closedAt: Date | null };
};

export type GuestRights = Record<ParticipantRightName, boolean>;

export interface LinkJoinProfileInput {
  readonly firstName: string;
  readonly lastName: string;
  /** Ce que le visiteur a explicitement demandé (`username` historique, `nickname` cible). */
  readonly requestedUsername?: string;
  readonly email?: string;
  readonly birthday?: string;
  /** Déjà normalisée (`normalizeLanguageForDedup`) par le schéma Zod de l'appelant. */
  readonly language: string;
  readonly deviceFingerprint?: string;
}

export type LinkJoinBroadcast = (message: unknown, conversationId: string) => Promise<void>;

export interface LinkJoinParams {
  readonly prisma: PrismaClient;
  readonly key: string;
  /** `undefined` = visiteur sans AUCUNE créance — l'identité vient de la créance, jamais du chemin. */
  readonly authContext: UnifiedAuthContext | undefined;
  readonly requestIp: string;
  readonly profile: LinkJoinProfileInput;
  readonly broadcast?: LinkJoinBroadcast;
}

export type LinkJoinOutcome =
  | { readonly kind: 'not-found' }
  | { readonly kind: 'refused'; readonly refusal: LinkAdmissionRefusal }
  | { readonly kind: 'validation'; readonly message: string }
  /**
   * `allowedLanguages` — DÉLIBÉRÉMENT hors de `admitLinkEntry` (comme
   * `requireEmail`/`requireBirthday`/`requireNickname`, cf. son doc-tête) :
   * elle juge `profile.language`, un champ du CORPS, pas le lien ni
   * l'identité. Un outcome à part plutôt que `validation` (400) : c'était un
   * 403 des deux côtés historiquement (`anonymous.ts`), et #4167 étend la
   * vérification aux deux identités — un des « huit réglages » listés par
   * l'issue comme absents de la porte inscrite.
   */
  | { readonly kind: 'language-not-allowed' }
  | { readonly kind: 'username-taken'; readonly suggestion: string }
  | {
      readonly kind: 'joined';
      readonly outcome: 'new' | 'rejoin' | 'already-member';
      readonly shareLink: ShareLinkWithConversation;
      readonly participant: ParticipantRow;
      readonly sessionToken?: string;
      readonly rights: GuestRights;
    };

// ─── Identité : dérivée de la CRÉANCE, jamais du chemin appelé ───────────────

export function deriveLinkAdmissionIdentity(
  authContext: UnifiedAuthContext | undefined
): LinkAdmissionIdentity {
  if (authContext?.type === 'user' && authContext.isAuthenticated && authContext.userId) {
    return { kind: 'registered', userId: authContext.userId };
  }
  return { kind: 'guest' };
}

export function resolveClientIp(request: FastifyRequest): string {
  return request.ip || (request.headers['x-forwarded-for'] as string) || '127.0.0.1';
}

/** `key` = `linkId` (`mshy_…`) OU `identifier` lisible OU `id` Mongo — les trois portes acceptaient déjà un sous-ensemble de ce triplet. */
async function findShareLinkByKey(prisma: PrismaClient, key: string): Promise<ShareLinkWithConversation | null> {
  const shareLink = await prisma.conversationShareLink.findFirst({
    where: {
      OR: [
        { linkId: key },
        { identifier: key },
        ...(isValidMongoId(key) ? [{ id: key }] : []),
      ],
    },
    include: {
      conversation: {
        select: { id: true, title: true, type: true, isActive: true, closedAt: true },
      },
    },
  });
  return shareLink as ShareLinkWithConversation | null;
}

/**
 * Critère de fin #3 de #4167 — l'incrément de `currentUses` est ATOMIQUE : la
 * lecture-puis-écriture qui laissait deux requêtes concurrentes franchir
 * ensemble un lien à une place est fermée par un `updateMany` dont le `WHERE`
 * revérifie la capacité au moment de l'écriture, pas au moment de la lecture
 * qui a produit le verdict d'admission.
 *
 * `count === 0` ⇒ la capacité a été prise entre le verdict et cet appel :
 * l'appelant refuse `409 LINK_EXHAUSTED`, exactement comme si `admitLinkEntry`
 * l'avait vu la première fois.
 *
 * Les incréments de `currentConcurrentUsers`/`currentUniqueSessions`
 * voyagent dans le MÊME appel pour un invité (`extraIncrements`) — cf.
 * `linkAdmission.ts` § doc-tête : ces deux compteurs n'ont de sens que pour
 * une identité sans lignée persistante, et aucun mécanisme de décrément
 * n'existe côté inscrit (`POST /conversations/:id/leave` ne touche pas au
 * lien) ; les y inclure produirait une fuite qui ne se referme jamais.
 */
async function claimLinkUse(
  prisma: PrismaClient,
  linkId: string,
  maxUses: number | null,
  extraIncrements: Record<string, { increment: number }> = {}
): Promise<boolean> {
  const claim = await prisma.conversationShareLink.updateMany({
    where: {
      id: linkId,
      ...(maxUses === null ? {} : { OR: [{ maxUses: null }, { currentUses: { lt: maxUses } }] }),
    },
    data: { currentUses: { increment: 1 }, ...extraIncrements },
  });
  return claim.count > 0;
}

const LINK_EXHAUSTED_RACE: LinkAdmissionRefusal = {
  granted: false,
  status: 409,
  code: 'LINK_EXHAUSTED',
  message: "Ce lien a atteint sa limite d'utilisation",
};

async function joinAsGuest(
  prisma: PrismaClient,
  shareLink: ShareLinkWithConversation,
  profile: LinkJoinProfileInput,
  requestIp: string,
  broadcast: LinkJoinBroadcast | undefined
): Promise<LinkJoinOutcome> {
  const firstName = SecuritySanitizer.sanitizeText(profile.firstName || '');
  const lastName = SecuritySanitizer.sanitizeText(profile.lastName || '');
  const requestedUsername =
    profile.requestedUsername && profile.requestedUsername.trim() !== ''
      ? SecuritySanitizer.sanitizeUsername(profile.requestedUsername.trim())
      : generateNickname(firstName, lastName);
  const desiredUsername = toAnonymousUsername(requestedUsername);
  const username = await findFreeAnonymousUsername(prisma, desiredUsername, shareLink.conversationId);

  if (!username) {
    return { kind: 'username-taken', suggestion: toAnonymousUsername(generateNickname(firstName, lastName)) };
  }

  const claimed = await claimLinkUse(prisma, shareLink.id, shareLink.maxUses, {
    currentConcurrentUsers: { increment: 1 },
    currentUniqueSessions: { increment: 1 },
  });
  if (!claimed) return { kind: 'refused', refusal: LINK_EXHAUSTED_RACE };

  const sessionToken = generateSessionToken(profile.deviceFingerprint);
  const sessionTokenHash = hashSessionToken(sessionToken);

  const permissions: ParticipantPermissions = {
    canSendMessages: shareLink.allowAnonymousMessages,
    canSendFiles: shareLink.allowAnonymousFiles,
    canSendImages: shareLink.allowAnonymousImages,
    canSendVideos: false,
    canSendAudios: false,
    canSendLocations: false,
    canSendLinks: false,
    canViewHistory: shareLink.allowViewHistory,
  };

  const participant = await prisma.participant.create({
    data: {
      conversationId: shareLink.conversationId,
      type: 'anonymous',
      displayName: username,
      language: profile.language,
      sessionTokenHash,
      shareLinkId: shareLink.id,
      role: 'member',
      permissions,
      anonymousSession: {
        shareLinkId: shareLink.id,
        session: {
          sessionTokenHash,
          ipAddress: requestIp,
          // `country` n'est plus déduit ici : `extractCountryFromIP`
          // (`routes/anonymous.ts`) est un heuristique décoratif (premier
          // octet de l'IP, repli `'FR'`) — #4167 critère 5 le retire de
          // l'ADMISSION ; le propager dans du code NEUF pour du stockage
          // informatif referait la même fausse promesse ailleurs.
          country: null,
          deviceFingerprint: profile.deviceFingerprint || null,
          connectedAt: new Date(),
        },
        profile: {
          firstName,
          lastName,
          username,
          email: profile.email || null,
          birthday: profile.birthday ? new Date(profile.birthday) : null,
        },
      },
    },
  });

  await postJoinSystemMessage(
    { prisma, broadcast },
    {
      conversationId: shareLink.conversationId,
      participantId: participant.id,
      displayName: username,
      isAnonymous: true,
      viaShareLink: true,
      username,
      givenName: [firstName, lastName].filter(Boolean).join(' ') || undefined,
      linkRules: {
        canSendMessages: shareLink.allowAnonymousMessages,
        canSendFiles: shareLink.allowAnonymousFiles,
        canSendImages: shareLink.allowAnonymousImages,
      },
    }
  );

  return {
    kind: 'joined',
    outcome: 'new',
    shareLink,
    participant,
    sessionToken,
    rights: resolveEntryRights(participant, undefined, shareLink.allowViewHistory),
  };
}

async function joinAsRegistered(
  prisma: PrismaClient,
  shareLink: ShareLinkWithConversation,
  userId: string,
  entry: ConversationEntryDecision,
  broadcast: LinkJoinBroadcast | undefined
): Promise<LinkJoinOutcome> {
  // « Déjà membre » ne consomme rien du lien : aucune place nouvelle n'est
  // prise, donc aucun incrément — même règle que la porte authentifiée
  // aujourd'hui (`sharing.ts`), qui répond sans jamais toucher `currentUses`.
  if (entry.outcome === 'already-member' && entry.participantId) {
    const existing = await prisma.participant.findUnique({ where: { id: entry.participantId } });
    if (!existing) {
      // La ligne désignée par `resolveConversationEntry` a disparu entre les
      // deux lectures — fail-closed, pas de recréation silencieuse.
      return { kind: 'refused', refusal: { granted: false, status: 409, code: 'LINK_EXHAUSTED', message: 'État de participation introuvable' } };
    }
    return {
      kind: 'joined',
      outcome: 'already-member',
      shareLink,
      participant: existing,
      rights: resolveEntryRights(existing, undefined, shareLink.allowViewHistory),
    };
  }

  const claimed = await claimLinkUse(prisma, shareLink.id, shareLink.maxUses);
  if (!claimed) return { kind: 'refused', refusal: LINK_EXHAUSTED_RACE };

  const joiningUserInfo = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, username: true },
  });

  const linkMemberFields = {
    type: 'user',
    displayName: joiningUserInfo?.displayName || joiningUserInfo?.username || 'User',
    role: 'member',
    permissions: {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: false,
      canSendAudios: false,
      canSendLocations: false,
      canSendLinks: false,
      canViewHistory: shareLink.allowViewHistory,
    },
    shareLinkId: shareLink.id,
  };

  let participant: ParticipantRow;
  if (entry.outcome === 'rejoin' && entry.participantId) {
    participant = await prisma.participant.update({
      where: { id: entry.participantId },
      data: { ...linkMemberFields, ...REJOIN_PARTICIPANT_STATE },
    });
    invalidateParticipantLookup(entry.participantId, shareLink.conversationId);
  } else {
    participant = await prisma.participant.create({
      data: {
        conversationId: shareLink.conversationId,
        userId,
        ...linkMemberFields,
        joinedAt: new Date(),
      },
    });
  }

  await postJoinSystemMessage(
    { prisma, broadcast },
    {
      conversationId: shareLink.conversationId,
      participantId: participant.id,
      displayName: linkMemberFields.displayName,
      isAnonymous: false,
      viaShareLink: true,
    }
  );

  return {
    kind: 'joined',
    outcome: entry.outcome === 'rejoin' ? 'rejoin' : 'new',
    shareLink,
    participant,
    rights: resolveEntryRights(participant, undefined, shareLink.allowViewHistory),
  };
}

/**
 * Le CŒUR de jointure par lien, partagé par `POST /links/:key/members`
 * (porte canonique) et par l'adaptateur `POST /anonymous/join/:linkId`
 * (`routes/anonymous.ts`) — critère de fin #2 de #4167. `POST
 * /conversations/join/:linkId` (`routes/conversations/sharing.ts`) DOIT
 * l'appeler de la même façon ; ce fichier étant hors territoire pour cette
 * livraison, le câblage y est déclaré en diff plutôt qu'appliqué (voir le
 * rapport de livraison de #4167).
 */
export async function performLinkJoin(params: LinkJoinParams): Promise<LinkJoinOutcome> {
  const { prisma, key, authContext, requestIp, profile, broadcast } = params;

  const shareLink = await findShareLinkByKey(prisma, key);
  if (!shareLink) return { kind: 'not-found' };

  const identity = deriveLinkAdmissionIdentity(authContext);

  const verdict = await admitLinkEntry({
    prisma,
    link: shareLink,
    conversation: shareLink.conversation,
    identity,
    request: { ip: requestIp },
  });

  if (isLinkAdmissionRefusal(verdict)) return { kind: 'refused', refusal: verdict };

  // `allowedLanguages` — #4167 point 7 : l'un des huit réglages qui
  // n'existaient QUE sur la porte anonyme. Canonicalisée des DEUX côtés via
  // la même SSOT (`normalizeLanguageForDedup`) : les valeurs en base peuvent
  // porter un tag de région (`fr-FR`), un code 3-lettres (`fra`) ou une casse
  // mixte, et `profile.language` arrive déjà normalisée par le schéma Zod de
  // l'appelant — comparer sans canonicaliser les DEUX refuserait un accès qui
  // doit être accordé.
  if (
    shareLink.allowedLanguages.length > 0 &&
    !shareLink.allowedLanguages.some((l) => normalizeLanguageForDedup(l) === profile.language)
  ) {
    return { kind: 'language-not-allowed' };
  }

  // Validations dépendant du CORPS — délibérément hors de `admitLinkEntry`
  // (cf. son doc-tête) : `requireEmail`/`requireBirthday`/`requireNickname`
  // jugent ce que le VISITEUR soumet, pas le lien ni son identité.
  if (shareLink.requireEmail && (!profile.email || profile.email.trim() === '')) {
    return { kind: 'validation', message: "L'email est obligatoire pour rejoindre cette conversation" };
  }
  if (shareLink.requireBirthday && (!profile.birthday || profile.birthday.trim() === '')) {
    return { kind: 'validation', message: 'La date de naissance est obligatoire pour rejoindre cette conversation' };
  }
  if (
    identity.kind === 'guest' &&
    shareLink.requireNickname &&
    (!profile.requestedUsername || profile.requestedUsername.trim() === '')
  ) {
    return { kind: 'validation', message: "Le nom d'utilisateur est obligatoire pour rejoindre cette conversation" };
  }

  if (identity.kind === 'guest') {
    return joinAsGuest(prisma, shareLink, profile, requestIp, broadcast);
  }

  return joinAsRegistered(prisma, shareLink, identity.userId, verdict.entry, broadcast);
}

// ─── Sessions invitées : PATCH|DELETE /guest-sessions/me ─────────────────────

export interface GuestSessionParams {
  readonly prisma: PrismaClient;
  readonly sessionToken: string;
}

export type RefreshGuestSessionOutcome =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'link-gone' }
  | { readonly kind: 'link-expired' }
  | { readonly kind: 'conversation-closed' }
  | { readonly kind: 'refreshed'; readonly participant: ParticipantRow; readonly shareLink: ShareLinkWithConversation };

/**
 * Cœur de `PATCH /guest-sessions/me`, partagé avec l'adaptateur `POST
 * /anonymous/refresh`. Gagne la garde `isConversationClosed` que la porte
 * historique n'avait jamais eue — critère de fin #4 de #4167.
 */
export async function refreshGuestSession(params: GuestSessionParams): Promise<RefreshGuestSessionOutcome> {
  const { prisma, sessionToken } = params;
  const tokenHash = hashSessionToken(sessionToken);

  const participant = await prisma.participant.findFirst({
    where: { sessionTokenHash: tokenHash, type: 'anonymous' },
  });
  if (!participant || !participant.isActive) return { kind: 'invalid' };

  const shareLinkId = participant.anonymousSession?.shareLinkId;
  const shareLink = shareLinkId
    ? ((await prisma.conversationShareLink.findUnique({
        where: { id: shareLinkId },
        include: {
          conversation: { select: { id: true, title: true, type: true, isActive: true, closedAt: true } },
        },
      })) as ShareLinkWithConversation | null)
    : null;

  if (!shareLink || !shareLink.isActive) return { kind: 'link-gone' };
  if (shareLink.expiresAt && shareLink.expiresAt < new Date()) return { kind: 'link-expired' };
  if (isConversationClosed(shareLink.conversation)) return { kind: 'conversation-closed' };

  await prisma.participant.update({
    where: { id: participant.id },
    data: { lastActiveAt: new Date(), isOnline: true },
  });

  return { kind: 'refreshed', participant, shareLink };
}

export type EndGuestSessionOutcome = { readonly kind: 'not-found' } | { readonly kind: 'ended' };

/**
 * Cœur de `DELETE /guest-sessions/me`, partagé avec l'adaptateur `POST
 * /anonymous/leave`. IDEMPOTENT — critère de fin #4 de #4167 : `wasActive`
 * gèle l'état LU avant toute écriture, donc un second appel sur la MÊME
 * session ne marque rien inactif une seconde fois et ne décrémente jamais
 * deux fois `currentConcurrentUsers` (qui pouvait passer sous zéro).
 */
export async function endGuestSession(params: GuestSessionParams): Promise<EndGuestSessionOutcome> {
  const { prisma, sessionToken } = params;
  const tokenHash = hashSessionToken(sessionToken);

  const participant = await prisma.participant.findFirst({
    where: { sessionTokenHash: tokenHash, type: 'anonymous' },
  });
  if (!participant) return { kind: 'not-found' };

  const wasActive = participant.isActive;
  if (!wasActive) return { kind: 'ended' };

  await prisma.participant.update({
    where: { id: participant.id },
    data: { isActive: false, isOnline: false, leftAt: new Date() },
  });

  const shareLinkId = participant.anonymousSession?.shareLinkId;
  if (shareLinkId) {
    await prisma.conversationShareLink.update({
      where: { id: shareLinkId },
      data: { currentConcurrentUsers: { decrement: 1 } },
    });
  }

  return { kind: 'ended' };
}

/**
 * La forme `{participant, conversation}` historique de `POST
 * /anonymous/join|refresh` — exportée pour que l'adaptateur
 * (`routes/anonymous.ts`) la partage plutôt que de la retaper une troisième
 * fois (le canonique a la sienne, propre au contrat cible).
 */
export function participantConversationPayload(participant: ParticipantRow, shareLink: ShareLinkWithConversation) {
  return {
    participant: {
      id: participant.id,
      username: participant.anonymousSession?.profile?.username ?? participant.displayName,
      displayName: participant.displayName,
      firstName: participant.anonymousSession?.profile?.firstName ?? '',
      lastName: participant.anonymousSession?.profile?.lastName ?? '',
      avatar: participant.avatar ?? null,
      banner: null,
      language: participant.language,
      isMeeshyer: false,
      canSendMessages: participant.permissions?.canSendMessages ?? false,
      canSendFiles: participant.permissions?.canSendFiles ?? false,
      canSendImages: participant.permissions?.canSendImages ?? false,
    },
    conversation: {
      id: shareLink.conversation.id,
      title: shareLink.conversation.title,
      type: shareLink.conversation.type,
      allowViewHistory: shareLink.allowViewHistory,
    },
  };
}

// ─── Corps de requête — `POST /links/:key/members` ────────────────────────────

const linkMembersBodySchema = z.object({
  nickname: z.string().optional(),
  email: z.email().optional().or(z.literal('')),
  birthday: z.iso.datetime().optional().or(z.literal('')),
  language: z.string().transform((v) => normalizeLanguageForDedup(v)).default('fr'),
  deviceFingerprint: z.string().optional(),
});

const PARTICIPANT_RIGHTS_SCHEMA_PROPERTIES = {
  canSendMessages: { type: 'boolean' },
  canSendFiles: { type: 'boolean' },
  canSendImages: { type: 'boolean' },
  canSendVideos: { type: 'boolean' },
  canSendAudios: { type: 'boolean' },
  canSendLocations: { type: 'boolean' },
  canSendLinks: { type: 'boolean' },
  canViewHistory: { type: 'boolean' },
} as const;

const linkMembersResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        sessionToken: { type: 'string', description: "Remis une fois — à porter en en-tête X-Session-Token (visiteur sans compte)" },
        conversationId: { type: 'string' },
        participantId: { type: 'string' },
        entry: {
          type: 'object',
          properties: {
            outcome: { type: 'string', enum: ['new', 'rejoin', 'already-member'] },
            canViewHistory: { type: 'boolean' },
            rights: { type: 'object', properties: PARTICIPANT_RIGHTS_SCHEMA_PROPERTIES },
          },
        },
      },
    },
  },
} as const;

function respondToJoinOutcome(reply: FastifyReply, result: LinkJoinOutcome): void {
  switch (result.kind) {
    case 'not-found':
      sendNotFound(reply, 'Lien de conversation introuvable');
      return;
    case 'validation':
      sendBadRequest(reply, result.message);
      return;
    case 'language-not-allowed':
      sendError(reply, 403, 'LANGUAGE_NOT_ALLOWED', { message: 'Langue non autorisée pour ce lien' });
      return;
    case 'username-taken':
      sendError(reply, 409, 'USERNAME_TAKEN_IN_CONVERSATION', {
        message: 'Ce nom d\'utilisateur est déjà utilisé dans cette conversation',
        details: { suggestedNickname: result.suggestion },
      });
      return;
    case 'refused':
      sendError(reply, result.refusal.status, result.refusal.code, { message: result.refusal.message });
      return;
    case 'joined': {
      const statusCode = result.outcome === 'new' ? 201 : 200;
      sendSuccess(
        reply,
        {
          ...(result.sessionToken ? { sessionToken: result.sessionToken } : {}),
          conversationId: result.shareLink.conversationId,
          participantId: result.participant.id,
          entry: {
            outcome: result.outcome,
            canViewHistory: result.rights.canViewHistory,
            // Le lien de partage EST l'audience de `rights` — seul un
            // visiteur sans compte a besoin de connaître le détail des huit
            // droits, cf. `docs/product/api-simplification/conversations.md`
            // § « POST /links/:key/members ». Un inscrit a déjà les siens
            // par `GET /conversations/:key/participants/:participantKey`.
            ...(result.sessionToken ? { rights: result.rights } : {}),
          },
        },
        { statusCode }
      );
      return;
    }
  }
}

// ─── Enregistrement des routes ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fastify's
// hook typing wants the exact preValidation signature; le reste du dépôt
// (`sharing.ts`, `participants.ts`) passe ces middlewares en `any` pour la
// même raison — cf. `registerSharingRoutes`.
export function registerLinkAdmissionRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any,
  _requiredAuth: any
): void {
  const broadcast: LinkJoinBroadcast = (message, conversationId) =>
    fastify.socketIOHandler?.getManager()?.broadcastMessage(message as never, conversationId) ?? Promise.resolve();

  // `POST /links/:key/members` — porte CANONIQUE (#4167 critère 2).
  // S1 (visiteur sans compte) · S2 (inscrit) : l'identité vient de la
  // créance (`optionalAuth` — JWT si présent, sinon aucune exigence), jamais
  // du chemin.
  fastify.post(
    '/links/:key/members',
    {
      schema: {
        description:
          'Join a conversation through its share link. Unified admission law for both anonymous visitors and registered accounts.',
        tags: ['links', 'conversations'],
        summary: 'Join via share link',
        params: {
          type: 'object',
          required: ['key'],
          properties: { key: { type: 'string', description: 'linkId (mshy_…), identifier, or database id' } },
        },
        body: {
          type: 'object',
          properties: {
            nickname: { type: 'string', description: 'Requis si le lien exige un pseudo (visiteur sans compte)' },
            email: { type: 'string', format: 'email' },
            birthday: { type: 'string', format: 'date-time' },
            language: { type: 'string', default: 'fr' },
            deviceFingerprint: { type: 'string' },
          },
        },
        response: {
          200: linkMembersResponseSchema,
          201: linkMembersResponseSchema,
          400: { description: 'Validation error', ...validationErrorResponseSchema },
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          410: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
      preValidation: [optionalAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { key } = request.params as { key: string };
        const body = linkMembersBodySchema.parse(request.body ?? {});
        const authContext = (request as UnifiedAuthRequest).authContext;

        const result = await performLinkJoin({
          prisma,
          key,
          authContext,
          requestIp: resolveClientIp(request),
          profile: {
            firstName: body.nickname ?? '',
            lastName: '',
            requestedUsername: body.nickname,
            email: body.email || undefined,
            birthday: body.birthday || undefined,
            language: body.language,
            deviceFingerprint: body.deviceFingerprint,
          },
          broadcast,
        });

        respondToJoinOutcome(reply, result);
      } catch (error) {
        if (error instanceof z.ZodError) {
          sendBadRequest(reply, 'Données invalides');
          return;
        }
        logError(fastify.log, 'Link members join error:', error);
        sendInternalError(reply, 'Erreur interne du serveur');
      }
    }
  );

  // `PATCH /guest-sessions/me` — remplace `POST /anonymous/refresh` (#4167 critère 4).
  fastify.patch(
    '/guest-sessions/me',
    {
      schema: {
        description: 'Refresh an anonymous guest session. Session token travels in X-Session-Token, never in the body.',
        tags: ['links'],
        summary: 'Refresh guest session',
        headers: {
          type: 'object',
          properties: { 'x-session-token': { type: 'string', description: 'Session token from the join response' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  participant: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' }, username: { type: 'string' }, displayName: { type: 'string' },
                      firstName: { type: 'string' }, lastName: { type: 'string' }, avatar: { type: 'string', nullable: true },
                      banner: { type: 'string', nullable: true }, language: { type: 'string' },
                      isMeeshyer: { type: 'boolean' }, canSendMessages: { type: 'boolean' },
                      canSendFiles: { type: 'boolean' }, canSendImages: { type: 'boolean' },
                    },
                  },
                  conversation: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' }, title: { type: 'string' },
                      type: { type: 'string', enum: ['direct', 'group'] }, allowViewHistory: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          410: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const sessionToken = (request.headers['x-session-token'] as string | undefined)?.trim();
        if (!sessionToken) {
          sendBadRequest(reply, 'Session token requis');
          return;
        }

        const result = await refreshGuestSession({ prisma, sessionToken });
        switch (result.kind) {
          case 'invalid':
            sendUnauthorized(reply, 'Session invalide ou expirée');
            return;
          case 'link-gone':
            sendError(reply, 410, 'LINK_DEACTIVATED', { message: 'Le lien a été désactivé' });
            return;
          case 'link-expired':
            sendError(reply, 410, 'LINK_EXPIRED', { message: 'Le lien a expiré' });
            return;
          case 'conversation-closed':
            sendError(reply, 410, 'CONVERSATION_CLOSED', { message: 'Cette conversation est terminée' });
            return;
          case 'refreshed':
            sendSuccess(reply, participantConversationPayload(result.participant, result.shareLink));
            return;
        }
      } catch (error) {
        logError(fastify.log, 'Guest session refresh error:', error);
        sendInternalError(reply, 'Erreur interne du serveur');
      }
    }
  );

  // `DELETE /guest-sessions/me` — remplace `POST /anonymous/leave` (#4167 critère 4). IDEMPOTENT.
  fastify.delete(
    '/guest-sessions/me',
    {
      schema: {
        description: 'End an anonymous guest session. Idempotent: calling it twice never double-decrements link capacity.',
        tags: ['links'],
        summary: 'End guest session',
        headers: {
          type: 'object',
          properties: { 'x-session-token': { type: 'string', description: 'Session token from the join response' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: { type: 'object', properties: { message: { type: 'string' } } },
            },
          },
          400: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const sessionToken = (request.headers['x-session-token'] as string | undefined)?.trim();
        if (!sessionToken) {
          sendBadRequest(reply, 'Session token requis');
          return;
        }

        const result = await endGuestSession({ prisma, sessionToken });
        if (result.kind === 'not-found') {
          sendNotFound(reply, 'Session introuvable');
          return;
        }
        sendSuccess(reply, { message: 'Session fermée avec succès' });
      } catch (error) {
        logError(fastify.log, 'Guest session end error:', error);
        sendInternalError(reply, 'Erreur interne du serveur');
      }
    }
  );
}

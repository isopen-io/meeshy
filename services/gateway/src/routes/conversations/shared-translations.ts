/**
 * Surface TRADUCTIONS PARTAGÉES (#9899) — `POST` et `GET /conversations/:id/shared-translations`.
 *
 * Décision porteur du 2026-10-10 : c'est l'appareil de chaque membre qui traduit
 * vers SA langue, puis partage sa traduction aux autres. Le serveur ne traduit
 * pas et ne lit pas ce qu'on lui confie : il garde et relaie une enveloppe
 * SCELLÉE (`packages/shared/types/shared-translation.ts`). `payload` n'est
 * jamais déchiffré, analysé ni transformé ; la passerelle n'en connaît que la
 * borne d'entrée, et `kdf`, qu'elle refuse quand le message est chiffré de bout
 * en bout (une dérivation par le texte y laisserait deviner un message court).
 *
 * | geste | ce que la route fait |
 * |---|---|
 * | `POST` | range l'enveloppe (le PREMIER partage gagne) puis la diffuse |
 * | `GET`  | rend celles de la version COURANTE des messages demandés |
 *
 * ─── L'ORDRE DES REFUS (POST) ───────────────────────────────────────────────
 *
 * Le corps (400), la conversation (404), la participation (403), le message et le
 * droit de le LIRE (404), puis ce qu'il EST : protégé (422), langue non normalisée
 * (400), même langue (422), dérivation refusée (422).
 *
 * Le droit de LIRE le message précède tout verdict qui en dirait quelque chose :
 * un 422 « message protégé », « même langue » ou « dérivation refusée » apprendrait
 * à un membre qu'un message qu'il ne lit pas (antérieur à son plancher
 * d'historique, retiré de sa vue) existe et ce qu'il est. Tous les refus qui
 * précèdent sont donc un même 404 — la loi de lecture est `messageReadAccess.ts`,
 * la même que celle du favori et du transfert, jamais une seconde écriture. Elle
 * est jugée avec `'refuse'` : un masquage personnel illisible n'autorise rien.
 *
 * ─── LE PREMIER PARTAGE GAGNE ───────────────────────────────────────────────
 *
 * Une traduction par `(messageId, targetLanguage, sourceVersion)`. La route
 * écrit d'abord et ne relit que sur la violation d'unicité : lire avant d'écrire
 * laisserait deux membres passer ensemble. `sourceVersion` est la version du
 * message qui a été traduite (`editedAt`, ou `"original"`) : une édition la
 * change, l'ancienne ligne n'est plus servie, et un nouveau partage redevient
 * possible. Un partage perdu rend la traduction gagnante (`created: false`) :
 * l'appareil la prend, il n'a pas à retenter.
 *
 * L'arbitre est l'index unique, que Prisma ne crée pas sur MongoDB : il se pose à
 * la main (`packages/shared/prisma/migrations/2026-10-10-shared-translation-indexes.mongodb.js`).
 * Tant qu'il manque, la création ne lève jamais ; le `GET` tient alors la même loi
 * à la lecture (`firstSharedPerSlot`), mais deux partages simultanés se diffusent
 * tous deux.
 *
 * ─── LA DIFFUSION ───────────────────────────────────────────────────────────
 *
 * `message:translation-shared` part à l'audience de `message:translation`
 * (`translationReaders`) : la room de la conversation, ou les seules rooms
 * personnelles de ceux que leur plancher d'historique laisse lire le message.
 * Aucune file hors ligne : c'est une amélioration de lecture, et le `GET` est le
 * rattrapage de qui rouvre la conversation. Une diffusion qui échoue ne fait
 * jamais échouer le partage — la ligne est rangée, le `GET` la sert.
 *
 * Le débit n'a pas de plafond propre : comme ses voisines (`messages-after-read`,
 * `messages-view-once`), la route est sous le limiteur global. Le stockage croît
 * d'une enveloppe (128 Kio au plus) par message, langue du CATALOGUE et version :
 * un code hors du catalogue est refusé comme un code non normalisé.
 */
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  SHARED_TRANSLATION_ALGORITHM,
  SHARED_TRANSLATION_ERROR_CODES,
  SHARED_TRANSLATION_KDFS,
  SHARED_TRANSLATION_LIMITS,
  acceptedSharedTranslationKdfs,
  shareTranslationBodyJsonSchema,
  shareTranslationBodySchema,
  sharedTranslationsQuerySchema,
  type SharedTranslation,
} from '@meeshy/shared/types/shared-translation';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { SUPPORTED_LANGUAGE_CODES } from '@meeshy/shared/utils/language-codes';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { messageProtection, type MessageProtectionInput } from '@meeshy/shared/utils/message-protection';

import type { UnifiedAuthRequest } from '../../middleware/auth';
import { historyReaderFromAuthContext } from '../../services/historyFloor';
import { readerMayReadMessage, readerMayReadMessages } from '../../services/messaging/messageReadAccess';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { translationReaders } from '../../socketio/translationReaders';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { sendBadRequest, sendError, sendForbidden, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response.js';
import { MESSAGE_PROTECTION_SELECT } from './messageProtectionProjection';
import { logger } from './messages-shared';
import { resolveCallerParticipant } from './utils/access-control';

export type SharedTranslationRouteOptions = { readonly now?: () => Date };

/** Ce qu'il faut du message pour juger le droit de lire, la protection, la langue, la dérivation et la version. */
const SHARED_TRANSLATION_MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  createdAt: true,
  deletedAt: true,
  originalLanguage: true,
  editedAt: true,
  isEncrypted: true,
  encryptionMode: true,
  ...MESSAGE_PROTECTION_SELECT,
} as const;

const ORIGINAL_SOURCE_VERSION = 'original';

/**
 * Une enveloppe se range sous un code du catalogue, jamais sous un code inventé :
 * le catalogue borne le nombre d'enveloppes qu'un même message peut porter
 * (une par langue et par version), là où « deux ou trois lettres » en ouvrait
 * dix-huit mille.
 */
const CATALOG_LANGUAGES: ReadonlySet<string> = new Set(SUPPORTED_LANGUAGE_CODES.map((code) => code.toLowerCase()));

const isCatalogLanguage = (language: string): boolean =>
  normalizeLanguageForDedup(language) === language && CATALOG_LANGUAGES.has(language);

/** La version du message que les appareils traduisent MAINTENANT — la seule dont une traduction est servie. */
const currentSourceVersion = (message: { readonly editedAt: Date | null }): string =>
  message.editedAt ? message.editedAt.toISOString() : ORIGINAL_SOURCE_VERSION;

/**
 * Éphémère, à vue unique ou flouté : une traduction partagée survivrait au
 * contenu qu'elle reprend, et ne serait jamais MOINS durable que lui. Le
 * chiffrement de bout en bout n'en est pas une — il choisit la dérivation.
 */
const isProtectedMessage = (message: MessageProtectionInput): boolean => {
  const { ephemeral, viewOnce, blurred } = messageProtection(message);
  return ephemeral || viewOnce || blurred;
};

/** Les colonnes de `SharedTranslation` que le fil sert. */
type SharedTranslationRow = {
  readonly id: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly targetLanguage: string;
  readonly kdf: string;
  readonly payload: string;
  readonly sharedById: string;
  readonly createdAt: Date;
};

/**
 * Le SEUL sérialiseur : le REST (`POST`, `GET`) et l'événement temps réel servent
 * exactement cette forme. `null` quand la ligne porte une dérivation que le
 * contrat ne connaît pas — la colonne est une chaîne, et une ligne qu'on ne sait
 * pas décrire ne se sert pas.
 */
export function serializeSharedTranslation(row: SharedTranslationRow): SharedTranslation | null {
  const kdf = SHARED_TRANSLATION_KDFS.find((known) => known === row.kdf);
  if (!kdf) return null;
  return {
    id: row.id,
    conversationId: row.conversationId,
    messageId: row.messageId,
    targetLanguage: row.targetLanguage,
    envelope: { v: 1, alg: SHARED_TRANSLATION_ALGORITHM, kdf, payload: row.payload },
    sharedBy: row.sharedById,
    sharedAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

type SharedTranslationDraft = Omit<SharedTranslationRow, 'id' | 'createdAt'> & { readonly sourceVersion: string };

/** Créer, et relire sur une violation d'unicité — jamais lire avant d'écrire (voir l'en-tête). */
async function placeSharedTranslation(
  prisma: PrismaClient,
  draft: SharedTranslationDraft,
): Promise<{ readonly row: SharedTranslationRow; readonly created: boolean }> {
  try {
    return { row: await prisma.sharedTranslation.create({ data: draft }), created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await prisma.sharedTranslation.findUnique({
      where: {
        messageId_targetLanguage_sourceVersion: {
          messageId: draft.messageId,
          targetLanguage: draft.targetLanguage,
          sourceVersion: draft.sourceVersion,
        },
      },
    });
    if (!existing) throw error;
    return { row: existing, created: false };
  }
}

/**
 * Best-effort : la ligne est rangée, le `GET` la sert. Même audience que celle
 * dont `deliverTextTranslation` livre la traduction d'un message par le serveur.
 */
async function broadcastSharedTranslation(params: {
  readonly io: ServerEmitIO | null | undefined;
  readonly prisma: PrismaClient;
  readonly conversationId: string;
  readonly messageCreatedAt: Date;
  readonly sharedTranslation: SharedTranslation;
  readonly now: Date;
}): Promise<void> {
  const { io, prisma, conversationId, messageCreatedAt, sharedTranslation, now } = params;
  if (!io) return;
  try {
    const readers = await translationReaders(prisma, conversationId, messageCreatedAt, now);
    if (readers.kind === 'room') {
      io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED, sharedTranslation);
      return;
    }
    if (readers.rooms.length === 0) return;
    io.to([...readers.rooms]).emit(SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED, sharedTranslation);
  } catch (error) {
    logger.warn('shared translation broadcast failed (best-effort)', {
      conversationId,
      messageId: sharedTranslation.messageId,
      error,
    });
  }
}

const sharedTranslationResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    conversationId: { type: 'string' },
    messageId: { type: 'string' },
    targetLanguage: { type: 'string' },
    envelope: shareTranslationBodyJsonSchema.properties.envelope,
    sharedBy: { type: 'string' },
    sharedAt: { type: 'string' },
  },
} as const;

const shareResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: { sharedTranslation: sharedTranslationResponseSchema, created: { type: 'boolean' } },
    },
  },
} as const;

const listResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: { sharedTranslations: { type: 'array', items: sharedTranslationResponseSchema } },
    },
  },
} as const;

const conversationParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', description: 'Conversation ID or identifier' } },
} as const;

/** Les langues demandées, normalisées comme les clés stockées — `[]` quand le filtre est absent ou vide. */
const requestedLanguages = (languages: readonly string[] | undefined): readonly string[] => [
  ...new Set((languages ?? []).map(normalizeLanguageForDedup)),
];

/** La première partagée d'abord : un ordre stable, que le contrôle de version de la réponse peut reconnaître. */
const byFirstShared = (a: SharedTranslationRow, b: SharedTranslationRow): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

const sameSlot = (a: SharedTranslationRow, b: SharedTranslationRow): boolean =>
  a.messageId === b.messageId && a.targetLanguage === b.targetLanguage;

/**
 * UNE traduction par message et par langue, la PREMIÈRE partagée. L'index unique
 * l'impose à l'écriture, mais Prisma ne le crée pas sur MongoDB : il se pose à la
 * main, et une passerelle peut servir avant qu'il le soit — deux partages
 * simultanés seraient alors rangés tous deux. La lecture tient la même loi, donc
 * un client ne reçoit jamais deux traductions concurrentes d'un même message.
 * La lecture est bornée (800 lignes) : la comparaison deux à deux ne coûte rien.
 */
const firstSharedPerSlot = (sorted: readonly SharedTranslationRow[]): readonly SharedTranslationRow[] =>
  sorted.filter((row, index) => sorted.findIndex((other) => sameSlot(other, row)) === index);

export function registerSharedTranslationRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  participantAuth: unknown,
  options: SharedTranslationRouteOptions = {},
) {
  const now = options.now ?? (() => new Date());

  fastify.post<{
    Params: { id: string };
    Body: unknown;
  }>('/conversations/:id/shared-translations', {
    schema: {
      description: 'Traduction partagée (#9899) : un membre partage aux autres la traduction qu’il a faite sur son appareil, scellée — le premier partage gagne',
      tags: ['conversations', 'messages'],
      summary: 'Share the translation of a message with the other members',
      params: conversationParams,
      body: shareTranslationBodyJsonSchema,
      response: {
        200: shareResponseSchema,
        201: shareResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        422: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    preValidation: [participantAuth as never],
  }, async (request, reply) => {
    try {
      const body = shareTranslationBodySchema.safeParse(request.body);
      if (!body.success) {
        return sendBadRequest(reply, 'Invalid shared translation');
      }
      const { messageId, targetLanguage, envelope } = body.data;

      const conversationId = await resolveConversationId(prisma, request.params.id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const authContext = (request as UnifiedAuthRequest).authContext;
      const caller = await resolveCallerParticipant(prisma, authContext, conversationId);
      const reader = historyReaderFromAuthContext(authContext);
      if (!caller || !reader) {
        return sendForbidden(reply, 'Not a participant');
      }

      const [message, conversation] = await Promise.all([
        prisma.message.findUnique({ where: { id: messageId }, select: SHARED_TRANSLATION_MESSAGE_SELECT }),
        prisma.conversation.findUnique({ where: { id: conversationId }, select: { encryptionMode: true } }),
      ]);
      if (!conversation) {
        return sendNotFound(reply, 'Conversation not found');
      }
      if (!message || message.conversationId !== conversationId) {
        return sendNotFound(reply, 'Message not found');
      }

      const mayRead = await readerMayReadMessage(prisma, {
        reader,
        message,
        now: now(),
        whenHidingUnreadable: 'refuse',
      });
      if (!mayRead) {
        return sendNotFound(reply, 'Message not found');
      }

      if (isProtectedMessage(message)) {
        return sendError(reply, 422, 'A protected message cannot carry a shared translation', {
          code: SHARED_TRANSLATION_ERROR_CODES.protectedMessage,
        });
      }

      if (!isCatalogLanguage(targetLanguage)) {
        return sendBadRequest(reply, 'Target language must be a normalized language code of the catalog', {
          code: SHARED_TRANSLATION_ERROR_CODES.unnormalizedLanguage,
        });
      }

      if (normalizeLanguageForDedup(message.originalLanguage ?? '') === targetLanguage) {
        return sendError(reply, 422, 'The target language is the language of the message', {
          code: SHARED_TRANSLATION_ERROR_CODES.sameLanguage,
        });
      }

      const accepted = acceptedSharedTranslationKdfs({
        conversationEncryptionMode: conversation.encryptionMode,
        messageEncryptionMode: message.encryptionMode,
      });
      if (!accepted.includes(envelope.kdf)) {
        return sendError(reply, 422, 'This key derivation is refused for an end-to-end encrypted message', {
          code: SHARED_TRANSLATION_ERROR_CODES.kdfRefused,
        });
      }

      const placed = await placeSharedTranslation(prisma, {
        conversationId,
        messageId: message.id,
        targetLanguage,
        sourceVersion: currentSourceVersion(message),
        kdf: envelope.kdf,
        payload: envelope.payload,
        sharedById: caller.id,
      });
      const sharedTranslation = serializeSharedTranslation(placed.row);
      if (!sharedTranslation) {
        throw new Error(`Shared translation ${placed.row.id} carries an unknown key derivation`);
      }

      if (placed.created) {
        await broadcastSharedTranslation({
          io: fastify.socketIOHandler?.getManager()?.getIO(),
          prisma,
          conversationId,
          messageCreatedAt: message.createdAt,
          sharedTranslation,
          now: now(),
        });
      }

      return sendSuccess(reply, { sharedTranslation, created: placed.created }, { statusCode: placed.created ? 201 : 200 });
    } catch (error) {
      logger.error('Error sharing a translation', error);
      return sendInternalError(reply, 'Error sharing a translation');
    }
  });

  fastify.get<{
    Params: { id: string };
    Querystring: { messageIds: string; languages?: string };
  }>('/conversations/:id/shared-translations', {
    schema: {
      description: 'Traductions partagées (#9899) : celles de la version courante des messages demandés, scellées — seuls les messages que l’appelant lit',
      tags: ['conversations', 'messages'],
      summary: 'List the translations shared by members for some messages',
      params: conversationParams,
      querystring: {
        type: 'object',
        required: ['messageIds'],
        properties: {
          messageIds: {
            type: 'string',
            description: `Message ids, comma-separated (1 to ${SHARED_TRANSLATION_LIMITS.messageIdsMaxCount})`,
          },
          languages: {
            type: 'string',
            description: `Target languages to serve, comma-separated (at most ${SHARED_TRANSLATION_LIMITS.languagesMaxCount}); all when absent or empty`,
          },
        },
      },
      response: {
        200: listResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    preValidation: [participantAuth as never],
  }, async (request, reply) => {
    try {
      const query = sharedTranslationsQuerySchema.safeParse(request.query);
      if (!query.success) {
        return sendBadRequest(reply, 'Invalid shared translations query');
      }

      const conversationId = await resolveConversationId(prisma, request.params.id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const authContext = (request as UnifiedAuthRequest).authContext;
      const caller = await resolveCallerParticipant(prisma, authContext, conversationId);
      const reader = historyReaderFromAuthContext(authContext);
      if (!caller || !reader) {
        return sendForbidden(reply, 'Not a participant');
      }

      const messages = await prisma.message.findMany({
        where: { id: { in: [...query.data.messageIds] }, conversationId },
        select: SHARED_TRANSLATION_MESSAGE_SELECT,
        take: SHARED_TRANSLATION_LIMITS.messageIdsMaxCount,
      });
      const unprotected = messages.filter((message) => !isProtectedMessage(message));
      const readable = await readerMayReadMessages(prisma, {
        reader,
        conversationId,
        messages: unprotected,
        now: now(),
        whenHidingUnreadable: 'refuse',
      });
      const served = unprotected.filter((message) => readable.has(message.id));
      if (served.length === 0) {
        return sendSuccess(reply, { sharedTranslations: [] });
      }

      // Le filtre de langues et la version courante partent DANS la requête : une
      // enveloppe pèse jusqu'à 128 Kio, la lire pour l'écarter coûterait cher. La
      // clé stockée est normalisée par construction (le `POST` refuse le reste),
      // donc `in` sur les langues normalisées est exact. La borne ne coupe
      // jamais une demande filtrée (au plus 8 langues par message).
      const languages = requestedLanguages(query.data.languages);
      const rows = await prisma.sharedTranslation.findMany({
        where: {
          conversationId,
          OR: served.map((message) => ({ messageId: message.id, sourceVersion: currentSourceVersion(message) })),
          ...(languages.length > 0 ? { targetLanguage: { in: [...languages] } } : {}),
        },
        take: SHARED_TRANSLATION_LIMITS.messageIdsMaxCount * SHARED_TRANSLATION_LIMITS.languagesMaxCount,
      });

      const sharedTranslations = firstSharedPerSlot([...rows].sort(byFirstShared)).flatMap(
        (row) => serializeSharedTranslation(row) ?? [],
      );
      return sendSuccess(reply, { sharedTranslations });
    } catch (error) {
      logger.error('Error reading shared translations', error);
      return sendInternalError(reply, 'Error reading shared translations');
    }
  });
}

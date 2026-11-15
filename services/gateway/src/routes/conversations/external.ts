/**
 * `POST /conversations/external` (#17117, chantier #17007) : ouvrir, ou
 * rouvrir, une conversation avec un ami d'un réseau tiers désigné par son
 * numéro E.164. La conversation naît chiffrée de bout en bout
 * (`openExternalConversation`).
 *
 * Aucun schéma JSON de corps : sous la configuration AJV de Fastify
 * (`removeAdditional: true`), un champ en trop (`name`) serait RETIRÉ en
 * silence ; le schéma Zod strict le refuse, et c'est ce qu'une frontière doit
 * faire. Aucune réponse ni aucun journal ne recopie ce qui a été soumis : une
 * erreur de base peut porter le numéro dans son message, seul son code est
 * journalisé.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  EXTERNAL_CONVERSATION_ERROR_CODES,
  EXTERNAL_CONVERSATION_OPENINGS_PER_HOUR,
  EXTERNAL_CONVERSATION_TYPE,
} from '@meeshy/shared/types/external-conversation';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';
import { logError } from '../../utils/logger';
import { externalConversationsEnabled } from '../../services/external-conversation/external-conversation-flag';
import { externalPeerRetentionDays } from '../../services/external-conversation/peer-retention';
import {
  externalConversationRequestSchema,
  openExternalConversation,
  type ExternalConversationOpening,
  type ExternalConversationRefusal,
} from '../../services/external-conversation/open-external-conversation';
import { nascentRegimeDeps, type NascentRegimeDeps } from '../../services/conversations/creationRegime';
import { sendBadRequest, sendError, sendForbidden, sendInternalError, sendSuccess, sendUnauthorized } from '../../utils/response';

export type ExternalConversationRouteOptions = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly regime?: NascentRegimeDeps;
};

const DISABLED_MESSAGE = 'Writing to a friend on another network is not available yet';
const INVALID_MESSAGE = 'Expected a supported network and a phone number in international format (E.164)';

/** Le refus servi pour chaque refus du service : statut, code stable, message lisible par un ancien client. */
const REFUSALS: Readonly<Record<ExternalConversationRefusal, { readonly status: number; readonly code: string; readonly message: string }>> = {
  'phone-unverified': {
    status: 403,
    code: EXTERNAL_CONVERSATION_ERROR_CODES.PHONE_UNVERIFIED,
    message: 'Verify your phone number to write to a friend on another network',
  },
  'end-to-end-reserved': {
    status: 403,
    code: EXTERNAL_CONVERSATION_ERROR_CODES.END_TO_END_RESERVED,
    message: 'End-to-end encrypted conversations are not available to your account yet',
  },
  'consent-required': {
    status: 403,
    code: EXTERNAL_CONVERSATION_ERROR_CODES.CONSENT_REQUIRED,
    message: 'Read what is shared with the other network and give your consent first',
  },
  'limit-reached': {
    status: 409,
    code: EXTERNAL_CONVERSATION_ERROR_CODES.LIMIT_REACHED,
    message: 'Close a conversation with a friend on another network before opening a new one',
  },
};

/**
 * Le débit PAR COMPTE (audit adversarial du 2026-11-10) : le limiteur global
 * compte par adresse IP ; celui-ci borne ce qu'un compte peut demander, ouvertures
 * neuves comme réouvertures. Compté après l'authentification (`preHandler`), et
 * fermé si le compteur tombe.
 */
const openingRateLimit = {
  max: EXTERNAL_CONVERSATION_OPENINGS_PER_HOUR,
  timeWindow: '1 hour',
  hook: 'preHandler' as const,
  skipOnError: false,
  keyGenerator: (request: FastifyRequest) =>
    `external-conversation:open:${(request as UnifiedAuthRequest).authContext?.registeredUser?.id ?? `ip:${request.ip}`}`,
  errorResponseBuilder: () => ({ success: false, error: 'Too many conversations opened. Try again later.', statusCode: 429 }),
};

/** Ce qu'une erreur inattendue laisse au journal : son nom et son code, jamais son message. */
const errorTrace = (error: unknown): { readonly name: string; readonly code: string | null } => ({
  name: error instanceof Error ? error.name : typeof error,
  code: typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : null,
});

/** La réponse d'ouverture, FERMÉE : rien de ce que le service rendrait en plus (l'adresse du pair) ne part. */
const openingResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['success', 'data'],
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['conversationId', 'type', 'encryptionMode', 'network', 'created'],
      properties: {
        conversationId: { type: 'string' },
        type: { type: 'string', enum: [EXTERNAL_CONVERSATION_TYPE] },
        encryptionMode: { type: 'string', enum: ['e2ee'] },
        network: { type: 'string' },
        created: { type: 'boolean' },
      },
    },
  },
} as const;

const errorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  409: errorResponseSchema,
  429: errorResponseSchema,
  500: errorResponseSchema,
} as const;

const sendOpening = (reply: FastifyReply, opening: Extract<ExternalConversationOpening, { kind: 'opened' }>, network: string) =>
  sendSuccess(
    reply,
    {
      conversationId: opening.conversationId,
      type: EXTERNAL_CONVERSATION_TYPE,
      encryptionMode: 'e2ee',
      network,
      created: opening.created,
    },
    { statusCode: opening.created ? 201 : 200 },
  );

export function registerExternalConversationRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: preHandlerHookHandler,
  options: ExternalConversationRouteOptions = {},
): void {
  const env = options.env ?? process.env;
  const regime = options.regime ?? nascentRegimeDeps(prisma);

  fastify.post(
    '/conversations/external',
    {
      preValidation: [requiredAuth],
      config: { rateLimit: openingRateLimit },
      schema: {
        description: 'Open (or reopen) an end-to-end encrypted conversation with a friend on another network, addressed by phone number',
        tags: ['conversations'],
        summary: 'Open an external conversation',
        response: { 200: openingResponseSchema, 201: openingResponseSchema, ...errorResponses },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!externalConversationsEnabled(env)) {
        return sendForbidden(reply, DISABLED_MESSAGE, { code: EXTERNAL_CONVERSATION_ERROR_CODES.DISABLED });
      }
      const userId = (request as UnifiedAuthRequest).authContext?.registeredUser?.id;
      if (!userId) {
        return sendUnauthorized(reply, 'An account is required to write to a friend on another network', { code: AUTH_ERROR_CODES.UNAUTHORIZED });
      }

      const parsed = externalConversationRequestSchema.safeParse(request.body);
      if (!parsed.success) return sendBadRequest(reply, INVALID_MESSAGE, { code: EXTERNAL_CONVERSATION_ERROR_CODES.INVALID });

      try {
        const opening = await openExternalConversation(
          { prisma, regime, retentionDays: externalPeerRetentionDays(env) },
          { userId, ...parsed.data },
        );
        if (opening.kind === 'refused') {
          const refusal = REFUSALS[opening.refusal];
          return sendError(reply, refusal.status, refusal.message, { code: refusal.code });
        }
        return sendOpening(reply, opening, parsed.data.network);
      } catch (error) {
        logError(fastify.log, 'external conversation opening failed', JSON.stringify(errorTrace(error)));
        return sendInternalError(reply);
      }
    },
  );
}


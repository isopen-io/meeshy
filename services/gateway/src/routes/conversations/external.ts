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
  EXTERNAL_CONVERSATION_TYPE,
} from '@meeshy/shared/types/external-conversation';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { externalConversationsEnabled } from '../../services/external-conversation/external-conversation-flag';
import {
  externalConversationRequestSchema,
  openExternalConversation,
  type ExternalConversationOpening,
} from '../../services/external-conversation/open-external-conversation';
import { nascentRegimeDeps, type NascentRegimeDeps } from '../../services/conversations/creationRegime';
import { sendBadRequest, sendForbidden, sendInternalError, sendSuccess, sendUnauthorized } from '../../utils/response';

export type ExternalConversationRouteOptions = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly regime?: NascentRegimeDeps;
};

const DISABLED_MESSAGE = 'Writing to a friend on another network is not available yet';
const INVALID_MESSAGE = 'Expected a supported network and a phone number in international format (E.164)';
const PHONE_UNVERIFIED_MESSAGE = 'Verify your phone number to write to a friend on another network';

/** Ce qu'une erreur inattendue laisse au journal : son nom et son code, jamais son message. */
const errorTrace = (error: unknown): { readonly name: string; readonly code: string | null } => ({
  name: error instanceof Error ? error.name : typeof error,
  code: typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : null,
});

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
      schema: {
        description: 'Open (or reopen) an end-to-end encrypted conversation with a friend on another network, addressed by phone number',
        tags: ['conversations'],
        summary: 'Open an external conversation',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!externalConversationsEnabled(env)) {
        return sendForbidden(reply, DISABLED_MESSAGE, { code: EXTERNAL_CONVERSATION_ERROR_CODES.DISABLED });
      }
      const userId = (request as UnifiedAuthRequest).authContext?.registeredUser?.id;
      if (!userId) return sendUnauthorized(reply, 'An account is required to write to a friend on another network');

      const parsed = externalConversationRequestSchema.safeParse(request.body);
      if (!parsed.success) return sendBadRequest(reply, INVALID_MESSAGE, { code: EXTERNAL_CONVERSATION_ERROR_CODES.INVALID });

      try {
        const opening = await openExternalConversation({ prisma, regime }, { userId, ...parsed.data });
        if (opening.kind === 'refused') {
          return sendForbidden(reply, PHONE_UNVERIFIED_MESSAGE, { code: EXTERNAL_CONVERSATION_ERROR_CODES.PHONE_UNVERIFIED });
        }
        return sendOpening(reply, opening, parsed.data.network);
      } catch (error) {
        fastify.log.error({ externalConversation: errorTrace(error) }, 'external conversation opening failed');
        return sendInternalError(reply);
      }
    },
  );
}


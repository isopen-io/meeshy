import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

/**
 * Les schémas de deux routes de `routes/user-deletions.ts`, extraits pour
 * tenir ce fichier sous son budget de taille (#10443).
 */

/** `POST …/conversations/:conversationId/restore-for-me`. */
export const restoreConversationForMeSchema = {
  description: 'Restore a previously deleted conversation to the authenticated user\'s view. Only works if the conversation was previously deleted by the user AND the conversation itself was not closed for everyone in the process.',
  tags: ['users', 'conversations'],
  summary: 'Restore deleted conversation',
  params: {
    type: 'object',
    required: ['conversationId'],
    properties: {
      conversationId: { type: 'string', description: 'Conversation ID to restore' }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Conversation restored' }
          }
        }
      }
    },
    400: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    500: errorResponseSchema
  }
} as const;

/** `GET …/user/deleted-conversations`. */
export const deletedConversationsSchema = {
  description: 'Get a list of all conversations the authenticated user has deleted from their view. Returns conversation details and deletion timestamps. These conversations can be restored.',
  tags: ['users', 'conversations'],
  summary: 'Get user deleted conversations',
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              conversationId: { type: 'string', description: 'Conversation ID' },
              conversation: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  identifier: { type: 'string' },
                  title: { type: 'string', nullable: true },
                  type: { type: 'string', enum: ['direct', 'group'] },
                  avatar: { type: 'string', nullable: true },
                  lastMessageAt: { type: 'string', format: 'date-time', nullable: true }
                }
              },
              deletedAt: { type: 'string', format: 'date-time', nullable: true, description: 'When the user deleted this conversation' }
            }
          }
        }
      }
    },
    500: errorResponseSchema
  }
} as const;

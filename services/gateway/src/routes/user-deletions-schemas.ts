import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

/**
 * Le schéma d'une route de `routes/user-deletions.ts`, extrait pour
 * tenir ce fichier sous son budget de taille (#10443).
 */

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

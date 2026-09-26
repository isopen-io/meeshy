/**
 * Schéma de réponse de la carte de conversation (#8099) — la forme JSON de
 * `types/conversation-card.ts`. `additionalProperties: false` partout :
 * fast-json-stringify ne sert que ce qui est déclaré, rien ne part à côté.
 */

export const conversationCardSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'conversationId', 'title', 'description', 'avatarUrl', 'bannerUrl', 'conversationType', 'stats', 'viewer', 'link'],
  properties: {
    kind: { type: 'string', enum: ['share-link', 'direct'] },
    conversationId: { type: 'string', nullable: true, description: 'null pour un non-membre sur lien de partage' },
    title: { type: 'string' },
    description: { type: 'string', nullable: true, description: '≤ 200 caractères ; null sur lien inactif' },
    avatarUrl: { type: 'string', nullable: true },
    bannerUrl: { type: 'string', nullable: true },
    conversationType: { type: 'string' },
    stats: {
      type: 'object',
      additionalProperties: false,
      required: ['memberCount', 'onlineCount', 'messageCount', 'languages'],
      properties: {
        memberCount: { type: 'integer' },
        onlineCount: { type: 'null', description: 'Toujours null (visibilité de la présence)' },
        messageCount: { type: 'integer', nullable: true, description: 'null sauf membre ou allowViewHistory' },
        languages: { type: 'array', items: { type: 'string' } }
      }
    },
    viewer: {
      type: 'object',
      additionalProperties: false,
      required: ['isMember', 'canJoin', 'requiresAccount'],
      properties: {
        isMember: { type: 'boolean' },
        canJoin: { type: 'boolean' },
        requiresAccount: { type: 'boolean' }
      }
    },
    link: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      required: ['identifier', 'isActive', 'expiresAt'],
      properties: {
        identifier: { type: 'string' },
        isActive: { type: 'boolean' },
        expiresAt: { type: 'string', nullable: true }
      }
    }
  }
} as const;

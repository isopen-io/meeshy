/**
 * Les schémas de réponse du favori de message (#7377) — FERMÉS à chaque
 * niveau (`additionalProperties: false`), chaque propriété NOMMÉE.
 *
 * C'est la règle 4 de `services/gateway/decisions.md` (§ « Le favori de
 * message ») : ce qui part à côté d'un champ gardé part parce qu'un schéma
 * l'a laissé passer. `fast-json-stringify` ne sert que ce qui est déclaré ici ;
 * la projection (`starredMessageProjection.ts`) reconstruit déjà chaque ligne
 * champ par champ, et ce schéma en est le second verrou.
 *
 * Miroir des schémas Zod partagés (`@meeshy/shared/types/message-star`), que
 * les clients utilisent pour décoder : un témoin vérifie que la réponse servie
 * les satisfait.
 */

export const starMessageParamsJsonSchema = {
  type: 'object',
  required: ['messageId'],
  properties: {
    messageId: { type: 'string', description: 'Message ID (ObjectId)' },
  },
} as const;

export const messageStarPlacedResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['messageId', 'conversationId', 'starred', 'starredAt'],
      properties: {
        messageId: { type: 'string' },
        conversationId: { type: 'string' },
        starred: { type: 'boolean' },
        starredAt: { type: 'string', format: 'date-time' },
      },
    },
  },
} as const;

export const messageStarRemovedResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['messageId', 'starred'],
      properties: {
        messageId: { type: 'string' },
        starred: { type: 'boolean' },
      },
    },
  },
} as const;

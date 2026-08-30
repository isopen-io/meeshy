/**
 * Schémas de réponse (littéraux JSON Schema) de la collection d'accusés —
 * extraits de `receipts.ts` pour tenir le budget de taille des fichiers de
 * `routes/` (directive 2026-08-28 ; cliquet #4284,
 * `__tests__/unit/routes/route-file-size-budget.test.ts`). DÉCLARÉS, sans quoi
 * fast-json-stringify supprime `data` (#4349). Aucune logique ici : des
 * littéraux de schéma, purs.
 *
 * `postReceiptsRouteSharedOptions` et `getReceiptsRouteSharedOptions` — qui
 * composent ces littéraux avec `createReceiptWriteRateLimitConfig()` — restent
 * dans `receipts.ts` : les en sortir créerait un import circulaire avec le
 * débit, que ce fichier-ci ne porte pas.
 */

import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

// ── Schémas de réponse — DÉCLARÉS, sans quoi fast-json-stringify supprime `data` ───
/** Chaîne NULLABLE — la forme qu'un `Date | null` prend une fois sérialisé. */
const nullableString = { type: 'string', nullable: true } as const;

/** L'enveloppe de succès, DÉCLARÉE : sans `data`, fast-json-stringify la supprime. */
export const served = (data: object) =>
  ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;

export const FAILURES = {
  400: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  500: errorResponseSchema,
} as const;

export const receiptOutcomeSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['read', 'received', 'delivered'] },
    markedCount: { type: 'number', description: 'Entrées RÉELLEMENT figées par cet appel' },
    unreadCount: { type: 'number', description: 'Badge du lecteur APRÈS marquage' },
  },
} as const;

export const receiptsPayloadSchema = {
  type: 'object',
  properties: {
    detail: { type: 'string', enum: ['summary', 'people'] },
    messageIds: { type: 'array', items: { type: 'string' } },
    summary: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          totalMembers: { type: 'number' },
          receivedCount: { type: 'number' },
          readCount: { type: 'number' },
          deliveredToAllAt: nullableString,
          readByAllAt: nullableString,
        },
      },
    },
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          participantId: { type: 'string' },
          displayName: { type: 'string' },
          avatar: nullableString,
          deliveredAt: nullableString,
          receivedAt: nullableString,
          readAt: nullableString,
          readDevice: nullableString,
        },
      },
    },
    pagination: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        hasMore: { type: 'boolean' },
        nextCursor: nullableString,
      },
    },
  },
} as const;

export const conversationIdParamsSchema = {
  type: 'object',
  required: ['conversationId'],
  properties: { conversationId: { type: 'string', description: 'Conversation ID or identifier' } },
} as const;

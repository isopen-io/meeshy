/**
 * Schémas d’API — enveloppes de réponse des conversations et de leurs messages.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/conversation-response
 */

import { conversationMinimalSchema, conversationParticipantSchema, conversationSchema } from './conversation.js';
import { messageSchema } from './message.js';
import { userMinimalSchema } from './user.js';

// =============================================================================
// CONVERSATION RESPONSE SCHEMAS
// =============================================================================

/**
 * Conversation list response schema
 * Route sends: { success, data: [...conversations], pagination: { limit, offset, total, hasMore } }
 */
export const conversationListResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'array',
      items: conversationMinimalSchema
    },
    pagination: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of items per page' },
        offset: { type: 'number', description: 'Number of items skipped' },
        total: { type: 'number', description: 'Total number of conversations' },
        hasMore: { type: 'boolean', description: 'More conversations available' }
      }
    },
    // CRITICAL: cursorPagination MUST be declared here. fast-json-stringify
    // (Fastify's response serializer) STRIPS any field not present in the
    // schema, so without this the gateway's `cursorPagination` block was
    // silently dropped on the wire — the iOS SDK received `nextCursor: null`,
    // never advanced the cursor, and `loadMore()` looped forever requesting
    // page 1 (~100 GET /conversations?limit=30 per cold start). Same root
    // cause as the historical `data.conversation` strip bug documented
    // below for `conversationResponseSchema`.
    cursorPagination: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Page size requested' },
        hasMore: { type: 'boolean', description: 'More conversations available beyond this cursor' },
        nextCursor: { type: ['string', 'null'], description: 'Opaque cursor (last conversation id) for the next page; null when exhausted' }
      }
    },
    // Présent UNIQUEMENT sur une page delta (`updatedSince`). Le delta est
    // upsert-only : une conversation fermée, quittée, supprimée-pour-moi depuis
    // un autre appareil ou dont l'utilisateur a été banni ne revient dans
    // AUCUNE réponse, donc rien ne la retire du cache client avant la
    // réconciliation complète (24 h sur iOS comme sur le web). Ces deux champs
    // sont le canal de sortie — symétrique de `meta.deletedStoryIds` sur le
    // tray stories. Même piège que `cursorPagination` ci-dessus : non déclarés
    // ici, `fast-json-stringify` les retire du fil en silence.
    meta: {
      type: 'object',
      properties: {
        deletedConversationIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Conversations that LEFT this user\'s view since `updatedSince` (closed, left, banned, deleted-for-me). Delta pages only.'
        },
        deletedConversationIdsTruncated: {
          type: 'boolean',
          description: 'The tombstone list is incomplete — the client must reconcile the full list.'
        }
      }
    }
  }
} as const;

/**
 * Single conversation response schema.
 *
 * `data` is the **flat** conversation object — NOT wrapped under
 * `data.conversation`. This matches:
 *   - what the handlers actually return (`sendSuccess(reply, { ...conversation })`
 *     in `routes/conversations/core.ts` for both `GET /:id` and `POST /conversations`)
 *   - what the iOS / web clients decode (`APIResponse<APIConversation>`,
 *     iOS `ConversationService.getById` reads `response.data.id` directly)
 *   - the convention used by `conversationListResponseSchema` above (data
 *     is the array directly, no `data.conversations` wrapper).
 *
 * Historical bug : the previous version declared
 * `data: { properties: { conversation: conversationSchema } }`. Fastify's
 * `fast-json-stringify` strips fields not in the schema, so the actual
 * wire response was effectively `{ success: true, data: {} }` (the handler
 * returned a flat conversation, but the schema kept only the
 * `data.conversation` key which the handler never set). iOS failed to
 * decode with `Key 'id' not found at path data`. The bug was masked for
 * conversations already in the local cache (the cache hit short-circuits
 * the network call) and only surfaced when tapping a notification for a
 * brand-new conversation forced the network fallback.
 */
export const conversationResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: conversationSchema
  }
} as const;

/**
 * Message list response schema
 */
export const messageListResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: messageSchema
        },
        totalCount: { type: 'number', description: 'Total number of messages' },
        hasMore: { type: 'boolean', description: 'More messages available' }
      }
    }
  }
} as const;

/**
 * Single message response schema — l'enveloppe d'un message SERVI SEUL
 * (édition REST, notamment).
 *
 * `data` EST le message. Ce schéma a longtemps déclaré `data.message`, un
 * enveloppement qu'aucun gestionnaire n'a jamais produit — tous font
 * `sendSuccess(reply, messageResponse)` — et qu'aucun client n'a jamais lu :
 * iOS décode `APIResponse<APIMessage>`, Android `ApiResponse<ApiMessage>`,
 * et pour les deux `data` est le message.
 *
 * Une clé déclarée mais absente ne dégrade pas la réponse, elle l'EMPORTE :
 * `fast-json-stringify` applique `additionalProperties: false` par défaut, donc
 * `data` sortait `{}`. Le défaut est resté invisible ici tant que ce schéma
 * était mort — il vivait par COPIE, inline, dans les deux routes d'édition.
 */
export const messageResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: messageSchema
  }
} as const;

/**
 * Participants list response schema
 */
export const participantsListResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        participants: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ...conversationParticipantSchema.properties,
              user: userMinimalSchema
            }
          }
        },
        totalCount: { type: 'number', description: 'Total number of participants' }
      }
    }
  }
} as const;

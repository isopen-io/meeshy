/**
 * Schémas d’API — réactions et mentions.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/reaction
 */

import { EMOJI_MAX_LENGTH } from '../reaction.js';
import { userMinimalSchema } from './user.js';

// =============================================================================
// REACTION SCHEMAS
// =============================================================================

/**
 * Reaction schema for API responses
 */
export const reactionSchema = {
  type: 'object',
  description: 'Emoji reaction on a message',
  properties: {
    id: { type: 'string', description: 'Reaction unique identifier' },
    messageId: { type: 'string', description: 'Message ID' },
    userId: { type: 'string', nullable: true, description: 'User ID (null for anonymous)' },
    participantId: { type: 'string', nullable: true, description: 'Participant ID' },
    emoji: { type: 'string', description: 'Emoji character' },
    createdAt: { type: 'string', format: 'date-time', description: 'Reaction timestamp' },
    user: { ...userMinimalSchema, nullable: true, description: 'User info if authenticated' }
  }
} as const;

/**
 * Reaction summary schema (grouped by emoji)
 *
 * `users[].participantId` est l'identité STABLE d'un réacteur, et `userId` son
 * `User.id` quand il en a un (#19996).
 *
 * Ce schéma déclarait `userId` SEUL, quand son unique producteur
 * (`ReactionService.getMessageReactions`) pose un `participantId` : comme
 * `fast-json-stringify` applique `additionalProperties: false` par défaut, il
 * supprimait la clé servie et ne fabriquait pas celle déclarée — **aucune
 * identité ne franchissait le sérialiseur**. iOS et Android déclarant tous deux
 * `userId` non optionnel, la réponse ENTIÈRE échouait à se décoder chez eux
 * (le web, en lecture tolérante de `username`/`avatar` seuls, ne voyait rien).
 *
 * Les deux clés sont déclarées parce qu'elles ne disent pas la même chose, et
 * qu'aucune ne remplace l'autre :
 *
 *   - `participantId` est TOUJOURS servi — c'est la colonne que `Reaction` porte
 *     (`Reaction.participantId`), et la seule identité qu'un invité de lien ait.
 *   - `userId` est NULLABLE, et ne sort que pour un réacteur inscrit.
 *     `Participant.userId` est nul pour un invité de lien, et le `CLAUDE.md` de
 *     la passerelle l'interdit explicitement : « Ne jamais recopier
 *     `participantId` tel quel dans un champ de payload nommé `userId` : ces
 *     champs déclarent un `User.id` ». Un repli `userId: userId ?? participantId`
 *     servirait donc un id de la mauvaise ESPÈCE sous un nom qui promet l'autre.
 *
 * `userIds` a été RETIRÉ : il était déclaré ici et **aucun producteur du dépôt
 * ne le composait** (l'agrégation ne tient que `participantIds`), ni aucun
 * client ne le lisait. Le déclarer n'avait aucun effet — une clé déclarée mais
 * absente de la charge n'est jamais fabriquée — et le garder entretenait la
 * fiction d'un champ servi. `participantIds`, lui, est bien produit et reste.
 */
export const reactionSummarySchema = {
  type: 'object',
  description: 'Reaction summary grouped by emoji',
  properties: {
    emoji: { type: 'string', description: 'Emoji character' },
    count: { type: 'number', description: 'Number of reactions with this emoji' },
    hasCurrentUser: { type: 'boolean', description: 'Whether current user reacted with this emoji' },
    participantIds: { type: 'array', items: { type: 'string' }, description: 'Participant IDs who reacted' },
    users: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          participantId: { type: 'string', description: 'Participant ID of the reactor — always served, the stable identity' },
          userId: { type: 'string', nullable: true, description: 'User ID of the reactor — null for a share-link guest, who has no User row' },
          username: { type: 'string', description: 'Username or display name' },
          avatar: { type: 'string', nullable: true, description: 'Avatar URL' },
          createdAt: { type: 'string', description: 'Reaction timestamp' }
        }
      },
      description: 'Users who reacted with details'
    }
  }
} as const;

/**
 * Add reaction request schema
 */
export const addReactionRequestSchema = {
  type: 'object',
  required: ['emoji'],
  properties: {
    emoji: {
      type: 'string',
      minLength: 1,
      maxLength: EMOJI_MAX_LENGTH,
      description: 'Emoji to add as reaction'
    }
  }
} as const;

// =============================================================================
// MENTION SCHEMAS
// =============================================================================

/**
 * Mention schema for API responses
 */
export const mentionSchema = {
  type: 'object',
  description: 'User mention in a message',
  properties: {
    id: { type: 'string', description: 'Mention unique identifier' },
    messageId: { type: 'string', description: 'Message ID' },
    mentionedUserId: { type: 'string', description: 'Mentioned user ID' },
    mentionedAt: { type: 'string', format: 'date-time', description: 'Mention timestamp' },
    mentionedUser: { ...userMinimalSchema, description: 'Mentioned user info' }
  }
} as const;

import { messageAttachmentMinimalSchema, messageAttachmentSchema } from './api-schemas.js';

/**
 * LES SCHÉMAS DE RÉPONSE DES PIÈCES JOINTES — et pourquoi ils vivent à part.
 *
 * `api-schemas.ts` pèse près de 4 000 lignes, très au-delà du budget de
 * 800–1100 du `CLAUDE.md` racine, dont la règle est explicite : « ajouter à un
 * fichier déjà hors budget est interdit : on extrait d'abord, on ajoute
 * ensuite ». Le découper ENTIER est un lot à soi — des dizaines d'importateurs
 * dans trois services. Ce fichier est donc le premier morceau de ce découpage,
 * pris par RESPONSABILITÉ (les réponses qui servent une pièce jointe) et non
 * par tranche : c'est là que les prochains schémas d'attachment iront.
 *
 * Ce qu'il ne fait PAS : redéclarer une forme. `transcription` et `translations`
 * sont REPRISES de `messageAttachmentSchema`, seul endroit du dépôt où la forme
 * d'une transcription et celle d'une carte de traductions soient écrites. Deux
 * déclarations d'une même forme divergent au premier champ ajouté d'un seul
 * côté — et le champ manquant ne se voit alors que chez le client qui ne le
 * reçoit plus.
 */

/**
 * La GALERIE d'une conversation — `GET /conversations/:conversationId/attachments`.
 *
 * Elle part du schéma minimal et lui rend TROIS choses que la requête lisait
 * déjà en base (`AttachmentService.getConversationAttachments` les sélectionne)
 * et que `fast-json-stringify` retirait juste avant l'envoi — donc sans qu'aucun
 * signal ne le dise :
 *
 *   • `originalName` — le nom que l'utilisateur reconnaît, là où `fileName` est
 *     le nom de STOCKAGE ;
 *   • `createdAt` — l'ORDRE. Une galerie qui fusionne deux types (une puce
 *     « Fichiers » sert `document` ET `text`) ne peut pas les entrelacer sans
 *     lui, et la porte ne sert aucune pagination datée ;
 *   • `transcription` / `translations` — le PRISME. Sans elles, aucune surface
 *     ne pouvait servir la transcription d'un vocal dans la langue de son
 *     lecteur depuis cette porte : le manque était invisible, la requête ayant
 *     bien lu les données.
 *
 * > Un champ que le service LIT n'est pas un champ que le client REÇOIT. Le
 * > schéma de réponse est la dernière porte, et elle se ferme en silence.
 */
export const conversationAttachmentSchema = {
  type: 'object',
  description: 'Attachment served by a conversation gallery (list + transcription/translations)',
  properties: {
    ...messageAttachmentMinimalSchema.properties,
    originalName: { type: 'string', nullable: true, description: 'Original filename as uploaded' },
    createdAt: { type: 'string', format: 'date-time', description: 'Attachment creation timestamp' },
    transcription: messageAttachmentSchema.properties.transcription,
    translations: messageAttachmentSchema.properties.translations
  }
} as const;

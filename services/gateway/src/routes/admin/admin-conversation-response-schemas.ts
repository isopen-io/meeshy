/**
 * Les schémas de RÉPONSE des trois écritures souveraines sur une conversation
 * (`conversation-settings-sovereign.ts`, #7999).
 *
 * Chaque objet nomme ses `properties` : sous `fast-json-stringify`, un schéma
 * absent laisse partir tout ce que le gestionnaire remet — y compris ce que
 * personne n'a voulu exposer. Les champs déclarés ici sont ceux que
 * `serveConversationMetadata` PRODUIT ; un champ ajouté là sans être déclaré ici
 * disparaît au sérialiseur, et les témoins d'`app.inject()` le voient.
 */
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';

const chaine = { type: 'string' } as const;
const chaineNulle = { type: 'string', nullable: true } as const;
const dateNulle = { type: 'string', format: 'date-time', nullable: true } as const;
const booleen = { type: 'boolean' } as const;
const booleenNul = { type: 'boolean', nullable: true } as const;
const nombre = { type: 'number' } as const;

const enveloppe = (data: Record<string, unknown>) => ({
  type: 'object',
  properties: { success: booleen, message: chaine, data },
});

/**
 * `:userId` est un ObjectId, refusé en 400 AVANT tout gestionnaire : un
 * identifiant malformé n'atteint ni Prisma (qui lèverait, rendant un 500), ni
 * la garde de hiérarchie (qui le lirait comme une cible introuvable).
 */
export const userIdParams = {
  type: 'object',
  required: ['userId'],
  properties: { userId: { type: 'string', pattern: OBJECT_ID_PATTERN } },
} as const;

export const adminErrorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  500: errorResponseSchema,
};

const reglages = {
  type: 'object',
  properties: {
    defaultWriteRole: chaineNulle,
    isAnnouncementChannel: booleenNul,
    slowModeSeconds: { type: 'number', nullable: true },
    autoTranslateEnabled: booleenNul,
    encryptionMode: chaineNulle,
  },
} as const;

/** Ce que `serveConversationMetadata` rend — la ligne SANS participants. */
export const conversationMetadataSchema = {
  type: 'object',
  properties: {
    id: chaine,
    identifier: chaineNulle,
    title: chaineNulle,
    description: chaineNulle,
    type: chaineNulle,
    avatar: chaineNulle,
    banner: chaineNulle,
    isActive: booleenNul,
    closedAt: dateNulle,
    communityId: chaineNulle,
    createdAt: dateNulle,
    updatedAt: dateNulle,
    lastMessageAt: dateNulle,
    memberCount: nombre,
    messageCount: { type: 'number', nullable: true },
    settings: reglages,
  },
} as const;

export const conversationConfigurationSuccess = enveloppe(conversationMetadataSchema);

export const conversationMemberRoleSuccess = enveloppe({
  type: 'object',
  properties: { conversationId: chaine, userId: chaine, participantId: chaine, role: chaine },
});

export const conversationMemberRemovalSuccess = enveloppe({
  type: 'object',
  properties: { conversationId: chaine, userId: chaine, participantId: chaine, removed: booleen },
});

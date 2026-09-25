/**
 * Les schémas de RÉPONSE des portes ajoutées par #7845 à la fiche
 * d'administration d'un membre (préférences, statistiques, conversations,
 * configuration souveraine d'une conversation).
 *
 * Chaque objet nomme ses `properties` : sous `fast-json-stringify`, un schéma
 * absent laisse partir tout ce que le gestionnaire remet — y compris ce que
 * personne n'a voulu exposer — et un objet nu efface tout. Les champs déclarés
 * ici sont ceux que les gestionnaires PRODUISENT, relevés sur leurs `select` et
 * leurs projections (`serveConversationMetadata`, `servirCategorie`,
 * `computeAdminUserStats`) ; un champ ajouté là sans être déclaré ici
 * disparaît au sérialiseur, et les témoins d'`app.inject()` le voient.
 *
 * DEUX cartes sont ouvertes, et ce n'est pas un oubli : `values` d'une
 * catégorie de préférences et le `default` d'un champ. Une catégorie est un sac
 * de réglages HÉTÉROGÈNE dont les clés varient d'une catégorie à l'autre — la
 * forme juste d'`additionalProperties: true`, la même que
 * `me/preferences/preference-router-factory.ts`. Ce qui voyage à côté (les
 * clés stockées, la description des champs, la liste en lecture seule) est,
 * lui, fermé.
 */
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
import { ADMIN_REPORT_STAT_KEYS, ADMIN_STAT_KEYS } from '../../services/admin/admin-user-stats';

const chaine = { type: 'string' } as const;
const chaineNulle = { type: 'string', nullable: true } as const;
const date = { type: 'string', format: 'date-time' } as const;
const dateNulle = { type: 'string', format: 'date-time', nullable: true } as const;
const booleen = { type: 'boolean' } as const;
const booleenNul = { type: 'boolean', nullable: true } as const;
const nombre = { type: 'number' } as const;
const nombreNul = { type: 'number', nullable: true } as const;
const listeDeChaines = { type: 'array', items: chaine } as const;

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

export const adminErrorResponses = { 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 500: errorResponseSchema };

// ─── Préférences ────────────────────────────────────────────────────────────

const champDePreference = {
  type: 'object',
  properties: {
    type: chaine,
    enum: { type: 'array' },
    minimum: nombre,
    maximum: nombre,
    default: {},
  },
} as const;

const categorieDePreferences = {
  type: 'object',
  properties: {
    values: { type: 'object', additionalProperties: true },
    stored: listeDeChaines,
    fields: { type: 'object', additionalProperties: champDePreference },
    readOnly: listeDeChaines,
  },
} as const;

export const userPreferencesSuccess = enveloppe({
    type: 'object',
    properties: {
      userId: chaine,
      categories: { type: 'object', additionalProperties: categorieDePreferences },
    },
  });

export const userPreferenceWriteSuccess = enveloppe({
  type: 'object',
  properties: {
    category: chaine,
    values: { type: 'object', additionalProperties: true },
    stored: listeDeChaines,
  },
});

// ─── Statistiques ───────────────────────────────────────────────────────────

export const userStatsSuccess = enveloppe({
    type: 'object',
    properties: {
      userId: chaine,
      computedAt: date,
      counts: {
        type: 'object',
        properties: Object.fromEntries(
          ADMIN_STAT_KEYS.map((cle) => [cle, ADMIN_REPORT_STAT_KEYS.some((k) => k === cle) ? nombreNul : nombre])
        ),
      },
      languages: listeDeChaines,
      achievements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: chaine,
            name: chaine,
            description: chaine,
            icon: chaine,
            color: chaine,
            isUnlocked: booleen,
            progress: nombre,
            threshold: nombre,
            current: nombre,
          },
        },
      },
    },
  });

// ─── Conversations ──────────────────────────────────────────────────────────

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

const utilisateurApercu = {
  type: 'object',
  nullable: true,
  properties: { id: chaine, username: chaineNulle, displayName: chaineNulle, avatar: chaineNulle },
} as const;

/**
 * Superset des deux producteurs de `membership` : la lecture dédiée
 * (`MEMBERSHIP_SELECT`) et le repli sur l'aperçu de participants.
 */
const participation = {
  type: 'object',
  properties: {
    id: chaine,
    userId: chaineNulle,
    conversationId: chaineNulle,
    type: chaineNulle,
    displayName: chaineNulle,
    avatar: chaineNulle,
    role: chaineNulle,
    joinedAt: dateNulle,
    isActive: booleenNul,
    nickname: chaineNulle,
    user: utilisateurApercu,
  },
} as const;

export const userConversationsSuccess = {
    type: 'object',
    properties: {
      success: booleen,
      data: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ...conversationMetadataSchema.properties,
            participants: { type: 'array', items: participation },
            membership: { ...participation, nullable: true },
          },
        },
      },
      pagination: {
        type: 'object',
        properties: { total: nombre, limit: nombre, offset: nombre, hasMore: booleen },
      },
    },
  };

export const conversationConfigurationSuccess = enveloppe(conversationMetadataSchema);

export const conversationMemberRoleSuccess = enveloppe({
    type: 'object',
    properties: { conversationId: chaine, userId: chaine, participantId: chaine, role: chaine },
  });

export const conversationMemberRemovalSuccess = enveloppe({
    type: 'object',
    properties: { conversationId: chaine, userId: chaine, participantId: chaine, removed: booleen },
  });

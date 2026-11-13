/**
 * Le schéma de réponse de la section `relations` de `GET /me/export` (#14400).
 * La lecture vit dans `services/relations/relationExport.ts`.
 */
import { INTERACTION_KINDS } from '../../services/relations/relationExport';

const interactionCountsSchema = Object.fromEntries(
  INTERACTION_KINDS.map((kind) => [`${kind.charAt(0).toLowerCase()}${kind.slice(1)}`, { type: 'integer' }]),
);

/** Des `properties` NOMMÉES : chaque colonne que `exportRelations` sert, et elle seule. */
export const relationsExportSchema = {
  type: 'object',
  nullable: true,
  properties: {
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          grantedByMe: { type: 'string' },
          origin: { type: 'string' },
          createdAt: { type: 'string' },
          myTransitions: {
            type: 'array',
            items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, at: { type: 'string' } } },
          },
        },
      },
    },
    interactionDays: {
      type: 'array',
      items: { type: 'object', properties: { userId: { type: 'string' }, day: { type: 'string' }, ...interactionCountsSchema } },
    },
    consents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          listeningCategoryShared: { type: 'boolean' },
          listeningTitleShared: { type: 'boolean' },
          locationShared: { type: 'boolean' },
          locationHistoryShared: { type: 'boolean' },
          proximityShared: { type: 'boolean' },
          consentedAt: { type: 'string' },
          ghostAt: { type: 'string', nullable: true },
          proximityRadiusMeters: { type: 'integer', nullable: true },
          withdrawnAt: {
            type: 'object',
            properties: {
              listeningCategoryShared: { type: 'string', nullable: true },
              listeningTitleShared: { type: 'string', nullable: true },
              locationShared: { type: 'string', nullable: true },
              locationHistoryShared: { type: 'string', nullable: true },
              proximityShared: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
    bloodLocationGhostAt: { type: 'string', nullable: true },
    bloodLocationPoints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          latitude: { type: 'number', nullable: true },
          longitude: { type: 'number', nullable: true },
          accuracy: { type: 'number', nullable: true },
          recordedAt: { type: 'string' },
          expiresAt: { type: 'string' },
          hiddenFrom: { type: 'array', items: { type: 'string' } },
          excludedFromProximity: { type: 'boolean' },
        },
      },
    },
    bloodLocationConsultations: {
      type: 'array',
      items: { type: 'object', properties: { observerId: { type: 'string' }, observedId: { type: 'string' }, consultedAt: { type: 'string' } } },
    },
    hasMore: {
      type: 'object',
      properties: {
        links: { type: 'boolean' },
        interactionDays: { type: 'boolean' },
        consents: { type: 'boolean' },
        bloodLocationPoints: { type: 'boolean' },
        bloodLocationConsultations: { type: 'boolean' },
      },
    },
  },
} as const;

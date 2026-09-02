/**
 * Préférences utilisateur — montage.
 *
 * Ce fichier ne DÉCIDE plus rien sur les préférences : il monte. Ce qu'une
 * catégorie sait d'elle-même (son schéma, ses défauts, son rangement) vit dans
 * `preference-registry.ts` ; ce que les routes en font vit dans
 * `unified-routes.ts` et dans la factory.
 *
 * C'est le point du critère 2 de #4181, et il se lit ici à l'œil nu : **aucun
 * `*_PREFERENCE_DEFAULTS` n'est importé par ce fichier.** Il en importait sept,
 * et les recomposait avec sa PROPRE fonction de complétion — un second chemin
 * pour la règle « les défauts comblent les clés muettes ». Deux chemins, deux
 * vérités possibles : un défaut ajouté à une catégorie apparaissait au `GET` de
 * cette catégorie et manquait à l'agrégat. Un défaut ajouté aujourd'hui
 * traverse les deux sans qu'une ligne d'ici ne bouge.
 *
 * ## Les alias restent montés
 *
 * Les vingt-huit routes par catégorie sont en DOUBLE MONTAGE derrière les trois
 * routes unifiées, avec un en-tête `Deprecation` (critère 6). Elles ne partent
 * que lorsque le compteur d'accès par route sera tombé à zéro sur deux versions
 * publiées de CHAQUE client — iOS (`PreferenceService`, et le chemin outbox qui
 * porte des mutations écrites hors ligne), web (une dizaine de sites) et
 * Android (`PreferencesApi.kt`, que l'audit n'avait pas inventorié). Retirer
 * avant ce compte perdrait les préférences enregistrées hors ligne d'un client
 * non mis à jour, sans le moindre message d'erreur.
 */

import { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendInternalError } from '../../../utils/response.js';
import { createPreferenceRouter } from './preference-router-factory';
import { unifiedPreferenceRoutes } from './unified-routes';
import { PREFERENCE_CATEGORIES, PREFERENCE_REGISTRY } from './preference-registry';
import { categoriesRoutes } from './categories';
import {
  PrivacyPreferenceSchema,
  PRIVACY_PREFERENCE_DEFAULTS,
} from '@meeshy/shared/types/preferences';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { depreciee } from '../../../utils/deprecation';
import { enhancedLogger } from '../../../utils/logger-enhanced.js';
import { apiPath } from '@meeshy/shared/api/prefix';

const logger = enhancedLogger.child({ module: 'UserPreferencesRoutes' });

// #4178 -- GET /me/preferences/encryption sert EXACTEMENT la forme que rend
// desormais GET /me?expand=security, qui la calcule depuis la meme source unique
// (le bundle SignalPreKeyBundle actif). Deux adresses pour une meme lecture, c'est
// deux contrats qui divergeront au prochain changement : celle-ci passe en sursis.
// Aucun Sunset -- le retrait est gouverne par le compteur d'adoption de #4275,
// jamais par une date posee a la main.
const ANNONCE_ENCRYPTION = {
  depuis: '2026-08-29',
  successeur: apiPath('/me?expand=security'),
} as const;

export async function userPreferencesRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  if (!prisma) {
    logger.error('Missing required service: prisma');
    return;
  }

  // Auth middleware pour toutes les routes
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  fastify.addHook('preHandler', authMiddleware);

  // ═══════════════════════════════════════════════════════════════════════════
  // Les trois routes unifiées : GET / PATCH / DELETE sur `/me/preferences`
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.register(unifiedPreferenceRoutes);

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /me/preferences/encryption - Préférence de chiffrement + état des clés
  //
  // Pas une catégorie de la factory : `encryptionPreference` vit dans le blob
  // `privacy` (PrivacyPreferenceSchema), et l'état des clés n'est pas une
  // préférence du tout — c'est l'existence d'une ligne `SignalPreKeyBundle`,
  // écrite par `POST /signal/keys` à chaque authentification du client.
  //
  // Cette ligne est la SEULE source de vérité de « cet utilisateur a des clés ».
  // Les colonnes `User.signalIdentityKeyPublic` / `signalRegistrationId` /
  // `signalPreKeyBundleVersion` / `lastKeyRotation` du schéma Prisma sont un
  // miroir qu'aucun chemin d'écriture n'alimente : les lire rendrait « pas de
  // clés » pour l'utilisateur dont le bundle est à une ligne de là.
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.get(
    '/encryption',
    {
      schema: {
        description: 'Récupérer la préférence de chiffrement et l\'état des clés Signal de l\'utilisateur',
        tags: ['preferences', 'encryption'],
        summary: 'Get encryption preference and Signal key status',
        response: {
          200: {
            description: 'Préférence de chiffrement et état des clés',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  encryptionPreference: {
                    type: 'string',
                    enum: ['disabled', 'optional', 'always'],
                    description: 'Préférence stockée dans le blob privacy'
                  },
                  hasSignalKeys: {
                    type: 'boolean',
                    description: 'Un bundle de pré-clés actif existe pour cet utilisateur'
                  },
                  signalRegistrationId: {
                    type: 'number',
                    nullable: true,
                    description: 'Registration ID du bundle actif, null sans bundle'
                  },
                  lastKeyRotation: {
                    type: 'string',
                    format: 'date-time',
                    nullable: true,
                    description: 'Dernier téléversement du bundle, null sans bundle'
                  }
                }
              }
            }
          },
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      },
      onRequest: depreciee(ANNONCE_ENCRYPTION),
    },
    async (request, reply) => {
      const userId = request.auth?.userId;

      if (!userId) {
        return sendUnauthorized(reply, 'UNAUTHORIZED', { message: 'Authentication required' });
      }

      try {
        const [prefs, bundle] = await Promise.all([
          prisma.userPreferences.findUnique({
            where: { userId },
            select: { privacy: true }
          }),
          prisma.signalPreKeyBundle.findUnique({
            where: { userId },
            select: { registrationId: true, isActive: true, lastRotatedAt: true }
          })
        ]);

        const privacy = (prefs?.privacy ?? {}) as Record<string, unknown>;
        const parsedPreference = PrivacyPreferenceSchema.shape.encryptionPreference.safeParse(
          privacy.encryptionPreference
        );

        const activeBundle = bundle?.isActive ? bundle : null;

        return sendSuccess(reply, {
          encryptionPreference: parsedPreference.success
            ? parsedPreference.data
            : PRIVACY_PREFERENCE_DEFAULTS.encryptionPreference,
          hasSignalKeys: activeBundle !== null,
          signalRegistrationId: activeBundle?.registrationId ?? null,
          lastKeyRotation: activeBundle?.lastRotatedAt ?? null
        });
      } catch (error: any) {
        fastify.log.error({ error }, 'Error fetching encryption preferences');
        return sendInternalError(reply, 'FETCH_ERROR', { message: error.message || 'Failed to fetch encryption preferences' });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ALIAS PAR CATÉGORIE — `/me/preferences/{catégorie}` (obsolètes, #4181)
  //
  // Sept montages, une boucle : la liste des catégories est une DONNÉE
  // (`PREFERENCE_CATEGORIES`), plus une énumération recopiée. C'est ce qui rend
  // `?categories=` réalisable — tant que la liste était sept appels alignés,
  // toute question posée sur un sous-ensemble devait la réécrire, et l'agrégat
  // l'avait effectivement réécrite.
  // ═══════════════════════════════════════════════════════════════════════════

  for (const category of PREFERENCE_CATEGORIES) {
    const entry = PREFERENCE_REGISTRY[category];
    fastify.register(
      createPreferenceRouter(category, entry.schema, entry.defaults, entry.storage),
      { prefix: `/${category}` }
    );
  }

  // /me/preferences/categories
  // Note: Les catégories utilisent une table séparée (conversationCategory) et non un champ JSON,
  // donc elles ne peuvent pas utiliser la factory pattern des autres préférences
  fastify.register(categoriesRoutes, { prefix: '/categories' });
}

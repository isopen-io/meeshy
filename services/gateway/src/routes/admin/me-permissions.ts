import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendSuccess, sendUnauthorized, sendInternalError } from '../../utils/response';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { servedUserPermissions, servedPermissionsSchema } from '../../services/admin/served-permissions';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import type { UserRoleEnum } from '@meeshy/shared/types';
import { depreciee, type AdresseDepreciee } from '../../utils/deprecation';

/**
 * Lire ses propres permissions — DEUX adresses, UNE implémentation (#4350).
 *
 * ## L'adresse a changé, pas la garde
 *
 * `GET /me/permissions` (`routes/me/permissions.ts`) est désormais l'adresse
 * CANONIQUE : lire SES PROPRES permissions n'a jamais été un geste
 * d'administration (S2, pas S5 — voir plus bas), et n'avait donc pas à
 * traverser `/admin` pour l'atteindre. `GET /admin/me/permissions`, servie
 * ici, devient l'ALIAS déprécié — vivante, pas une redirection
 * (`ANNONCE_ME_PERMISSIONS` ci-dessous ; pas de `retraitLe` : aucun compteur
 * d'adoption de #4275 ne surveille encore cette adresse — voir
 * `utils/deprecation.ts` § « Pourquoi Sunset est OPTIONNEL »).
 *
 * ## Une seule implémentation, jamais recopiée
 *
 * `handleMePermissions` et `mePermissionsRouteSharedOptions` sont exportés
 * d'ICI et importés tels quels par `routes/me/permissions.ts` — le patron
 * qu'emploie déjà `routes/me/get-me.ts` (`handleGetMe` /
 * `meRouteSharedOptions`, partagés par `routes/me/index.ts` et son propre
 * alias déprécié, `routes/auth/magic-link.ts`). Les deux adresses ne
 * peuvent pas diverger : il n'y a qu'un seul calcul.
 *
 * ## Pourquoi S2, pas S5
 *
 * Un USER a le droit de savoir qu'il n'a aucun droit — c'est même la
 * réponse la plus fréquente que cette route rendra, et la refuser
 * obligerait le client à déduire par l'échec. `fastify.authenticate` (JWT
 * seul — `requireAuth: true, allowAnonymous: false`, `server.ts`) est la
 * garde des DEUX adresses, inchangée par ce lot : elle n'a jamais exigé de
 * permission d'administration pour qu'un utilisateur ordinaire lise ses
 * propres droits.
 *
 * La charge est la PROJECTION de la matrice, jamais une composition : il n'y
 * a rien ici qui puisse diverger d'elle.
 */
export const ANNONCE_ME_PERMISSIONS: AdresseDepreciee = {
  depuis: '2026-08-30',
  successeur: '/api/v1/me/permissions',
};

/** Schéma PARTAGÉ par les deux adresses — voir doc-comment de module. */
export const mePermissionsRouteSharedOptions = {
  schema: {
    description: "The authenticated user's own permissions, projected from the single matrix.",
    tags: ['me'],
    summary: 'Read my permissions',
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              permissions: servedPermissionsSchema,
            },
          },
        },
      },
      401: errorResponseSchema,
      500: errorResponseSchema,
    },
    security: [{ bearerAuth: [] }],
  },
} as const;

/**
 * Handler PARTAGÉ — SEULE implémentation, servie aux deux adresses.
 * `request.log`, pas `fastify.log` : une fonction exportée, appelée par deux
 * plugins distincts, n'a de fermeture sur AUCUNE instance `fastify`
 * précise — le logger par requête est le seul commun aux deux.
 */
export async function handleMePermissions(request: FastifyRequest, reply: FastifyReply) {
  try {
    const acteur = (request as unknown as UnifiedAuthRequest).authContext;
    if (!acteur?.isAuthenticated || !acteur.registeredUser) {
      return sendUnauthorized(reply, 'Authentication required');
    }

    // Le RÔLE est servi à côté des permissions : sans lui, un client qui
    // constate un changement ne peut pas dire ce qui a changé, et l'écran
    // « votre rôle » aurait à le redemander ailleurs.
    const role = (acteur.registeredUser.role ?? 'USER') as UserRoleEnum;

    return sendSuccess(reply, { role, permissions: servedUserPermissions(role) });
  } catch (error) {
    request.log.error({ err: error }, '[ME] Failed to serve own permissions');
    return sendInternalError(reply, 'Failed to read permissions');
  }
}

/**
 * `GET /admin/me/permissions` — l'ALIAS déprécié (#4350). `onRequest` court
 * AVANT `fastify.authenticate` : l'annonce part même sur un refus (401), pour
 * l'appelant qui a le plus besoin de savoir migrer (`utils/deprecation.ts`).
 */
export async function adminMePermissionsRoutes(fastify: FastifyInstance) {
  fastify.get('/me/permissions', {
    ...mePermissionsRouteSharedOptions,
    onRequest: [depreciee(ANNONCE_ME_PERMISSIONS), fastify.authenticate],
  }, handleMePermissions);
}

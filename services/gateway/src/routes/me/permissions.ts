import type { FastifyInstance } from 'fastify';
import { handleMePermissions, mePermissionsRouteSharedOptions } from '../admin/me-permissions';

/**
 * `GET /me/permissions` — l'adresse CANONIQUE (#4350).
 *
 * Lire ses propres permissions n'est pas un geste d'administration (S2, pas
 * S5) : cette route n'avait pas à vivre sous `/admin` pour être atteinte.
 * L'ancienne adresse, `GET /admin/me/permissions`, reste montée comme ALIAS
 * déprécié — l'implémentation PARTAGÉE (`handleMePermissions` /
 * `mePermissionsRouteSharedOptions`) vit dans
 * `routes/admin/me-permissions.ts` et est importée ici telle quelle, jamais
 * recopiée. Même patron que `routes/me/get-me.ts` face à son propre alias
 * déprécié (`routes/auth/magic-link.ts`).
 *
 * Monté directement par `routes/index.ts` (entrée `me-permissions`, préfixe
 * `${API_PREFIX}/me`, à côté de l'entrée `me-preferences` qui partage déjà
 * ce préfixe) — pas depuis `routes/me/index.ts` : cette issue (#4350) ne
 * touche que le point de montage et l'implémentation partagée, jamais
 * l'agrégateur `/me` existant.
 */
export async function mePermissionsRoutes(fastify: FastifyInstance) {
  fastify.get('/permissions', {
    ...mePermissionsRouteSharedOptions,
    onRequest: [fastify.authenticate],
  }, handleMePermissions);
}

import type { FastifyInstance } from 'fastify';
import {
  handleListCategories,
  listCategoriesRouteSharedOptions,
  handleCreateCategory,
  createCategoryRouteSharedOptions,
  handleUpdateCategory,
  updateCategoryRouteSharedOptions,
  handleDeleteCategory,
  deleteCategoryRouteSharedOptions,
  handleReorderCategories,
  reorderCategoriesRouteSharedOptions,
} from './preferences/categories';
import type { CategoryBody, CategoryIdParams } from './preferences/categories';

/**
 * `/me/categories` — l'adresse CANONIQUE (#4359, suivi de #4182).
 *
 * Une catégorie de conversation est une TABLE (`UserConversationCategory`),
 * pas une préférence — elle n'avait pas à vivre sous `/me/preferences` pour
 * être atteinte. Les cinq anciennes adresses,
 * `{GET,POST,PATCH,DELETE} /me/preferences/categories[/:categoryId]` et
 * `POST /me/preferences/categories/reorder`, restent montées comme ALIAS
 * dépréciés — l'implémentation PARTAGÉE (les cinq couples
 * `handleXxxCategor{y,ies}` / `xxxCategor{y,ies}RouteSharedOptions`) vit
 * dans `routes/me/preferences/categories.ts` et est importée ici telle
 * quelle, jamais recopiée. Même patron que `routes/me/permissions.ts` face
 * à `routes/admin/me-permissions.ts` (#4350).
 *
 * `GET /me/preferences/categories/:categoryId` (détail) n'a PAS de nouvelle
 * adresse ici : #4182 critère 6 la voue à une suppression — pas un alias —
 * une fois son unique lecteur web migré (hors territoire de #4359). Ce
 * fichier ne porte donc que CINQ routes, pas six.
 *
 * Monté directement par `routes/index.ts` (entrée `me-categories`, préfixe
 * `${API_PREFIX}/me`, à côté des entrées `me-preferences` et
 * `me-permissions` qui partagent déjà ce préfixe) — pas depuis
 * `routes/me/index.ts` ni `routes/me/preferences/index.ts` : cette issue ne
 * touche que le point de montage et l'implémentation partagée, jamais les
 * agrégateurs `/me` et `/me/preferences` existants.
 *
 * ## L'authentification
 *
 * Ce plugin est un montage AUTONOME, sans parent qui pose déjà un hook —
 * contrairement à `categoriesRoutes` (nichée sous `userPreferencesRoutes`,
 * qui pose son `preHandler` d'auth sur tout le sous-arbre). `onRequest:
 * [fastify.authenticate]` est donc requis ICI, comme pour
 * `mePermissionsRoutes` : `fastify.authenticate` est la MÊME factory
 * (`createUnifiedAuthMiddleware(prisma, { requireAuth: true, allowAnonymous:
 * false })`, `server.ts`) que celle posée par `userPreferencesRoutes` — elle
 * pose `request.auth` ET `request.authContext` de façon identique, donc les
 * handlers partagés (qui ne lisent que `request.auth?.userId` et
 * `request.server.*`) se comportent à l'identique sous les deux mounts.
 */
export async function meCategoriesRoutes(fastify: FastifyInstance) {
  fastify.get('/categories', {
    ...listCategoriesRouteSharedOptions,
    onRequest: [fastify.authenticate],
  }, handleListCategories);

  fastify.post<{ Body: CategoryBody }>('/categories', {
    ...createCategoryRouteSharedOptions,
    onRequest: [fastify.authenticate],
  }, handleCreateCategory);

  fastify.patch<{ Params: CategoryIdParams; Body: Partial<CategoryBody> }>('/categories/:categoryId', {
    ...updateCategoryRouteSharedOptions,
    onRequest: [fastify.authenticate],
  }, handleUpdateCategory);

  fastify.delete<{ Params: CategoryIdParams }>('/categories/:categoryId', {
    ...deleteCategoryRouteSharedOptions,
    onRequest: [fastify.authenticate],
  }, handleDeleteCategory);

  fastify.post<{ Body: { updates: Array<{ categoryId: string; order: number }> } }>('/categories/reorder', {
    ...reorderCategoriesRouteSharedOptions,
    onRequest: [fastify.authenticate],
  }, handleReorderCategories);
}

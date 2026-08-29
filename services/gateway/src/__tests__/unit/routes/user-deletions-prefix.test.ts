/**
 * Témoin de #4277 (critère 3) — `userDeletionsRoutes` ne porte plus de
 * chemin ABSOLU codé en dur : l'adresse suit `opts.basePath` (fournie au
 * `server.register(userDeletionsRoutes, { basePath })`), avec un repli sur
 * `/api` — la valeur EFFECTIVE d'aujourd'hui (`prefix: ''` + chemin en dur
 * `/api/…`) — quand l'appelant n'en fournit aucune. `basePath`, jamais
 * `prefix` : les routes internes sont des URLs ABSOLUES, et le mécanisme de
 * préfixage NATIF de Fastify (déclenché par la clé réservée `prefix`) les
 * additionnerait — voir le commentaire de `UserDeletionsRoutesOptions`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../services/conversationPreferencesSync', () => ({
  writeConversationPreferences: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock('../../../services/messaging/retractHiddenMessageNotifications', () => ({
  retractNotificationsForClearedHistory: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock('../../../services/personalMessageVisibilitySync', () => ({
  hideMessagesForUser: jest.fn<any>().mockResolvedValue(undefined),
  restoreMessageForUser: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock('../../../services/messaging/personalPreviewRefresh', () => ({
  refreshPersonalConversationPreview: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(
    () =>
      async (request: any): Promise<void> => {
        request.authContext = { userId: 'user-1' };
      }
  ),
}));

import userDeletionsRoutes from '../../../routes/user-deletions';

function buildPrisma() {
  return {
    participant: {
      // #4332 — `role` absent ⇒ traité comme 'member' par
      // `isMemberCreator(role ?? 'member')` : la branche empruntée par
      // `DELETE .../delete-for-me` (délégué à `performConversationDeleteForMe`
      // depuis ce lot) est la plus simple, un seul `participant.update`, sans
      // `$transaction` ni lecture de `conversation` — exactement ce que ce
      // double minimal peut servir.
      findFirst: jest.fn<any>().mockResolvedValue({
        id: 'p1',
        isActive: true,
        // `restore-for-me` lit ces deux champs (#4332) : `deletedForMe: null`
        // ⇒ 400 propre (« pas supprimé ») plutôt qu'un 500 accidentel par
        // accès à une propriété absente — ce test ne vérifie que l'ADRESSE,
        // un statut inattendu masquerait un vrai défaut de câblage.
        deletedForMe: null,
        conversation: { isActive: true },
      }),
      update: jest.fn<any>().mockResolvedValue({ id: 'p1', isActive: false }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

describe('userDeletionsRoutes — adresse pilotée par le préfixe d\'enregistrement (#4277)', () => {
  it('suit un préfixe /api/v1 explicite — plus une seule adresse en dur dans le fichier', async () => {
    const app = Fastify({ logger: false });
    app.decorate('prisma', buildPrisma() as any);
    await app.register(userDeletionsRoutes, { basePath: '/api/v1' });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/v1/user/deleted-conversations' });
    expect(res.statusCode).toBe(200);

    // L'ancienne adresse bare-/api ne doit PLUS répondre sous ce montage :
    // la preuve que la chaîne est bien PILOTÉE, pas dupliquée en dur à côté.
    const missOld = await app.inject({ method: 'GET', url: '/api/user/deleted-conversations' });
    expect(missOld.statusCode).toBe(404);

    await app.close();
  });

  it('replie sur /api (adresse historique) quand server.register() ne fournit aucun préfixe', async () => {
    // Reproduit l'appel ACTUEL de route-registration.ts
    // (`server.register(userDeletionsRoutes, { prefix: '' })`) — zéro
    // changement de comportement tant que son édit n'est pas appliqué.
    const app = Fastify({ logger: false });
    app.decorate('prisma', buildPrisma() as any);
    await app.register(userDeletionsRoutes);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/user/deleted-conversations' });
    expect(res.statusCode).toBe(200);

    await app.close();
  });

  it('les sept routes suivent TOUTES le même préfixe — une seule convention (critère 3)', async () => {
    const app = Fastify({ logger: false });
    app.decorate('prisma', buildPrisma() as any);
    await app.register(userDeletionsRoutes, { basePath: '/api/v1' });
    await app.ready();

    const routes = [
      { method: 'DELETE', url: '/api/v1/conversations/c1/delete-for-me' },
      { method: 'POST', url: '/api/v1/conversations/c1/restore-for-me' },
      { method: 'POST', url: '/api/v1/conversations/c1/clear-history' },
      { method: 'DELETE', url: '/api/v1/messages/m1/delete-for-me' },
      { method: 'POST', url: '/api/v1/messages/m1/restore-for-me' },
      { method: 'DELETE', url: '/api/v1/messages/bulk/delete-for-me' },
      { method: 'GET', url: '/api/v1/user/deleted-conversations' },
    ] as const;

    for (const route of routes) {
      const res = await app.inject({
        method: route.method,
        url: route.url,
        payload: route.method === 'POST' && route.url.endsWith('clear-history')
          ? { beforeDate: new Date().toISOString() }
          : route.method === 'DELETE' && route.url.endsWith('bulk/delete-for-me')
          ? { messageIds: ['m1'] }
          : undefined,
      });
      // 404 signifierait que cette route n'a pas suivi le préfixe commun —
      // c'est exactement ce que la troisième convention d'adressage
      // produisait avant #4277. Tout le reste (200, 400, 403…) prouve que
      // la route existe SOUS ce préfixe. `route` figure dans la trace Jest
      // en cas d'échec (assertion dans une boucle `for…of`).
      expect(res.statusCode).not.toBe(404);
    }

    await app.close();
  });
});

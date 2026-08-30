/**
 * `DELETE /api/conversations/:id/delete-for-me` DIT qu'il est en sursis (#4317).
 *
 * #4317 posait la question en décision produit — « laquelle des deux
 * implémentations survit ? ». La mesure y a répondu : la moitié riche
 * (`routes/conversations/delete-for-me.ts`) écrit `Participant.deletedForMe`,
 * la colonne sur laquelle la liste de conversations construit son filtre ;
 * celle-ci écrit `UserConversationPreferences.deletedForUserAt`, qu'aucune
 * requête de liste ne consulte. Les trois clients appellent la première.
 *
 * Ce témoin garde la CONSÉQUENCE de ce verdict, et rien d'autre : l'adresse
 * perdante reste servie — la queue des versions installées est longue — mais
 * elle ANNONCE désormais par quoi la remplacer.
 *
 * Il l'injecte sur une requête REFUSÉE, pour la raison qui décide de la forme
 * du correctif : posée dans le handler, l'annonce ne partirait que sur les
 * 200, c'est-à-dire jamais pour l'appelant dont le jeton a expiré — celui qui
 * a le plus besoin de migrer. `onRequest` court avant `preValidation`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

/**
 * L'authentification REFUSE — le seul état à simuler. L'annonce court avant
 * elle, donc aucun service métier n'est jamais atteint et ce témoin ne dépend
 * d'aucun double de Prisma.
 */
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (
    _request: unknown,
    reply: { status: (n: number) => { send: (b: unknown) => Promise<void> } }
  ) => {
    await reply.status(401).send({ success: false, error: 'Unauthorized' });
  },
}));

import userDeletionsRoutes from '../../../routes/user-deletions';

async function monter(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {} as never);
  await app.register(userDeletionsRoutes, { basePath: '/api' });
  await app.ready();
  return app;
}

describe("L'alias non versionné de « supprimer pour moi » annonce son successeur (#4317)", () => {
  it('nomme le successeur avec l\'id RÉSOLU, sur un 401', async () => {
    const app = await monter();

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/conversations/c42/delete-for-me',
    });

    expect(res.statusCode).toBe(401);
    // L'id réel, jamais le gabarit `:conversationId` : un `Link` que le client
    // doit réécrire avant de le suivre n'indique aucune migration.
    expect(res.headers.link).toBe(
      '</api/v1/conversations/c42/delete-for-me>; rel="successor-version"'
    );
    expect(res.headers.deprecation).toMatch(/^@\d+$/);
    expect(typeof res.headers.sunset).toBe('string');

    await app.close();
  });

  /**
   * Le contre-témoin, et il compte autant : un hook posé sur l'INSTANCE — la
   * faute la plus facile ici, les sept routes vivant dans un seul fichier —
   * passerait le témoin ci-dessus en déclarant dépréciées les six autres, dont
   * AUCUNE n'a de successeur à nommer. Une annonce qui désigne le vide est
   * pire qu'un silence : elle envoie le client vers une adresse absente.
   */
  it("ne déborde sur AUCUNE des six autres routes du même fichier", async () => {
    const app = await monter();

    const voisines = [
      { method: 'POST' as const, url: '/api/conversations/c42/restore-for-me' },
      { method: 'POST' as const, url: '/api/conversations/c42/clear-history' },
      { method: 'DELETE' as const, url: '/api/messages/m1/delete-for-me' },
      { method: 'POST' as const, url: '/api/messages/m1/restore-for-me' },
      { method: 'DELETE' as const, url: '/api/messages/bulk/delete-for-me' },
      { method: 'GET' as const, url: '/api/user/deleted-conversations' },
    ];

    for (const { method, url } of voisines) {
      const res = await app.inject({ method, url, payload: {} });
      expect(Object.keys(res.headers)).not.toContain('deprecation');
      expect(Object.keys(res.headers)).not.toContain('link');
    }

    await app.close();
  });
});

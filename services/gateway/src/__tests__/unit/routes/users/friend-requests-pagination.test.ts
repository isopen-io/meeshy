/**
 * @jest-environment node
 */
import Fastify from 'fastify';
import { describe, it, expect } from '@jest/globals';
import { buildPaginationMeta } from '../../../../utils/pagination';
import { friendRequestsPaginationSchema } from '../../../../routes/users/devices';

// Le schéma déclarait `returned` (jamais émis) au lieu de `hasMore` (seul
// champ réellement produit par buildPaginationMeta) : fast-json-stringify
// supprimait donc la seule information permettant de paginer. Ce test monte le
// VRAI schéma de la route et traverse la sérialisation.
describe('GET /users/friend-requests — sérialisation de la pagination', () => {
  it('conserve hasMore à travers le schéma de réponse', async () => {
    const app = Fastify();
    app.get('/users/friend-requests', {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } },
              pagination: friendRequestsPaginationSchema
            }
          }
        }
      }
    }, async () => ({
      success: true,
      data: [{ id: 'fr-1' }],
      pagination: buildPaginationMeta(120, 0, 20, 20)
    }));

    const res = await app.inject({ method: 'GET', url: '/users/friend-requests' });
    const body = JSON.parse(res.body);

    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.total).toBe(120);
    await app.close();
  });
});

/**
 * DELETE /admin/posts/:postId — les effets DURABLES d'un retrait décidé depuis
 * la console de modération.
 *
 * Cette route écrit `deletedAt` sans passer par `PostService.deletePost`. Deux
 * cycles ont déjà rattrapé, un par un, ce que ce raccourci laissait tomber : les
 * usages de sons jamais libérés, puis la diffusion temps réel jamais émise.
 * Restaient les deux effets que le service écrit en base :
 *
 * 1. **Les liens de partage restaient ACTIFS.** Le soft-delete ne bascule que
 *    `deletedAt` — aucune cascade Prisma ne se déclenche. Un post retiré POUR
 *    MOTIF DE MODÉRATION gardait donc ses `/l/<token>` opérationnels : le
 *    contenu sanctionné restait atteignable par le lien déjà partagé, qui est
 *    précisément le chemin par lequel il s'était diffusé.
 *
 * 2. **Aucune ligne `AdminAuditLog`.** La route ACCEPTE un champ `reason`, et
 *    son propre schéma OpenAPI le documente « for audit trail » — mais la
 *    raison n'allait que dans un `fastify.log.info`, jamais dans la table que
 *    la console interroge. Le geste de modération le plus sensible du produit
 *    ne laissait aucune trace requêtable, là où `DELETE /posts/:postId` en
 *    laisse une pour exactement le même geste.
 *
 * Le témoin qui doit rester vert fait partie de la suite : l'admin qui retire
 * SON PROPRE post n'ouvre pas de ligne d'audit — sans ce cas, les autres
 * passeraient au vert en écrivant n'importe quel identifiant constant.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { adminPostRoutes } from '../posts';

const POST_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd799439031';
const ADMIN_ID = '507f1f77bcf86cd799439032';

const postFindUnique = jest.fn<any>();
const postUpdate = jest.fn<any>();
const trackingLinkUpdateMany = jest.fn<any>();
const auditCreate = jest.fn<any>();
const soundUsageDeleteMany = jest.fn<any>().mockResolvedValue({ count: 0 });
const soundUsageFindMany = jest.fn<any>().mockResolvedValue([]);
const soundUpdate = jest.fn<any>().mockResolvedValue({});

const mockPrisma = {
  post: { findUnique: postFindUnique, update: postUpdate },
  trackingLink: { updateMany: trackingLinkUpdateMany },
  adminAuditLog: { create: auditCreate },
  soundUsage: { deleteMany: soundUsageDeleteMany, findMany: soundUsageFindMany },
  sound: { update: soundUpdate },
} as any;

async function buildApp(actorId: string = ADMIN_ID): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: actorId, role: 'ADMIN' },
    };
  });
  app.register(adminPostRoutes);
  await app.ready();
  return app;
}

function livePost() {
  return {
    id: POST_ID,
    authorId: AUTHOR_ID,
    type: 'POST',
    visibility: 'PUBLIC',
    visibilityUserIds: [],
    deletedAt: null,
  };
}

const deleteInject = (app: FastifyInstance, reason?: string) =>
  app.inject({
    method: 'DELETE',
    url: `/posts/${POST_ID}`,
    headers: { 'content-type': 'application/json' },
    payload: reason === undefined ? {} : { reason },
  });

describe('DELETE /admin/posts/:postId — effets durables du retrait', () => {
  beforeEach(() => {
    postFindUnique.mockReset().mockResolvedValue(livePost());
    postUpdate.mockReset().mockResolvedValue({ id: POST_ID });
    trackingLinkUpdateMany.mockReset().mockResolvedValue({ count: 0 });
    auditCreate.mockReset().mockResolvedValue({});
  });

  it('coupe les liens de partage qui pointent encore sur le post retiré', async () => {
    const app = await buildApp();

    const res = await deleteInject(app, 'Spam');

    expect(res.statusCode).toBe(200);
    expect(trackingLinkUpdateMany).toHaveBeenCalledWith({
      where: { targetId: { in: [POST_ID] } },
      data: { isActive: false },
    });
    await app.close();
  });

  it("grave une ligne d'audit nommant l'auteur affecté et l'admin qui a tranché", async () => {
    const app = await buildApp();

    const res = await deleteInject(app, 'Spam');

    expect(res.statusCode).toBe(200);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const { data } = auditCreate.mock.calls[0][0] as any;
    expect(data).toMatchObject({
      userId: AUTHOR_ID,
      adminId: ADMIN_ID,
      action: 'DELETE_POST',
      entity: 'Post',
      entityId: POST_ID,
    });
  await app.close();
  });

  it("porte dans l'audit la raison que le schéma de la route promet d'y mettre", async () => {
    const app = await buildApp();

    await deleteInject(app, 'Contenu haineux');

    const { data } = auditCreate.mock.calls[0][0] as any;
    expect(JSON.parse(data.metadata)).toMatchObject({ reason: 'Contenu haineux' });
    await app.close();
  });

  it("n'invente pas de raison quand la console n'en fournit aucune", async () => {
    const app = await buildApp();

    await deleteInject(app);

    const { data } = auditCreate.mock.calls[0][0] as any;
    expect(JSON.parse(data.metadata).reason).toBeUndefined();
    await app.close();
  });

  it("n'ouvre aucune ligne d'audit quand l'admin retire son propre post", async () => {
    const app = await buildApp(AUTHOR_ID);

    const res = await deleteInject(app, 'Erreur de publication');

    expect(res.statusCode).toBe(200);
    expect(auditCreate).not.toHaveBeenCalled();
    expect(trackingLinkUpdateMany).toHaveBeenCalled();
    await app.close();
  });

  it("une trace d'audit perdue ne transforme pas un retrait committé en 500", async () => {
    auditCreate.mockRejectedValue(new Error('replica set down'));
    const app = await buildApp();

    const res = await deleteInject(app, 'Spam');

    expect(res.statusCode).toBe(200);
    expect(trackingLinkUpdateMany).toHaveBeenCalled();
    await app.close();
  });

  it('un lien de partage qui refuse de se couper ne fait pas échouer le retrait', async () => {
    trackingLinkUpdateMany.mockRejectedValue(new Error('replica set down'));
    const app = await buildApp();

    const res = await deleteInject(app, 'Spam');

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

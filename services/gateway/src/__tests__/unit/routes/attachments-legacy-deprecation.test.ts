/**
 * L'alias non versionné des pièces jointes ANNONCE son sursis (#4324).
 *
 * Il survivait sous `/api` pour une raison écrite au site de montage : « des
 * `fileUrl` de cette forme sont persistées en base depuis des années ». La
 * migration 013 les a réécrites en clés de stockage — la raison a disparu.
 *
 * Restent les notifications DÉJÀ LIVRÉES, qui portent des adresses de cette
 * forme et qu'aucun déploiement ne rattrape. L'alias ne se retire donc pas : il
 * se DÉPRÉCIE, comme les autres, avec la fenêtre du dépôt.
 */
import { describe, it, expect } from '@jest/globals';
import Fastify from 'fastify';
import { attachmentLegacyFileRoutes } from '../../../routes/attachments';

async function monter() {
  const app = Fastify();
  app.decorate('prisma', {} as never);
  await app.register(attachmentLegacyFileRoutes, { prefix: '/api' });
  await app.ready();
  return app;
}

describe("L'alias non versionné dit qu'il est en sursis", () => {
  it('porte Deprecation, Sunset et un Link qui nomme la route VERSIONNÉE', async () => {
    const app = await monter();

    const res = await app.inject({ method: 'GET', url: '/api/attachments/file/2025/12/id/x.png' });

    expect(res.headers.deprecation).toMatch(/^@\d+$/);
    expect(res.headers.sunset).toBeDefined();
    expect(res.headers.link).toBe(
      '</api/v1/attachments/file/2025/12/id/x.png>; rel="successor-version"'
    );

    await app.close();
  });

  it("le successeur porte le chemin RÉEL de l'appel, jamais un gabarit", async () => {
    const app = await monter();

    const res = await app.inject({ method: 'GET', url: '/api/attachments/file/avatars/user/abc.jpg' });

    expect(res.headers.link).toBe(
      '</api/v1/attachments/file/avatars/user/abc.jpg>; rel="successor-version"'
    );

    await app.close();
  });

  it("l'annonce part MÊME quand le fichier est introuvable — c'est l'ADRESSE qui est en sursis", async () => {
    const app = await monter();

    const res = await app.inject({ method: 'GET', url: '/api/attachments/file/nexiste/pas.png' });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.headers.deprecation).toMatch(/^@\d+$/);

    await app.close();
  });
});

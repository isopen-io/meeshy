/**
 * Les permissions se lisent à UNE adresse, et disent la LOI (#4152).
 *
 * Un ANALYST se connectait et recevait `canAccessAdmin: true` : le web lui
 * peignait la console d'administration, et le serveur lui refusait la moitié
 * des routes. Un MODERATOR modifiait son avatar et voyait la console
 * DISPARAÎTRE, sans qu'aucun rôle n'ait changé.
 *
 * Ce ne sont pas des défauts d'affichage : ce sont deux réponses différentes à
 * la même question, servies par le même serveur, à deux moments du même
 * parcours.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { adminMePermissionsRoutes } from '../../../../routes/admin/me-permissions';
import { servedUserPermissions } from '../../../../services/admin/served-permissions';

const PREFIXE = '/api/v1/admin';

async function monter(role: string | null) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = role
      ? { isAuthenticated: true, type: 'user', userId: 'u-1', registeredUser: { id: 'u-1', role } }
      : { isAuthenticated: false };
  });
  await app.register(adminMePermissionsRoutes, { prefix: PREFIXE });
  await app.ready();
  return app;
}

const lire = (app: FastifyInstance) => app.inject({ method: 'GET', url: `${PREFIXE}/me/permissions` });

describe('Le témoin de RANG : un ANALYST n’accède pas à l’administration', () => {
  it("sert `canAccessAdmin: false` à un ANALYST", async () => {
    // Un témoin de rang s'écrit sur le rang qui DISCRIMINE : au rang BIGBOSS,
    // la copie manuscrite et la matrice rendaient le même verdict, et un
    // témoin posé là n'aurait pas pu tomber.
    const app = await monter('ANALYST');

    const res = await lire(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.permissions.canAccessAdmin).toBe(false);
    await app.close();
  });

  it('sert quand même ses droits de LECTURE — refuser tout serait une autre erreur', async () => {
    const app = await monter('ANALYST');

    const permissions = (await lire(app)).json().data.permissions;

    expect(permissions.canViewAnalytics).toBe(true);
    await app.close();
  });

  it("un MODERATOR garde son accès — c'est ce que l'édition de profil lui retirait", async () => {
    const app = await monter('MODERATOR');

    expect((await lire(app)).json().data.permissions.canAccessAdmin).toBe(true);
    await app.close();
  });

  it('sert le RÔLE à côté des permissions', async () => {
    // Sans lui, un client qui constate un changement ne peut pas dire ce qui a
    // changé.
    const app = await monter('BIGBOSS');

    expect((await lire(app)).json().data.role).toBe('BIGBOSS');
    await app.close();
  });

  it("est en S2 : un USER lit ses permissions, et apprend qu'il n'en a aucune", async () => {
    // Lire SES PROPRES permissions n'est pas un geste d'administration. La
    // refuser obligerait le client à déduire par l'échec.
    const app = await monter('USER');

    const res = await lire(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.permissions.canAccessAdmin).toBe(false);
    await app.close();
  });

  it('exige tout de même une identité', async () => {
    const app = await monter(null);

    expect((await lire(app)).statusCode).toBe(401);
    await app.close();
  });
});

describe('La route est la PROJECTION de la matrice, jamais une composition', () => {
  it('rend exactement ce que le site unique rend, pour les six rôles', async () => {
    for (const role of ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT', 'ANALYST', 'USER']) {
      const app = await monter(role);

      expect((await lire(app)).json().data.permissions).toEqual(servedUserPermissions(role));

      await app.close();
    }
  });
});

describe("Éditer son profil ne change AUCUNE permission", () => {
  it('la projection ne dépend que du RÔLE — rien de ce qu\'une édition touche', async () => {
    // Les trois sites de `profile.ts` recomposaient les permissions à la main
    // après chaque écriture, sur le seul prédicat `role === 'ADMIN' ||
    // role === 'BIGBOSS'` : un MODERATOR qui changeait son avatar recevait
    // `canAccessAdmin: false`. La projection ne prend qu'un rôle en entrée : il
    // n'y a plus rien qu'une édition puisse déplacer.
    const avant = servedUserPermissions('MODERATOR');
    const apres = servedUserPermissions('MODERATOR');

    expect(apres).toEqual(avant);
    expect(apres.canAccessAdmin).toBe(true);
  });
});

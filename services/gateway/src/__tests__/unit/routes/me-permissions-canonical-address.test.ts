/**
 * `GET /me/permissions` devient l'adresse CANONIQUE ; `GET
 * /admin/me/permissions` devient un ALIAS déprécié qui s'annonce (#4350).
 *
 * Lire SES PROPRES permissions n'a jamais été un geste d'administration —
 * l'appelant ne devait pas avoir à traverser le préfixe `/admin` pour
 * l'atteindre. Ce témoin monte les DEUX plugins sur la MÊME instance
 * Fastify, aux préfixes réels de `routes/index.ts`
 * (`${API_PREFIX}/me` et `${API_PREFIX}/admin`), et n'exerce que
 * `app.inject()` — jamais un double du handler — pour que les assertions
 * portent sur ce que le SÉRIALISEUR rend, schéma de réponse compris.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { adminMePermissionsRoutes } from '../../../routes/admin/me-permissions';
import { mePermissionsRoutes } from '../../../routes/me/permissions';
import { servedUserPermissions } from '../../../services/admin/served-permissions';

const PREFIXE_API = '/api/v1';

async function monter(role: string | null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = role
      ? { isAuthenticated: true, type: 'user', userId: 'u-1', registeredUser: { id: 'u-1', role } }
      : { isAuthenticated: false };
  });

  // Les DEUX adresses réelles de `routes/index.ts` : l'entrée `me-permissions`
  // sous `${API_PREFIX}/me` (canonique), l'entrée `admin-me-permissions` sous
  // `${API_PREFIX}/admin` (alias) — deux montages Fastify DISTINCTS du même
  // couple export/schéma (`handleMePermissions` / `mePermissionsRouteSharedOptions`).
  await app.register(mePermissionsRoutes, { prefix: `${PREFIXE_API}/me` });
  await app.register(adminMePermissionsRoutes, { prefix: `${PREFIXE_API}/admin` });
  await app.ready();
  return app;
}

const lireCanonique = (app: FastifyInstance) =>
  app.inject({ method: 'GET', url: `${PREFIXE_API}/me/permissions` });

const lireAlias = (app: FastifyInstance) =>
  app.inject({ method: 'GET', url: `${PREFIXE_API}/admin/me/permissions` });

describe('GET /me/permissions sert les droits de l’appelant (#4350)', () => {
  it('rend 200 et le RÔLE demandé, sous data.role', async () => {
    const app = await monter('MODERATOR');

    const res = await lireCanonique(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.role).toBe('MODERATOR');
    await app.close();
  });

  it('rend les permissions de la MATRICE, pas une copie — data.permissions', async () => {
    const app = await monter('ANALYST');

    const res = await lireCanonique(app);

    // Un témoin de rang s'écrit sur un rang qui DISCRIMINE : ANALYST a accès
    // à l'analytique mais pas à l'administration — les deux valeurs
    // coïncideraient avec un repli erroné si le témoin ne portait que sur
    // l'une des deux.
    expect(res.json().data.permissions).toEqual(servedUserPermissions('ANALYST'));
    expect(res.json().data.permissions.canAccessAdmin).toBe(false);
    expect(res.json().data.permissions.canViewAnalytics).toBe(true);
    await app.close();
  });

  it('exige une identité — 401 sans authentification, jamais un handler qui devine', async () => {
    const app = await monter(null);

    expect((await lireCanonique(app)).statusCode).toBe(401);
    await app.close();
  });

  it("n'annonce AUCUNE dépréciation sur l'adresse canonique", async () => {
    const app = await monter('USER');

    const res = await lireCanonique(app);

    expect(res.headers.deprecation).toBeUndefined();
    expect(res.headers.link).toBeUndefined();
    await app.close();
  });
});

describe('GET /admin/me/permissions reste vivante et annonce sa dépréciation (#4350)', () => {
  it('répond toujours 200 avec les mêmes droits — ce n’est PAS une redirection', async () => {
    const app = await monter('BIGBOSS');

    const res = await lireAlias(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.role).toBe('BIGBOSS');
    await app.close();
  });

  it('pose l’en-tête Deprecation (RFC 9745, @<epoch>) — même sans verdict favorable', async () => {
    const app = await monter(null);

    // `onRequest` court AVANT `fastify.authenticate` : l'annonce part même
    // sur le refus — l'appelant qui échoue est celui qui a le plus besoin de
    // savoir migrer (`utils/deprecation.ts`).
    const res = await lireAlias(app);

    expect(res.statusCode).toBe(401);
    expect(res.headers.deprecation).toMatch(/^@\d+$/);
    await app.close();
  });

  it('pointe son Link vers la nouvelle adresse canonique', async () => {
    const app = await monter('USER');

    const res = await lireAlias(app);

    expect(res.headers.link).toBe('</api/v1/me/permissions>; rel="successor-version"');
    await app.close();
  });
});

describe('Les deux adresses servent EXACTEMENT la même chose — une seule implémentation (#4350)', () => {
  it('parité clé à clé, pour les six rôles', async () => {
    for (const role of ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT', 'ANALYST', 'USER']) {
      const app = await monter(role);

      const canonique = (await lireCanonique(app)).json();
      const alias = (await lireAlias(app)).json();

      // L'alias porte des en-têtes de dépréciation en PLUS, jamais un CORPS
      // différent : `data` doit être identique clé à clé.
      expect(alias.data).toEqual(canonique.data);
      expect(Object.keys(alias.data).sort()).toEqual(Object.keys(canonique.data).sort());
      expect(canonique.success).toBe(true);
      expect(alias.success).toBe(true);

      await app.close();
    }
  });
});

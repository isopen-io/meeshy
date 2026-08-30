/**
 * Le vocabulaire d'autorisation, et la PREUVE que l'admission n'a pas bougé
 * (#4153).
 *
 * Treize gardes locales sont remplacées par `requirePermission('<nom>')`. Ce
 * lot uniformise le VOCABULAIRE ; les NIVEAUX appartiennent à #4157. Séparer
 * les deux permet de relire chaque changement d'admission pour ce qu'il est —
 * encore faut-il pouvoir affirmer qu'il n'y en a aucun ici.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { requirePermission, requireHierarchy, requireSovereign, withAudit } from '../../../middleware/authorize';
import type { AdminPermissions } from '../../../services/admin/permissions.service';

const ROLES = ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT', 'ANALYST', 'USER'] as const;

async function monter(
  garde: (req: any, rep: any) => Promise<void>,
  role: string | null,
  options: { userId?: string; prisma?: unknown; params?: string } = {}
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', (options.prisma ?? { user: { findUnique: jest.fn<any>(async () => null) } }) as never);
  app.get(options.params ?? '/', { onRequest: [async (req: any) => {
    req.authContext = role
      ? {
          isAuthenticated: true,
          type: 'user',
          userId: options.userId ?? 'moi',
          registeredUser: { id: options.userId ?? 'moi', role },
        }
      : { isAuthenticated: false };
  }, garde as never] }, async () => ({ ok: true }));
  await app.ready();
  return app;
}

/** Les rôles qu'une permission admet réellement, mesurés par la garde. */
async function rolesAdmis(permission: keyof AdminPermissions): Promise<string[]> {
  const admis: string[] = [];
  for (const role of ROLES) {
    const app = await monter(requirePermission(permission), role);
    const res = await app.inject({ method: 'GET', url: '/' });
    if (res.statusCode === 200) admis.push(role);
    await app.close();
  }
  return admis;
}

describe("L'admission est IDENTIQUE à celle des gardes remplacées", () => {
  /**
   * Chaque famille : la liste de rôles que la garde locale portait, et la
   * permission qui la remplace. Le témoin mesure que les deux coïncident.
   */
  const FAMILLES: Array<[string, keyof AdminPermissions, string[]]> = [
    ['languages, system-rankings, dashboard, analytics', 'canViewAnalytics', ['BIGBOSS', 'ADMIN', 'AUDIT', 'ANALYST']],
    ['anonymous-users', 'canViewUsers', ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT']],
    ['messages, posts, content', 'canAccessAdmin', ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT']],
    ['invitations', 'canCreateUsers', ['BIGBOSS', 'ADMIN']],
    ['broadcasts', 'canManageNotifications', ['BIGBOSS', 'ADMIN']],
    ['reports', 'canModerateContent', ['BIGBOSS', 'ADMIN', 'MODERATOR']],
    ['agent, agent-topics', 'canManageAgent', ['BIGBOSS', 'ADMIN']],
    ['roles', 'canUpdateUserRoles', ['BIGBOSS', 'ADMIN']],
  ];

  it.each(FAMILLES)('%s → %s admet exactement les rôles d’avant', async (_famille, permission, attendus) => {
    expect(await rolesAdmis(permission)).toEqual(attendus);
  });

  it('refuse un appelant sans identité, avant même de regarder la permission', async () => {
    const app = await monter(requirePermission('canAccessAdmin'), null);

    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(401);
    await app.close();
  });

  it('NOMME la permission manquante — « permission insuffisante » n’aide personne', async () => {
    const app = await monter(requirePermission('canManageAgent'), 'MODERATOR');

    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain('canManageAgent');
    await app.close();
  });
});

describe('requireHierarchy — une permission dit ce qu’on peut faire, pas SUR QUI', () => {
  const prismaAvecCible = (role: string) => ({
    user: { findUnique: jest.fn<any>(async () => ({ role })) },
  });

  it("refuse un ADMIN qui vise un BIGBOSS — la permission est vraie, la cible est au-dessus", async () => {
    const app = await monter(requireHierarchy(), 'ADMIN', {
      prisma: prismaAvecCible('BIGBOSS'),
      params: '/u/:userId',
    });

    expect((await app.inject({ method: 'GET', url: '/u/cible' })).statusCode).toBe(403);
    await app.close();
  });

  it('laisse un ADMIN viser un MODERATOR', async () => {
    const app = await monter(requireHierarchy(), 'ADMIN', {
      prisma: prismaAvecCible('MODERATOR'),
      params: '/u/:userId',
    });

    expect((await app.inject({ method: 'GET', url: '/u/cible' })).statusCode).toBe(200);
    await app.close();
  });

  it('laisse passer quand la cible est SOI — personne ne se surclasse', async () => {
    const app = await monter(requireHierarchy(), 'USER', {
      userId: 'moi',
      prisma: { user: { findUnique: jest.fn<any>(async () => { throw new Error('ne doit pas être lue'); }) } },
      params: '/u/:userId',
    });

    expect((await app.inject({ method: 'GET', url: '/u/moi' })).statusCode).toBe(200);
    await app.close();
  });

  it('refuse une cible INTROUVABLE — fail-closed, et 403 plutôt que 404', async () => {
    // Dire « ce compte n'existe pas » à qui n'a pas le droit d'agir dessus est
    // déjà une information.
    const app = await monter(requireHierarchy(), 'BIGBOSS', {
      prisma: { user: { findUnique: jest.fn<any>(async () => null) } },
      params: '/u/:userId',
    });

    expect((await app.inject({ method: 'GET', url: '/u/fantome' })).statusCode).toBe(403);
    await app.close();
  });
});

describe('requireSovereign — une question différente, pas un seuil plus haut', () => {
  it('n’admet que BIGBOSS', async () => {
    const admis: string[] = [];
    for (const role of ROLES) {
      const app = await monter(requireSovereign(), role);
      if ((await app.inject({ method: 'GET', url: '/' })).statusCode === 200) admis.push(role);
      await app.close();
    }

    expect(admis).toEqual(['BIGBOSS']);
  });
});

describe('withAudit — la trace ne peut pas faire échouer le geste', () => {
  it('écrit la ligne avec l’acteur, l’action et la cible', async () => {
    const create = jest.fn<any>(async () => ({}));
    const app = Fastify({ logger: false });
    app.decorate('prisma', { adminAuditLog: { create } } as never);
    app.get('/', { onRequest: [async (req: any) => {
      req.authContext = { isAuthenticated: true, type: 'user', userId: 'admin-1', registeredUser: { id: 'admin-1', role: 'ADMIN' } };
    }] }, async (req) => {
      await withAudit(req, { action: 'DELETE_USER', entityId: 'cible-1', reason: 'spam' });
      return { ok: true };
    });
    await app.ready();

    await app.inject({ method: 'GET', url: '/' });

    const ecrit = (create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(ecrit.adminId).toBe('admin-1');
    expect(ecrit.action).toBe('DELETE_USER');
    expect(ecrit.entityId).toBe('cible-1');
    expect(String(ecrit.metadata)).toContain('spam');
    await app.close();
  });

  it("n'échoue pas quand l'écriture échoue — le geste est déjà committé", async () => {
    const app = Fastify({ logger: false });
    app.decorate('prisma', {
      adminAuditLog: { create: jest.fn<any>(async () => { throw new Error('db down'); }) },
    } as never);
    app.get('/', { onRequest: [async (req: any) => {
      req.authContext = { isAuthenticated: true, type: 'user', userId: 'admin-1', registeredUser: { id: 'admin-1', role: 'ADMIN' } };
    }] }, async (req) => {
      await withAudit(req, { action: 'X', entityId: 'y' });
      return { ok: true };
    });
    await app.ready();

    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(200);
    await app.close();
  });
});

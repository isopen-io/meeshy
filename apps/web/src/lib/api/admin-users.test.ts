import { describe, expect, test } from 'bun:test';

import { ADMIN_USERS_PAGE_SIZE, decodeAdminUsers, loadAdminUsers, loadAdminUsersPage } from './admin-users';
import type { HttpTransport } from './http';

/**
 * **Une pagination lue au mauvais niveau** — `GET /admin/users` sert son
 * `pagination` DANS `data`, là où d'autres routes le servent à côté. Lu au
 * mauvais endroit, `total` vaut 0 et la liste s'arrête à la première page sans
 * que rien n'échoue.
 */

describe('decodeAdminUsers — la pagination vit DANS `data`', () => {
  const charge = (total: number, hasMore?: boolean) => ({
    users: [
      { id: 'u1', username: 'alice', displayName: 'Alice', email: 'a@x.com', role: 'USER', isActive: true, isOnline: true, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'u2', username: 'bob', email: 'b@x.com', role: 'ADMIN' },
    ],
    pagination: { total, offset: 0, limit: ADMIN_USERS_PAGE_SIZE, ...(hasMore === undefined ? {} : { hasMore }) },
  });

  test('lit le total depuis `data.pagination`', () => {
    expect(decodeAdminUsers(charge(57), 0).total).toBe(57);
  });

  test('obéit au `hasMore` du serveur quand il le dit', () => {
    expect(decodeAdminUsers(charge(57, false), 0).hasMore).toBe(false);
    expect(decodeAdminUsers(charge(57, true), 0).hasMore).toBe(true);
  });

  test('recalcule `hasMore` depuis l’OFFSET quand le serveur se tait', () => {
    const meta = { users: charge(57).users, pagination: { total: 57 } };

    expect(decodeAdminUsers(meta, 0).hasMore).toBe(true);
    expect(decodeAdminUsers(meta, 55).hasMore).toBe(false);
  });

  test('ne fabrique AUCUN libellé : le nom affiché absent reste vide, `personLabel` décide du repli', () => {
    const ligne = decodeAdminUsers(charge(2), 0).users[1];
    expect(ligne?.displayName).toBe('');
    expect(ligne?.username).toBe('bob');
  });

  test('écarte les lignes sans identifiant plutôt que d’en fabriquer un', () => {
    const abimee = { users: [{ username: 'sans-id' }, { id: 'u1', username: 'alice' }], pagination: { total: 2 } };

    expect(decodeAdminUsers(abimee, 0).users.map((u) => u.id)).toEqual(['u1']);
  });
});

describe('loadAdminUsers — l’adresse demandée', () => {
  const transportEspion = () => {
    const appels: { path: string }[] = [];
    const transport = {
      request: async (requete: { path: string }) => {
        appels.push({ path: requete.path });
        return { ok: true as const, data: { users: [], pagination: { total: 0 } } };
      },
    } as unknown as HttpTransport;
    return { transport, appels };
  };

  test('pagine par OFFSET — `page` serait ignoré par la passerelle', async () => {
    const { transport, appels } = transportEspion();

    await loadAdminUsers({ source: 'gateway', transport, offset: 40, search: '' });

    expect(appels[0]?.path).toContain('offset=40');
    expect(appels[0]?.path).not.toContain('page=');
  });

  test('n’envoie `search` que lorsqu’il porte quelque chose', async () => {
    const { transport, appels } = transportEspion();

    await loadAdminUsers({ source: 'gateway', transport, offset: 0, search: '   ' });
    expect(appels[0]?.path).not.toContain('search=');

    await loadAdminUsers({ source: 'gateway', transport, offset: 0, search: '  alice ' });
    expect(appels[1]?.path).toContain('search=alice');
  });

  test('transmet le tri, l’ordre, la taille de page et les filtres de la liste (#7873)', async () => {
    const { transport, appels } = transportEspion();

    await loadAdminUsers({
      source: 'gateway',
      transport,
      offset: 50,
      search: '',
      limit: 50,
      sortBy: 'username',
      sortOrder: 'asc',
      filters: { role: 'ADMIN', isActive: 'false' },
    });

    const adresse = new URL(appels[0]?.path ?? '', 'https://x.test');
    expect(adresse.searchParams.get('limit')).toBe('50');
    expect(adresse.searchParams.get('sortBy')).toBe('username');
    expect(adresse.searchParams.get('sortOrder')).toBe('asc');
    expect(adresse.searchParams.get('role')).toBe('ADMIN');
    expect(adresse.searchParams.get('isActive')).toBe('false');
  });
});

describe('decodeAdminUsers — une ligne, champ par champ, forme figée (#8876)', () => {
  const servie = {
    id: 'u1',
    username: 'alice',
    displayName: '  Alice Martin ',
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alice@x.com',
    role: 'MODERATOR',
    isActive: true,
    isOnline: false,
    avatar: 'https://cdn.test/a.png',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastActiveAt: '2026-09-29T10:00:00.000Z',
    emailVerifiedAt: '2026-01-02T00:00:00.000Z',
    phoneVerifiedAt: null,
    twoFactorEnabledAt: '2026-02-01T00:00:00.000Z',
    lockedUntil: '2026-10-01T00:00:00.000Z',
    deactivatedAt: null,
    deletedAt: null,
    // Ce que la passerelle sert aussi, et que la liste n'a aucune raison de garder.
    lastLoginIp: '10.0.0.1',
    lastLoginDevice: 'Mozilla/5.0',
    twoFactorBackupCodesRemaining: 4,
    sessionToken: 'secret',
  };

  test('la ligne décodée a EXACTEMENT les champs affichés, et aucun champ traçant', () => {
    const [ligne] = decodeAdminUsers({ users: [servie], pagination: { total: 1 } }, 0).users;
    expect(ligne).toEqual({
      id: 'u1',
      username: 'alice',
      displayName: 'Alice Martin',
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alice@x.com',
      role: 'MODERATOR',
      isActive: true,
      isOnline: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      avatar: 'https://cdn.test/a.png',
      lastActiveAt: '2026-09-29T10:00:00.000Z',
      emailVerified: true,
      phoneVerified: false,
      twoFactorEnabled: true,
      lockedUntil: '2026-10-01T00:00:00.000Z',
      deactivatedAt: null,
      deletedAt: null,
    });
  });

  test('un compte supprimé ou désactivé porte ses dates, pour que l’état soit dit par `accountStateOf`', () => {
    const [ligne] = decodeAdminUsers(
      { users: [{ ...servie, isActive: false, deactivatedAt: '2026-05-01T00:00:00.000Z', deletedAt: '2026-06-01T00:00:00.000Z' }], pagination: { total: 1 } },
      0,
    ).users;
    expect(ligne?.deactivatedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(ligne?.deletedAt).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('loadAdminUsersPage — la forme commune des listes', () => {
  test('rend { rows, total, hasMore } et laisse un échec tel quel', async () => {
    const ok = {
      request: async () => ({ ok: true as const, data: { users: [{ id: 'u1', username: 'alice' }], pagination: { total: 41, hasMore: true } } }),
    } as unknown as HttpTransport;
    const page = await loadAdminUsersPage({ source: 'gateway', transport: ok, offset: 0, search: '' });
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.data.total).toBe(41);
    expect(page.data.hasMore).toBe(true);
    expect(page.data.rows.map((row) => [row.id, row.username, row.displayName])).toEqual([['u1', 'alice', '']]);

    const ko = { request: async () => ({ ok: false as const, status: 403, error: 'Forbidden' }) } as unknown as HttpTransport;
    expect(await loadAdminUsersPage({ source: 'gateway', transport: ko, offset: 0, search: '' })).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });
});

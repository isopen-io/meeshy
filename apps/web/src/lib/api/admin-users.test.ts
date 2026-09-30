import { describe, expect, test } from 'bun:test';

import { ADMIN_USERS_PAGE_SIZE, decodeAdminUsers, loadAdminUsers } from './admin-users';
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

  test('retombe sur le pseudo quand le nom affiché manque — jamais une ligne sans nom', () => {
    expect(decodeAdminUsers(charge(2), 0).users[1]?.displayName).toBe('bob');
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

import { describe, expect, test } from 'bun:test';

import { decodeAdminAnonymousOne, decodeAdminAnonymousPage, loadAdminAnonymous } from './admin-anonymous';
import type { HttpTransport } from './http';

/**
 * LES ANONYMES (#7873) — `GET /api/v1/admin/anonymous-users`, qui sert sa
 * pagination DANS `data` (`sendSuccess(reply, { anonymousUsers, pagination })`),
 * comme la liste des comptes.
 */

const ligne = (surcharge: Record<string, unknown> = {}) => ({
  id: 'p1',
  displayName: 'Invité 42',
  avatar: null,
  language: 'es',
  isActive: true,
  isOnline: false,
  lastActiveAt: '2026-09-20T10:00:00.000Z',
  joinedAt: '2026-09-19T10:00:00.000Z',
  leftAt: null,
  permissions: { canSendMessages: true, canSendFiles: false },
  conversationId: 'c1',
  conversation: { id: 'c1', identifier: 'mshy_club', title: 'Le club' },
  _count: { sentMessages: 12 },
  ...surcharge,
});

describe('decodeAdminAnonymousPage', () => {
  test('lit les lignes et la pagination servies dans data', () => {
    const page = decodeAdminAnonymousPage({ anonymousUsers: [ligne()], pagination: { total: 41, hasMore: true } }, 20);

    expect(page.total).toBe(41);
    expect(page.hasMore).toBe(true);
    expect(page.rows).toEqual([
      {
        id: 'p1',
        displayName: 'Invité 42',
        avatar: '',
        language: 'es',
        isActive: true,
        isOnline: false,
        lastActiveAt: '2026-09-20T10:00:00.000Z',
        joinedAt: '2026-09-19T10:00:00.000Z',
        leftAt: null,
        conversation: { id: 'c1', title: 'Le club', identifier: 'mshy_club' },
        messageCount: 12,
      },
    ]);
  });

  test('une ligne sans identifiant est écartée, un nom manquant se dit', () => {
    const page = decodeAdminAnonymousPage({ anonymousUsers: [{ displayName: 'x' }, ligne({ displayName: '' })] }, 0);
    expect(page.rows.map((r) => r.displayName)).toEqual(['—']);
  });

  test('hasMore se recalcule quand la passerelle ne le dit pas', () => {
    expect(decodeAdminAnonymousPage({ anonymousUsers: [ligne()], pagination: { total: 5 } }, 0).hasMore).toBe(true);
  });
});

describe('decodeAdminAnonymousOne', () => {
  test('lit la fiche et ses permissions booléennes', () => {
    const fiche = decodeAdminAnonymousOne({ participant: ligne() });
    expect(fiche?.permissions).toEqual([
      { key: 'canSendMessages', granted: true },
      { key: 'canSendFiles', granted: false },
    ]);
    expect(fiche?.messageCount).toBe(12);
  });

  test('une charge sans identifiant ne produit pas de fiche', () => {
    expect(decodeAdminAnonymousOne({})).toBeNull();
  });
});

describe('loadAdminAnonymous — l’adresse demandée', () => {
  test('transmet recherche, tri, ordre, état et page', async () => {
    const appels: string[] = [];
    const transport = {
      request: async (requete: { path: string }) => {
        appels.push(requete.path);
        return { ok: true as const, data: { anonymousUsers: [], pagination: { total: 0 } } };
      },
    } as unknown as HttpTransport;

    await loadAdminAnonymous({
      source: 'gateway',
      transport,
      offset: 20,
      limit: 50,
      search: ' inv ',
      sortBy: 'displayName',
      sortOrder: 'asc',
      filters: { status: 'active' },
    });

    const adresse = new URL(appels[0] ?? '', 'https://x.test');
    expect(adresse.pathname).toBe('/api/v1/admin/anonymous-users');
    expect(Object.fromEntries(adresse.searchParams)).toEqual({
      offset: '20',
      limit: '50',
      search: 'inv',
      sortBy: 'displayName',
      sortOrder: 'asc',
      status: 'active',
    });
  });
});

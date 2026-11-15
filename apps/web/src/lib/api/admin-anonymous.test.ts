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
        conversation: { id: 'c1', title: 'Le club', type: '' },
        messageCount: 12,
      },
    ]);
  });

  test('une ligne sans identifiant est écartée ; un nom manquant reste VIDE — aucun libellé fabriqué', () => {
    const page = decodeAdminAnonymousPage({ anonymousUsers: [{ displayName: 'x' }, ligne({ displayName: '  ' })] }, 0);
    expect(page.rows.map((r) => r.displayName)).toEqual(['']);
  });

  test('l’identifiant PUBLIC de la conversation n’est jamais gardé — son titre et son type seulement', () => {
    const [row] = decodeAdminAnonymousPage({ anonymousUsers: [ligne({ conversation: { id: 'c1', identifier: 'mshy_club', title: null, type: 'group' } })] }, 0).rows;
    expect(row?.conversation).toEqual({ id: 'c1', title: '', type: 'group' });
    expect(JSON.stringify(row)).not.toContain('mshy_club');
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

  test('lit la forme SERVIE, à plat, et le lien de partage par lequel l’anonyme est entré', () => {
    const fiche = decodeAdminAnonymousOne(
      ligne({ shareLink: { id: 'l1', name: 'Invitation salon', isActive: false, expiresAt: null, createdAt: '2026-09-01T00:00:00Z' } }),
    );
    expect(fiche?.shareLink).toEqual({ id: 'l1', name: 'Invitation salon', isActive: false, expiresAt: null });
    expect(decodeAdminAnonymousOne(ligne())?.shareLink).toBeNull();
  });

  test('l’échéance du lien servie est gardée ; ni son identifiant public ni ses clés de jointure ne le sont', () => {
    const fiche = decodeAdminAnonymousOne(
      ligne({ shareLink: { id: 'l1', name: ' Salon ', isActive: true, expiresAt: '2026-12-01T12:00:00.000Z', linkId: 'mshy_secret', identifier: 'mshy_join' } }),
    );
    expect(fiche?.shareLink).toEqual({ id: 'l1', name: 'Salon', isActive: true, expiresAt: '2026-12-01T12:00:00.000Z' });
    expect(JSON.stringify(fiche)).not.toContain('mshy_');
  });

  test('la fiche garde le type de la conversation, que la liste ne sert pas', () => {
    expect(decodeAdminAnonymousOne(ligne({ conversation: { id: 'c1', title: 'Le club', type: 'public' } }))?.conversation).toEqual({ id: 'c1', title: 'Le club', type: 'public' });
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

import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { describe, expect, test } from 'bun:test';

import {
  OBJECT_ID,
  servedTrackingClick,
  servedTrackingLink,
  servedTrackingLinkFiche,
  servedTrackingStats,
} from '@/lib/admin/tracking-link-fixtures';
import { resultatServi } from '@/test-support/served-pagination';

import {
  ADMIN_TRACKING_LINKS_KEY,
  adminTrackingLinkKey,
  adminTrackingLinksListKey,
  decodeAdminTrackingLink,
  decodeAdminTrackingLinkRow,
  decodeAdminTrackingStats,
  loadAdminTrackingLink,
  loadAdminTrackingLinks,
  setAdminTrackingLinkActive,
} from './admin-tracking-links';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { estClefNonPersistable } from './souverain';

/**
 * **LES LIENS DE SUIVI, DÉCODÉS CHAMP PAR CHAMP** (#8876, #6729) — la liste (V1),
 * la fiche et ses agrégats, le geste d'activation. Ce que ce décodeur NE lit PAS
 * compte autant que ce qu'il lit : **aucune adresse IP, aucun user-agent, aucune
 * empreinte d'appareil** — une ligne de clic porte une quarantaine de colonnes, la
 * passerelle en sert dix, et ce décodeur n'en garde que ces dix.
 */

function transportOf(reply: (request: HttpRequest) => ApiResult<unknown>) {
  const requests: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      requests.push(request);
      return reply(request);
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway' as const, transport }, requests };
}

const SENSITIVE = { ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone)', deviceFingerprint: 'fp-9c1', participantId: OBJECT_ID(99) };

describe('decodeAdminTrackingLinkRow — la ligne de liste', () => {
  test('garde exactement les champs affichés, le créateur et la cible NOMMÉS', () => {
    expect(decodeAdminTrackingLinkRow(servedTrackingLink())).toEqual({
      id: OBJECT_ID(1),
      name: 'Lancement de rentrée',
      campaign: 'rentree-2026',
      source: 'newsletter',
      medium: 'email',
      originalUrl: 'https://exemple.test/rentree?ref=meeshy',
      shortUrl: 'https://m.meeshy.me/l/Ab3xYz',
      targetType: 'POST',
      target: { type: 'POST', id: OBJECT_ID(4), label: 'Awa Diop' },
      conversation: null,
      creator: { id: OBJECT_ID(2), username: 'awa', displayName: 'Awa Diop', firstName: null, lastName: null, avatar: null },
      totalClicks: 1204,
      uniqueClicks: 980,
      isActive: true,
      expiresAt: '2026-12-31T23:00:00.000Z',
      lastClickedAt: '2026-09-30T11:40:00.000Z',
      createdAt: '2026-09-01T09:00:00.000Z',
    });
  });

  test('ne lit pas le jeton : l’adresse courte le porte déjà', () => {
    expect(JSON.stringify(decodeAdminTrackingLinkRow(servedTrackingLink({ token: 'SECRET-TOKEN' })))).not.toContain('SECRET-TOKEN');
  });

  test('ne recopie rien de ce que la passerelle n’a pas déclaré', () => {
    const decoded = decodeAdminTrackingLinkRow(servedTrackingLink({ ...SENSITIVE, creator: { ...servedTrackingLink().creator, email: 'x@y.z' } }));

    const serialized = JSON.stringify(decoded);
    for (const leaked of ['203.0.113.7', 'Mozilla', 'fp-9c1', 'x@y.z']) expect(serialized).not.toContain(leaked);
  });

  test('un lien externe n’a pas de cible ; une conversation liée est nommée', () => {
    const decoded = decodeAdminTrackingLinkRow(
      servedTrackingLink({ targetType: 'EXTERNAL', target: null, conversation: { id: OBJECT_ID(5), title: 'Les voisins' } }),
    );

    expect(decoded?.target).toBeNull();
    expect(decoded?.conversation).toEqual({ id: OBJECT_ID(5), title: 'Les voisins', type: null });
  });

  test('une cible disparue est servie avec un nom null, et un nom jamais inventé', () => {
    expect(decodeAdminTrackingLinkRow(servedTrackingLink({ target: { type: 'POST', id: OBJECT_ID(4), label: null } }))?.target).toEqual({
      type: 'POST',
      id: OBJECT_ID(4),
      label: null,
    });
    expect(decodeAdminTrackingLinkRow(servedTrackingLink({ target: { type: 'POST' } }))?.target).toBeNull();
  });

  test('les champs vides sont null : c’est la bibliothèque qui dit « Lien de suivi sans nom »', () => {
    const decoded = decodeAdminTrackingLinkRow(servedTrackingLink({ name: ' ', campaign: '', source: undefined, medium: null }));

    expect([decoded?.name, decoded?.campaign, decoded?.source, decoded?.medium]).toEqual([null, null, null, null]);
  });

  test('une ligne sans identifiant est illisible : écartée, jamais réparée', () => {
    expect(decodeAdminTrackingLinkRow({ ...servedTrackingLink(), id: undefined })).toBeNull();
    expect(decodeAdminTrackingLinkRow(3)).toBeNull();
  });
});

describe('decodeAdminTrackingStats — les agrégats', () => {
  test('garde les sept agrégats, les jours, les référents et les clics confirmés', () => {
    const decoded = decodeAdminTrackingStats(servedTrackingStats());

    expect(decoded.confirmedClicks).toBe(900);
    expect(decoded.clicksByDate).toEqual([
      { date: '2026-09-27', count: 10 },
      { date: '2026-09-29', count: 40 },
      { date: '2026-09-30', count: 25 },
    ]);
    expect(decoded.byCountry[0]).toEqual({ key: 'FR', count: 700 });
    expect(decoded.byRedirectStatus.map((bucket) => bucket.key)).toEqual(['confirmed', 'pending', 'failed']);
    expect(decoded.topReferrers[0]).toEqual({ referrer: 'https://newsletter.exemple.test/', count: 300 });
  });

  test('écarte un jour dont la date n’est pas un jour réel, un référent vide, un seau sans clé', () => {
    const decoded = decodeAdminTrackingStats({
      clicksByDate: [{ date: 'hier', count: 3 }, { date: '2026-09-30', count: 2 }],
      topReferrers: [{ referrer: '  ', count: 4 }, { referrer: 'https://t.co/', count: 1 }],
      byCountry: [{ count: 5 }, { key: 'FR', count: 2 }],
    });

    expect(decoded.clicksByDate).toEqual([{ date: '2026-09-30', count: 2 }]);
    expect(decoded.topReferrers).toEqual([{ referrer: 'https://t.co/', count: 1 }]);
    expect(decoded.byCountry).toEqual([{ key: 'FR', count: 2 }]);
  });

  test('une charge illisible rend des agrégats vides, jamais un plantage', () => {
    expect(decodeAdminTrackingStats(undefined)).toEqual({
      confirmedClicks: 0,
      clicksByDate: [],
      byCountry: [],
      byDevice: [],
      byBrowser: [],
      byOs: [],
      bySocialSource: [],
      byRedirectStatus: [],
      topReferrers: [],
    });
  });
});

describe('decodeAdminTrackingLink — la fiche', () => {
  test('la ligne, les agrégats, et les clics récents avec leurs dix colonnes', () => {
    const decoded = decodeAdminTrackingLink(servedTrackingLinkFiche());

    expect(decoded?.id).toBe(OBJECT_ID(1));
    expect(decoded?.stats.confirmedClicks).toBe(900);
    expect(decoded?.recentClicks).toHaveLength(2);
    expect(decoded?.recentClicks[0]).toEqual({
      id: OBJECT_ID(31),
      country: 'FR',
      city: 'Lyon',
      device: 'mobile',
      browser: 'Safari',
      os: 'iOS',
      referrer: 'https://newsletter.exemple.test/',
      socialSource: null,
      redirectStatus: 'confirmed',
      clickedAt: '2026-09-30T11:40:00.000Z',
    });
  });

  test('JAMAIS d’adresse IP, d’agent utilisateur, d’empreinte ni de participant — même si la charge en portait', () => {
    const decoded = decodeAdminTrackingLink(servedTrackingLinkFiche({ recentClicks: [servedTrackingClick({ ...SENSITIVE })] }));

    const serialized = JSON.stringify(decoded);
    for (const leaked of ['203.0.113.7', 'Mozilla', 'fp-9c1', 'ipAddress', 'userAgent', 'deviceFingerprint', 'participantId', OBJECT_ID(99)]) {
      expect(serialized).not.toContain(leaked);
    }
    expect(Object.keys(decoded?.recentClicks[0] ?? {}).sort()).toEqual([
      'browser',
      'city',
      'clickedAt',
      'country',
      'device',
      'id',
      'os',
      'redirectStatus',
      'referrer',
      'socialSource',
    ]);
  });

  test('un clic sans identifiant est écarté', () => {
    expect(decodeAdminTrackingLink(servedTrackingLinkFiche({ recentClicks: [{ country: 'FR' }, null] }))?.recentClicks).toEqual([]);
  });
});

describe('les lectures', () => {
  test('la liste passe par le catalogue, porte la requête, et lit la pagination V1 à côté de data', async () => {
    const { deps, requests } = transportOf(() => ({
      ok: true,
      status: 200,
      data: [servedTrackingLink(), { broken: true }],
      pagination: { total: 33, limit: 20, offset: 20, hasMore: true },
    }));

    const result = await loadAdminTrackingLinks({ ...deps, query: new URLSearchParams({ offset: '20', limit: '20', sort: 'totalClicks', order: 'desc' }) });

    expect(requests[0]?.path).toBe(`${adminEndpoints.trackingLinks}?offset=20&limit=20&sort=totalClicks&order=desc`);
    expect(result.ok && result.data.rows.map((row) => row.id)).toEqual([OBJECT_ID(1)]);
    expect(result.ok && { total: result.data.total, hasMore: result.data.hasMore }).toEqual({ total: 33, hasMore: true });
  });

  test('la fiche lit l’adresse de SON lien, SOUS /admin — jamais l’adresse du partageur', async () => {
    const { deps, requests } = transportOf(() => resultatServi(servedTrackingLinkFiche()));

    const result = await loadAdminTrackingLink({ ...deps, linkId: OBJECT_ID(1) });

    expect(requests[0]?.path).toBe(adminEndpoints.trackingLinksByLinkId(OBJECT_ID(1)));
    expect(requests[0]?.path.startsWith('/api/v1/admin/')).toBe(true);
    expect(result.ok && result.data.recentClicks).toHaveLength(2);
  });

  test('une charge illisible est un échec, pas une fiche vide', async () => {
    const { deps } = transportOf(() => resultatServi({ nothing: true }));

    expect((await loadAdminTrackingLink({ ...deps, linkId: OBJECT_ID(1) })).ok).toBe(false);
  });

  test('un échec du transport remonte tel quel', async () => {
    const { deps } = transportOf(() => ({ ok: false, status: 403, error: 'Forbidden' }));

    expect(await loadAdminTrackingLinks({ ...deps, query: new URLSearchParams() })).toEqual({ ok: false, status: 403, error: 'Forbidden' });
    expect(await loadAdminTrackingLink({ ...deps, linkId: OBJECT_ID(1) })).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });
});

describe('le geste d’activation', () => {
  test('désactiver : PATCH { isActive: false, reason }, un simple accusé', async () => {
    const { deps, requests } = transportOf(() => ({ ok: true, status: 200, data: { id: OBJECT_ID(1), isActive: false } }));

    const result = await setAdminTrackingLinkActive({ ...deps, linkId: OBJECT_ID(1), isActive: false, reason: 'Campagne terminée' });

    expect(requests).toEqual([
      { method: 'PATCH', path: adminEndpoints.trackingLinksByLinkId(OBJECT_ID(1)), body: { isActive: false, reason: 'Campagne terminée' } },
    ]);
    expect(result).toEqual({ ok: true, status: 200, data: { acknowledged: true } });
  });

  test('sans motif, le corps ne le porte pas (il est facultatif côté serveur)', async () => {
    const { deps, requests } = transportOf(() => ({ ok: true, status: 200, data: { id: OBJECT_ID(1), isActive: true } }));

    await setAdminTrackingLinkActive({ ...deps, linkId: OBJECT_ID(1), isActive: true, reason: null });
    await setAdminTrackingLinkActive({ ...deps, linkId: OBJECT_ID(1), isActive: true, reason: '' });

    expect(requests.map((request) => request.body)).toEqual([{ isActive: true }, { isActive: true }]);
  });

  test('un refus remonte tel quel', async () => {
    const { deps } = transportOf(() => ({ ok: false, status: 403, error: 'Forbidden' }));

    expect(await setAdminTrackingLinkActive({ ...deps, linkId: OBJECT_ID(1), isActive: false, reason: null })).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });
});

describe('les clés de requête', () => {
  test('toutes sous [admin, tracking] et JAMAIS persistées sur le disque', () => {
    for (const key of [ADMIN_TRACKING_LINKS_KEY, adminTrackingLinksListKey('sort=totalClicks'), adminTrackingLinkKey(OBJECT_ID(1))]) {
      expect(key.slice(0, 2)).toEqual(['admin', 'tracking']);
      expect(estClefNonPersistable(key)).toBe(true);
    }
  });
});

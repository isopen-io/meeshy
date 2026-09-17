import { describe, expect, test } from 'bun:test';

import { decodeAdminMediaPage, loadAdminUserMedia } from './admin-user-media';
import type { HttpTransport } from './http';
import { pageServie } from './admin';
import { resultatServi } from '@/test-support/served-pagination';

/**
 * LES MÉDIAS D'UN MEMBRE (#6819) — `GET /api/v1/admin/users/:userId/media`,
 * sous `canViewUsers` (jusqu'à AUDIT).
 *
 * ## La pagination ne voyage PAS au même niveau que celle de la liste
 *
 * Cette route passe par `sendPaginatedSuccess(reply, data, pagination)`, qui
 * pose `pagination` **à côté** de `data` dans l'enveloppe. `GET /admin/users`,
 * elle, sert sa pagination **DANS** `data` (voir `decodeAdminUsers`). Deux
 * routes voisines, deux niveaux — et lire au mauvais endroit rendrait
 * `total: 0` et `hasMore: false` : une liste qui s'arrête à la première page
 * sans que rien n'échoue.
 *
 * ## Un média protégé reste LISTÉ
 *
 * `isProtected` est calculé par le serveur ; quand il est vrai, `fileUrl` et
 * `thumbnailUrl` tombent à `null` **et l'entrée demeure**. Le décodeur ne doit
 * pas l'écarter : l'écran doit pouvoir dire « ce média existe et ne se montre
 * pas », ce qui n'est ni une erreur de chargement ni une absence.
 */

const transportEspion = (reponse: unknown, ok = true) => {
  const appels: { path: string }[] = [];
  const transport = {
    request: async (requete: { path: string }) => {
      appels.push({ path: requete.path });
      return ok ? { ok: true as const, data: reponse } : reponse;
    },
  } as unknown as HttpTransport;
  return { transport, appels };
};

const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });

const MEDIA = {
  id: 'm-1',
  originalName: 'photo.jpg',
  mimeType: 'image/jpeg',
  fileUrl: 'https://example.test/photo.jpg',
  thumbnailUrl: 'https://example.test/photo-thumb.jpg',
  fileSize: 12345,
  duration: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  source: 'post',
  contextId: 'p-1',
  isProtected: false,
};

/**
 * LA PAGE TELLE QUE LE PRODUIT LA REÇOIT (#6862, revue-correction) — l'enveloppe
 * de la passerelle passe par la MÊME conversion que `createHttpTransport`
 * (`resultatServi`) puis par la MÊME lecture que les ports (`pageServie`).
 * Passer l'enveloppe brute au décodeur laissait `pagination` là où la
 * production ne la trouve jamais : le témoin verdissait sur un chemin
 * inexistant.
 */
const servie = (enveloppe: unknown) => pageServie(resultatServi(enveloppe));

describe('decodeAdminMediaPage — la pagination est À CÔTÉ de data', () => {
  test('lit `pagination` au niveau de l’enveloppe, pas dans `data`', () => {
    const page = decodeAdminMediaPage(
      servie({ data: [MEDIA], pagination: { total: 42, offset: 20, limit: 20, hasMore: true } }),
      20,
    );

    expect(page.total).toBe(42);
    expect(page.hasMore).toBe(true);
    expect(page.medias).toHaveLength(1);
  });

  test('sans pagination servie, `hasMore` se recalcule depuis l’offset et le rendu', () => {
    const page = decodeAdminMediaPage(servie({ data: [MEDIA] }), 0);

    expect(page.total).toBe(1);
    expect(page.hasMore).toBe(false);
  });
});

describe('decodeAdminMediaPage — un média protégé reste listé', () => {
  test('garde l’entrée, avec ses URL à null et son drapeau', () => {
    const page = decodeAdminMediaPage(servie(
      { data: [{ ...MEDIA, id: 'm-2', fileUrl: null, thumbnailUrl: null, isProtected: true }] }),
      0,
    );

    expect(page.medias).toHaveLength(1);
    expect(page.medias[0]?.isProtected).toBe(true);
    expect(page.medias[0]?.fileUrl).toBeNull();
  });

  test('distingue la SOURCE — un média de post n’est pas un média de message', () => {
    const page = decodeAdminMediaPage(servie({ data: [MEDIA, { ...MEDIA, id: 'm-3', source: 'message' }] }), 0);

    expect(page.medias.map((m) => m.source)).toEqual(['post', 'message']);
  });

  test('une source inconnue retombe sur `post` plutôt que d’écarter l’entrée', () => {
    const page = decodeAdminMediaPage(servie({ data: [{ ...MEDIA, source: 'autre' }] }), 0);

    expect(page.medias[0]?.source).toBe('post');
  });

  test('écarte les entrées sans identifiant', () => {
    expect(decodeAdminMediaPage(servie({ data: [{ originalName: 'sans-id' }] }), 0).medias).toHaveLength(0);
    expect(decodeAdminMediaPage(servie(null), 0).medias).toEqual([]);
  });
});

describe('loadAdminUserMedia — l’adresse demandée', () => {
  test('vise /api/v1/admin/users/:userId/media avec offset et limit, identifiant ENCODÉ', async () => {
    const { transport, appels } = transportEspion({ data: [] });

    await loadAdminUserMedia({ ...deps(transport), userId: 'u 1/x', offset: 40 });

    expect(appels[0]?.path).toContain(`/api/v1/admin/users/${encodeURIComponent('u 1/x')}/media`);
    expect(appels[0]?.path).toContain('offset=40');
    expect(appels[0]?.path).not.toContain('page=');
  });

  test('propage un refus TEL QUEL', async () => {
    const { transport } = transportEspion({ ok: false as const, status: 403, error: 'Forbidden' }, false);

    const resultat = await loadAdminUserMedia({ ...deps(transport), userId: 'u-1', offset: 0 });

    expect(resultat.ok).toBe(false);
    expect(!resultat.ok && resultat.status).toBe(403);
  });
});

import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { describe, expect, test } from 'bun:test';

import { OBJECT_ID, servedShareLink, servedShareLinkFiche } from '@/lib/admin/share-link-fixtures';
import { resultatServi } from '@/test-support/served-pagination';

import {
  ADMIN_SHARE_LINKS_KEY,
  adminShareLinkKey,
  adminShareLinksListKey,
  closeAdminShareLink,
  decodeAdminShareLink,
  decodeAdminShareLinkRow,
  decodeAdminShareLinkSecret,
  loadAdminShareLink,
  loadAdminShareLinks,
  reopenAdminShareLink,
  revealAdminShareLink,
} from './admin-share-links';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { estClefNonPersistable } from './souverain';

/**
 * **LES LIENS DE PARTAGE, DÉCODÉS CHAMP PAR CHAMP** (#8876, #6729) — la liste
 * (pagination V1 à côté de `data`), la fiche, les trois gestes. Ce que ce décodeur
 * NE lit PAS compte autant que ce qu'il lit : `linkId`, `identifier` (clés de
 * jointure : qui les tient entre dans la conversation) et `allowedIpRanges` (où se
 * trouvent les invités attendus) ne sont dans AUCUNE valeur décodée, quoi que la
 * charge porte un jour.
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

const SECRETS = { linkId: 'mshy_AbCd1234', identifier: 'mshy_voisins-7k2', allowedIpRanges: ['203.0.113.0/24'] };

describe('decodeAdminShareLinkRow — la ligne de liste', () => {
  test('garde exactement les champs affichés, la conversation et le créateur NOMMÉS', () => {
    expect(decodeAdminShareLinkRow(servedShareLink())).toEqual({
      id: OBJECT_ID(1),
      name: 'Soirée du vendredi',
      description: 'Le lien posté dans le groupe des voisins',
      maxUses: 50,
      currentUses: 12,
      expiresAt: '2026-10-15T18:00:00.000Z',
      isActive: true,
      createdAt: '2026-09-20T09:00:00.000Z',
      creator: { id: OBJECT_ID(2), username: 'awa', displayName: 'Awa Diop', firstName: null, lastName: null, avatar: null },
      conversation: { id: OBJECT_ID(3), title: 'Les voisins', type: 'group' },
      guestCount: 7,
    });
  });

  test('ne lit ni linkId, ni identifier, ni allowedIpRanges — même si la charge les porte', () => {
    const decoded = decodeAdminShareLinkRow(servedShareLink({ ...SECRETS }));

    const serialized = JSON.stringify(decoded);
    for (const leaked of ['mshy_AbCd1234', 'mshy_voisins', '203.0.113', 'linkId', 'identifier', 'allowedIpRanges']) expect(serialized).not.toContain(leaked);
  });

  test('ne recopie rien d’autre que ce que l’écran montre (colonnes voisines de la ligne, du créateur, de la conversation)', () => {
    const decoded = decodeAdminShareLinkRow(
      servedShareLink({
        ipAddress: '203.0.113.7',
        creator: servedShareLink().creator && { ...servedShareLink().creator, email: 'x@y.z', passwordHash: 'secret' },
        conversation: { ...servedShareLink().conversation, encryptionKey: 'k' },
      }),
    );

    const serialized = JSON.stringify(decoded);
    for (const leaked of ['203.0.113.7', 'x@y.z', 'secret', 'encryptionKey', 'mshy_voisins']) expect(serialized).not.toContain(leaked);
  });

  test('un nom vide ou blanc devient null : c’est la bibliothèque qui dit « Lien sans nom »', () => {
    expect(decodeAdminShareLinkRow(servedShareLink({ name: '  ' }))?.name).toBeNull();
    expect(decodeAdminShareLinkRow(servedShareLink({ name: undefined }))?.name).toBeNull();
  });

  test('sans limite d’utilisation, maxUses est null — pas zéro', () => {
    expect(decodeAdminShareLinkRow(servedShareLink({ maxUses: null }))?.maxUses).toBeNull();
    expect(decodeAdminShareLinkRow(servedShareLink({ maxUses: undefined }))?.maxUses).toBeNull();
  });

  test('sans compteur d’invités servi, zéro invité', () => {
    expect(decodeAdminShareLinkRow(servedShareLink({ _count: undefined }))?.guestCount).toBe(0);
  });

  test('une ligne sans identifiant est illisible : écartée, jamais réparée', () => {
    expect(decodeAdminShareLinkRow({ ...servedShareLink(), id: undefined })).toBeNull();
    expect(decodeAdminShareLinkRow(null)).toBeNull();
  });

  test('un créateur ou une conversation sans identifiant n’est pas fabriqué', () => {
    const decoded = decodeAdminShareLinkRow(servedShareLink({ creator: { username: 'fantome' }, conversation: { title: 'Orpheline' } }));

    expect(decoded?.creator).toBeNull();
    expect(decoded?.conversation).toBeNull();
  });
});

describe('decodeAdminShareLink — la fiche', () => {
  test('garde l’usage, les permissions, les exigences, les restrictions et les invités récents', () => {
    const decoded = decodeAdminShareLink(servedShareLinkFiche());

    expect(decoded).toMatchObject({
      id: OBJECT_ID(1),
      visitCount: 41,
      maxConcurrentUsers: null,
      currentConcurrentUsers: 2,
      maxUniqueSessions: 30,
      currentUniqueSessions: 9,
      allowAnonymousMessages: true,
      allowAnonymousFiles: false,
      allowAnonymousImages: true,
      allowViewHistory: false,
      requireAccount: false,
      requireNickname: true,
      requireEmail: false,
      requireBirthday: false,
      allowedCountries: ['FR', 'SN'],
      allowedLanguages: ['fr', 'wo'],
      updatedAt: '2026-09-28T10:00:00.000Z',
    });
    expect(decoded?.recentGuests).toEqual([
      { id: OBJECT_ID(21), displayName: 'Invité Koffi', avatar: null, joinedAt: '2026-09-30T11:00:00.000Z', isActive: true },
      { id: OBJECT_ID(22), displayName: null, avatar: null, joinedAt: '2026-09-29T08:00:00.000Z', isActive: false },
    ]);
  });

  test('une permission absente de la charge reste inconnue (null) — jamais un « non » inventé', () => {
    const decoded = decodeAdminShareLink(servedShareLinkFiche({ allowViewHistory: undefined, requireEmail: 'oui' }));

    expect(decoded?.allowViewHistory).toBeNull();
    expect(decoded?.requireEmail).toBeNull();
  });

  test('ne lit ni linkId, ni identifier, ni allowedIpRanges', () => {
    const serialized = JSON.stringify(decodeAdminShareLink(servedShareLinkFiche({ ...SECRETS })));

    for (const leaked of ['mshy_AbCd1234', 'mshy_voisins', '203.0.113', 'linkId', 'allowedIpRanges']) expect(serialized).not.toContain(leaked);
  });

  test('un invité sans identifiant est écarté ; les listes de pays et de langues ne gardent que du texte', () => {
    const decoded = decodeAdminShareLink(
      servedShareLinkFiche({ recentGuests: [{ displayName: 'Sans id' }, null], allowedCountries: ['FR', 3, '', null], allowedLanguages: 'fr' }),
    );

    expect(decoded?.recentGuests).toEqual([]);
    expect(decoded?.allowedCountries).toEqual(['FR']);
    expect(decoded?.allowedLanguages).toEqual([]);
  });
});

describe('decodeAdminShareLinkSecret', () => {
  test('ne garde que les deux clés, et refuse une charge qui n’en porte pas deux', () => {
    expect(decodeAdminShareLinkSecret({ id: OBJECT_ID(1), linkId: 'mshy_AbCd1234', identifier: 'mshy_voisins-7k2' })).toEqual({
      linkId: 'mshy_AbCd1234',
      identifier: 'mshy_voisins-7k2',
    });
    expect(decodeAdminShareLinkSecret({ linkId: 'mshy_AbCd1234' })).toBeNull();
    expect(decodeAdminShareLinkSecret('x')).toBeNull();
  });
});

describe('les lectures', () => {
  test('la liste passe par le catalogue, porte la requête, et lit la pagination V1 à côté de data', async () => {
    const { deps, requests } = transportOf(() => ({
      ok: true,
      status: 200,
      data: [servedShareLink(), { broken: true }],
      pagination: { total: 61, limit: 20, offset: 20, hasMore: true },
    }));

    const result = await loadAdminShareLinks({ ...deps, query: new URLSearchParams({ offset: '20', limit: '20', isActive: 'true' }) });

    expect(requests[0]?.path).toBe(`${adminEndpoints.shareLinks}?offset=20&limit=20&isActive=true`);
    expect(result.ok && result.data.rows.map((row) => row.id)).toEqual([OBJECT_ID(1)]);
    expect(result.ok && { total: result.data.total, hasMore: result.data.hasMore }).toEqual({ total: 61, hasMore: true });
  });

  test('la fiche lit l’adresse de SON lien ; une charge illisible est un échec, pas une fiche vide', async () => {
    const good = transportOf(() => resultatServi(servedShareLinkFiche()));
    const readable = await loadAdminShareLink({ ...good.deps, shareLinkId: OBJECT_ID(1) });
    expect(good.requests[0]?.path).toBe(adminEndpoints.shareLinksById(OBJECT_ID(1)));
    expect(readable.ok && readable.data.recentGuests).toHaveLength(2);

    const bad = transportOf(() => resultatServi({ nothing: true }));
    expect((await loadAdminShareLink({ ...bad.deps, shareLinkId: OBJECT_ID(1) })).ok).toBe(false);
  });

  test('un échec du transport remonte tel quel', async () => {
    const { deps } = transportOf(() => ({ ok: false, status: 403, error: 'Forbidden' }));

    expect(await loadAdminShareLinks({ ...deps, query: new URLSearchParams() })).toEqual({ ok: false, status: 403, error: 'Forbidden' });
    expect(await loadAdminShareLink({ ...deps, shareLinkId: OBJECT_ID(1) })).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });
});

describe('les gestes', () => {
  test('fermer : DELETE sur SON lien, un simple accusé', async () => {
    const { deps, requests } = transportOf(() => ({ ok: true, status: 200, data: { id: OBJECT_ID(1), isActive: false } }));

    const result = await closeAdminShareLink({ ...deps, shareLinkId: OBJECT_ID(1) });

    expect(requests).toEqual([{ method: 'DELETE', path: adminEndpoints.shareLinksById(OBJECT_ID(1)) }]);
    expect(result).toEqual({ ok: true, status: 200, data: { acknowledged: true } });
  });

  test('rouvrir : PATCH { active: true }, la seule valeur que la route admet', async () => {
    const { deps, requests } = transportOf(() => ({ ok: true, status: 200, data: { id: OBJECT_ID(1), isActive: true } }));

    const result = await reopenAdminShareLink({ ...deps, shareLinkId: OBJECT_ID(1) });

    expect(requests).toEqual([{ method: 'PATCH', path: adminEndpoints.shareLinksById(OBJECT_ID(1)), body: { active: true } }]);
    expect(result.ok).toBe(true);
  });

  test('révéler : POST avec le motif écrit, et le résultat est les deux clés — rien d’autre', async () => {
    const { deps, requests } = transportOf(() => ({ ok: true, status: 200, data: { id: OBJECT_ID(1), linkId: 'mshy_AbCd1234', identifier: 'mshy_voisins-7k2', extra: 'x' } }));

    const result = await revealAdminShareLink({ ...deps, shareLinkId: OBJECT_ID(1), reason: 'Support : le propriétaire a perdu son lien' });

    expect(requests).toEqual([
      { method: 'POST', path: adminEndpoints.shareLinksByIdReveal(OBJECT_ID(1)), body: { reason: 'Support : le propriétaire a perdu son lien' } },
    ]);
    expect(result.ok && result.data).toEqual({ linkId: 'mshy_AbCd1234', identifier: 'mshy_voisins-7k2' });
  });

  test('révéler : une charge sans clés est un échec, pas un secret vide', async () => {
    const { deps } = transportOf(() => ({ ok: true, status: 200, data: { id: OBJECT_ID(1) } }));

    expect((await revealAdminShareLink({ ...deps, shareLinkId: OBJECT_ID(1), reason: 'Un motif assez long' })).ok).toBe(false);
  });

  test('un refus (403, 404) remonte tel quel', async () => {
    const { deps } = transportOf(() => ({ ok: false, status: 404, error: 'Lien de partage non trouvé' }));

    expect(await closeAdminShareLink({ ...deps, shareLinkId: OBJECT_ID(1) })).toEqual({ ok: false, status: 404, error: 'Lien de partage non trouvé' });
    expect(await revealAdminShareLink({ ...deps, shareLinkId: OBJECT_ID(1), reason: 'Un motif assez long' })).toEqual({
      ok: false,
      status: 404,
      error: 'Lien de partage non trouvé',
    });
  });
});

describe('les clés de requête', () => {
  test('toutes sous [admin, shareLink] et JAMAIS persistées sur le disque', () => {
    for (const key of [ADMIN_SHARE_LINKS_KEY, adminShareLinksListKey('isActive=true'), adminShareLinkKey(OBJECT_ID(1))]) {
      expect(key.slice(0, 2)).toEqual(['admin', 'shareLink']);
      expect(estClefNonPersistable(key)).toBe(true);
    }
  });
});

import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { describe, expect, test } from 'bun:test';

import { OBJECT_ID, servedInvitation, servedInvitationDays, servedInvitationFiche, servedInvitationStats } from '@/lib/admin/invitation-fixtures';
import { resultatServi } from '@/test-support/served-pagination';

import {
  ADMIN_INVITATIONS_KEY,
  adminInvitationKey,
  adminInvitationsListKey,
  cancelAdminInvitation,
  decodeAdminInvitation,
  decodeAdminInvitationDays,
  decodeAdminInvitationRow,
  decodeAdminInvitationStats,
  loadAdminInvitation,
  loadAdminInvitationDays,
  loadAdminInvitationStats,
  loadAdminInvitations,
} from './admin-invitations';
import { estClefNonPersistable } from './souverain';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * **LES DEMANDES DE CONTACT, DÉCODÉES CHAMP PAR CHAMP** (#8876, #6729) — la liste
 * (pagination imbriquée), la fiche, le bandeau et la courbe. Ce que ce décodeur
 * NE recopie pas compte autant que ce qu'il garde : l'adresse e-mail des deux
 * membres (servie par la fiche), le texte du message dans la LISTE, le `byType`
 * qui est en réalité une répartition par statut.
 */

type Seen = { readonly requests: HttpRequest[] };

function transportOf(reply: (request: HttpRequest) => ApiResult<unknown>): { readonly deps: { readonly source: 'gateway'; readonly transport: HttpTransport }; readonly seen: Seen } {
  const requests: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      requests.push(request);
      return reply(request);
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, seen: { requests } };
}

describe('decodeAdminInvitationRow — la ligne de liste', () => {
  test('garde exactement les champs affichés, et ne retient du message que sa présence', () => {
    expect(decodeAdminInvitationRow(servedInvitation())).toEqual({
      id: OBJECT_ID(1),
      status: 'pending',
      hasMessage: true,
      createdAt: '2026-09-29T10:00:00.000Z',
      updatedAt: '2026-09-29T10:00:00.000Z',
      sender: { id: OBJECT_ID(2), username: 'awa', displayName: 'Awa Diop', firstName: null, lastName: null, avatar: null },
      receiver: { id: OBJECT_ID(3), username: 'jean', displayName: 'Jean Dupont', firstName: null, lastName: null, avatar: null },
    });
  });

  test('sans message servi, la demande n’en a pas ; un message blanc non plus', () => {
    expect(decodeAdminInvitationRow(servedInvitation({ message: undefined }))?.hasMessage).toBe(false);
    expect(decodeAdminInvitationRow(servedInvitation({ message: '   ' }))?.hasMessage).toBe(false);
  });

  test('ne recopie rien de ce que la passerelle n’a pas déclaré (texte du message, voisins de la personne)', () => {
    const decoded = decodeAdminInvitationRow(
      servedInvitation({ message: 'Un texte privé', ipAddress: '203.0.113.7', sender: { ...servedInvitation().sender, email: 'x@y.z', passwordHash: 'secret' } }),
    );

    const serialized = JSON.stringify(decoded);
    for (const leaked of ['Un texte privé', '203.0.113.7', 'x@y.z', 'secret']) expect(serialized).not.toContain(leaked);
  });

  test('une ligne sans identifiant est illisible : écartée, jamais réparée', () => {
    expect(decodeAdminInvitationRow({ ...servedInvitation(), id: undefined })).toBeNull();
    expect(decodeAdminInvitationRow('x')).toBeNull();
  });

  test('une personne sans identifiant n’est pas fabriquée', () => {
    expect(decodeAdminInvitationRow(servedInvitation({ sender: { username: 'fantome' } }))?.sender).toBeNull();
  });
});

describe('decodeAdminInvitation — la fiche', () => {
  test('garde le texte du message, le prénom et le nom — et JAMAIS l’adresse e-mail', () => {
    const decoded = decodeAdminInvitation(servedInvitationFiche());

    expect(decoded?.message).toBe('Salut, on s’est croisés hier');
    expect(decoded?.sender).toEqual({ id: OBJECT_ID(2), username: 'awa', displayName: 'Awa Diop', firstName: 'Awa', lastName: 'Diop', avatar: null });
    expect(JSON.stringify(decoded)).not.toContain('exemple.test');
    expect(Object.keys(decoded?.receiver ?? {}).sort()).toEqual(['avatar', 'displayName', 'firstName', 'id', 'lastName', 'username']);
  });

  test('sans message, la fiche le dit par null', () => {
    expect(decodeAdminInvitation(servedInvitationFiche({ message: undefined }))?.message).toBeNull();
  });
});

describe('decodeAdminInvitationStats — le bandeau', () => {
  test('lit les six compteurs, le taux d’acceptation restant en POURCENTAGE, et laisse byType', () => {
    const decoded = decodeAdminInvitationStats(servedInvitationStats());

    expect(decoded).toEqual({ total: 120, pending: 12, accepted: 80, rejected: 28, recent: 9, acceptanceRate: 67 });
    expect(Object.keys(decoded)).not.toContain('byType');
  });

  test('une charge illisible rend des zéros, jamais des NaN', () => {
    expect(decodeAdminInvitationStats('x')).toEqual({ total: 0, pending: 0, accepted: 0, rejected: 0, recent: 0, acceptanceRate: 0 });
  });
});

describe('decodeAdminInvitationDays — la courbe', () => {
  test('garde les jours UTC réels, dans l’ordre servi', () => {
    const days = decodeAdminInvitationDays(servedInvitationDays());

    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: '2026-09-24', sent: 1, accepted: 1, rejected: 0 });
  });

  test('écarte une ligne dont la date n’est pas un jour — aucun point à un jour inventé', () => {
    expect(decodeAdminInvitationDays([{ date: 'lundi', sent: 3 }, { date: '2026-09-30', sent: 2, accepted: 1, rejected: 0 }, null])).toEqual([
      { date: '2026-09-30', sent: 2, accepted: 1, rejected: 0 },
    ]);
    expect(decodeAdminInvitationDays({ not: 'an array' })).toEqual([]);
  });
});

describe('les lectures — chemins du catalogue, forme imbriquée', () => {
  test('la liste passe par le catalogue, porte la requête, et plie la pagination IMBRIQUÉE', async () => {
    const { deps, seen } = transportOf(() =>
      resultatServi({ data: { invitations: [servedInvitation(), { broken: true }], pagination: { total: 41, offset: 20, limit: 20, hasMore: true } } }),
    );

    const result = await loadAdminInvitations({ ...deps, query: new URLSearchParams({ offset: '20', limit: '20', status: 'pending' }) });

    expect(seen.requests[0]?.path).toBe(`${adminEndpoints.invitations}?offset=20&limit=20&status=pending`);
    expect(result.ok && result.data.rows.map((row) => row.id)).toEqual([OBJECT_ID(1)]);
    expect(result.ok && { total: result.data.total, hasMore: result.data.hasMore }).toEqual({ total: 41, hasMore: true });
  });

  test('la fiche lit l’adresse de SA demande ; une charge illisible est un échec, pas une fiche vide', async () => {
    const good = transportOf(() => resultatServi(servedInvitationFiche()));
    const readable = await loadAdminInvitation({ ...good.deps, invitationId: OBJECT_ID(1) });
    expect(good.seen.requests[0]?.path).toBe(adminEndpoints.invitationsById(OBJECT_ID(1)));
    expect(readable.ok && readable.data.message).toBe('Salut, on s’est croisés hier');

    const bad = transportOf(() => resultatServi({ nothing: true }));
    const unreadable = await loadAdminInvitation({ ...bad.deps, invitationId: OBJECT_ID(1) });
    expect(unreadable.ok).toBe(false);
  });

  test('un échec du transport remonte tel quel', async () => {
    const { deps } = transportOf(() => ({ ok: false, status: 403, error: 'Forbidden' }));

    expect(await loadAdminInvitations({ ...deps, query: new URLSearchParams() })).toEqual({ ok: false, status: 403, error: 'Forbidden' });
    expect((await loadAdminInvitationStats(deps)).ok).toBe(false);
    expect((await loadAdminInvitationDays(deps)).ok).toBe(false);
  });

  test('le bandeau et la courbe lisent leurs adresses', async () => {
    const stats = transportOf(() => resultatServi(servedInvitationStats()));
    await loadAdminInvitationStats(stats.deps);
    expect(stats.seen.requests[0]?.path).toBe(adminEndpoints.invitationsStats);

    const days = transportOf(() => resultatServi(servedInvitationDays()));
    const result = await loadAdminInvitationDays(days.deps);
    expect(days.seen.requests[0]?.path).toBe(adminEndpoints.invitationsTimelineDaily);
    expect(result.ok && result.data).toHaveLength(7);
  });
});

describe('le geste « annuler la demande »', () => {
  test('PATCH { status: "rejected" } — jamais « accepted » — et un simple accusé, rien de la ligne rendue', async () => {
    const { deps, seen } = transportOf(() => ({ ok: true, status: 200, data: servedInvitationFiche({ status: 'rejected' }) }));

    const result = await cancelAdminInvitation({ ...deps, invitationId: OBJECT_ID(1) });

    expect(seen.requests).toEqual([{ method: 'PATCH', path: adminEndpoints.invitationsById(OBJECT_ID(1)), body: { status: 'rejected' } }]);
    expect(result).toEqual({ ok: true, status: 200, data: { acknowledged: true } });
  });

  test('un refus remonte tel quel', async () => {
    const { deps } = transportOf(() => ({ ok: false, status: 404, error: 'Invitation non trouvée' }));

    expect(await cancelAdminInvitation({ ...deps, invitationId: OBJECT_ID(1) })).toEqual({ ok: false, status: 404, error: 'Invitation non trouvée' });
  });
});

describe('les clés de requête', () => {
  test('toutes sous [admin, invitation] et JAMAIS persistées sur le disque', () => {
    for (const key of [ADMIN_INVITATIONS_KEY, adminInvitationsListKey('status=pending'), adminInvitationKey(OBJECT_ID(1))]) {
      expect(key.slice(0, 2)).toEqual(['admin', 'invitation']);
      expect(estClefNonPersistable(key)).toBe(true);
    }
  });
});

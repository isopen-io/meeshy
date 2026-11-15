import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { describe, expect, test } from 'bun:test';

import { OBJECT_ID, servedAuditEntry, servedAuditPerson } from '@/lib/admin/audit-fixtures';
import { resultatServi } from '@/test-support/served-pagination';

import { ADMIN_AUDIT_KEY, adminAuditListKey, decodeAdminAuditEntry, loadAdminAuditLogs } from './admin-audit';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { estClefNonPersistable, estClefSouveraine } from './souverain';

/**
 * **LE JOURNAL D'AUDIT, DÉCODÉ CHAMP PAR CHAMP** (#8876, #6727) — la forme figée de
 * chaque entrée, les changements, l'adresse IP et le navigateur absents par défaut.
 * Ce que ce décodeur NE lit PAS compte autant que ce qu'il lit : le journal est la
 * donnée la plus sensible de l'administration, il ne recopie rien de ce que la
 * passerelle n'a pas déclaré.
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

describe('decodeAdminAuditEntry — la forme figée', () => {
  test('garde exactement les champs affichés : administrateur, sujet et cible NOMMÉS, motif, changements', () => {
    expect(decodeAdminAuditEntry(servedAuditEntry())).toEqual({
      id: OBJECT_ID(1),
      action: 'UPDATE_ROLE',
      createdAt: '2026-09-30T11:40:00.000Z',
      admin: { id: OBJECT_ID(2), username: 'awa', displayName: 'Awa Diop', avatar: null },
      subject: { id: OBJECT_ID(3), username: 'jean', displayName: 'Jean Martin', avatar: null },
      target: { type: 'User', id: OBJECT_ID(3), label: 'Jean Martin', secondary: '@jean', members: null },
      reason: 'Promotion validée par le comité',
      changes: [{ field: 'role', before: 'USER', after: 'MODERATOR' }],
      ipAddress: null,
      userAgent: null,
    });
  });

  test('l’adresse IP et le navigateur sont null quand la passerelle ne les sert pas', () => {
    const decoded = decodeAdminAuditEntry(servedAuditEntry());

    expect(decoded?.ipAddress).toBeNull();
    expect(decoded?.userAgent).toBeNull();
  });

  test('l’adresse IP et le navigateur sont gardés quand la passerelle les sert', () => {
    const decoded = decodeAdminAuditEntry(servedAuditEntry({ ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone)' }));

    expect(decoded?.ipAddress).toBe('203.0.113.7');
    expect(decoded?.userAgent).toBe('Mozilla/5.0 (iPhone)');
  });

  test('les changements servis masqués restent masqués tels que servis', () => {
    const decoded = decodeAdminAuditEntry(servedAuditEntry({ changes: [{ field: 'email', before: '•••', after: '•••' }] }));

    expect(decoded?.changes).toEqual([{ field: 'email', before: '•••', after: '•••' }]);
  });

  test('un changement sans valeur avant ou après garde null, jamais une chaîne inventée', () => {
    const decoded = decodeAdminAuditEntry(servedAuditEntry({ changes: [{ field: 'configs', before: null, after: '12' }] }));

    expect(decoded?.changes).toEqual([{ field: 'configs', before: null, after: '12' }]);
  });

  test('des changements illisibles sont null ; un changement sans champ est écarté, jamais réparé', () => {
    expect(decodeAdminAuditEntry(servedAuditEntry({ changes: null }))?.changes).toBeNull();
    expect(decodeAdminAuditEntry(servedAuditEntry({ changes: 'oops' }))?.changes).toBeNull();
    expect(
      decodeAdminAuditEntry(servedAuditEntry({ changes: [{ before: 'a', after: 'b' }, { field: 'role', before: 'USER', after: 'ADMIN' }] }))?.changes,
    ).toEqual([{ field: 'role', before: 'USER', after: 'ADMIN' }]);
  });

  test('une valeur non textuelle dans un changement est écartée en null : le décodeur ne fabrique pas de texte', () => {
    const decoded = decodeAdminAuditEntry(servedAuditEntry({ changes: [{ field: 'role', before: { x: 1 }, after: 4 }] }));

    expect(decoded?.changes).toEqual([{ field: 'role', before: null, after: null }]);
  });

  test('un administrateur absent (système, compte supprimé) est null ; un sujet absent aussi', () => {
    const decoded = decodeAdminAuditEntry(servedAuditEntry({ admin: null, subject: null }));

    expect(decoded?.admin).toBeNull();
    expect(decoded?.subject).toBeNull();
  });

  test('une personne sans identifiant est illisible : elle devient null, jamais une personne inventée', () => {
    expect(decodeAdminAuditEntry(servedAuditEntry({ admin: { username: 'awa', displayName: 'Awa' } }))?.admin).toBeNull();
  });

  test('le motif vide est null : c’est l’écran qui dit « Aucun motif consigné »', () => {
    expect(decodeAdminAuditEntry(servedAuditEntry({ reason: '  ' }))?.reason).toBeNull();
    expect(decodeAdminAuditEntry(servedAuditEntry({ reason: null }))?.reason).toBeNull();
  });

  test('une cible sans libellé garde label null — jamais l’identifiant en guise de nom', () => {
    const decoded = decodeAdminAuditEntry(servedAuditEntry({ target: { type: 'Conversation', id: OBJECT_ID(9), label: null, secondary: null } }));

    expect(decoded?.target).toEqual({ type: 'Conversation', id: OBJECT_ID(9), label: null, secondary: null, members: null });
  });

  test('une conversation sans titre garde de quoi se nommer par ses membres — nom et pseudo seulement (#8876)', () => {
    const decoded = decodeAdminAuditEntry(
      servedAuditEntry({
        target: {
          type: 'Conversation',
          id: OBJECT_ID(9),
          label: null,
          secondary: 'direct',
          participants: [{ displayName: 'Awa Diop', username: 'awa', avatar: 'https://cdn/awa.png' }],
          total: 4,
        },
      }),
    );

    expect(decoded?.target.members).toEqual({ participants: [{ displayName: 'Awa Diop', username: 'awa' }], total: 4 });
    expect(JSON.stringify(decoded)).not.toContain('cdn');
  });

  test('une date illisible est null, jamais « Invalid Date »', () => {
    expect(decodeAdminAuditEntry(servedAuditEntry({ createdAt: 'hier' }))?.createdAt).toBeNull();
  });

  test('ne recopie rien de ce que la passerelle n’a pas déclaré : métadonnées, jetons, clés voisines', () => {
    const decoded = decodeAdminAuditEntry(
      servedAuditEntry({
        metadata: '{"secret":"S3CRET"}',
        token: 'TOKEN-SECRET',
        passwordHash: 'HASH',
        admin: { ...servedAuditPerson(2), email: 'awa@exemple.test', role: 'BIGBOSS' },
      }),
    );

    const serialized = JSON.stringify(decoded);
    for (const leaked of ['S3CRET', 'TOKEN-SECRET', 'HASH', 'awa@exemple.test', 'BIGBOSS']) expect(serialized).not.toContain(leaked);
  });

  test('une entrée sans identifiant ou sans action est illisible : écartée, jamais réparée', () => {
    expect(decodeAdminAuditEntry(servedAuditEntry({ id: undefined }))).toBeNull();
    expect(decodeAdminAuditEntry(servedAuditEntry({ action: '' }))).toBeNull();
    expect(decodeAdminAuditEntry(servedAuditEntry({ target: null }))).toBeNull();
    expect(decodeAdminAuditEntry(7)).toBeNull();
  });
});

describe('loadAdminAuditLogs — la lecture paginée', () => {
  test('lit l’adresse du catalogue, avec la requête telle qu’écrite', async () => {
    const { deps, requests } = transportOf(() => resultatServi({ data: [], pagination: { total: 0, limit: 30, offset: 0, hasMore: false } }));

    await loadAdminAuditLogs({ ...deps, query: new URLSearchParams({ offset: '0', limit: '30', order: 'desc' }) });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.path).toBe(`${adminEndpoints.auditLogs}?offset=0&limit=30&order=desc`);
  });

  test('la pagination se lit À CÔTÉ des lignes : total et hasMore du serveur', async () => {
    const { deps } = transportOf(() =>
      resultatServi({
        data: [servedAuditEntry(), servedAuditEntry({ id: OBJECT_ID(5) })],
        pagination: { total: 75, limit: 30, offset: 0, hasMore: true },
      }),
    );

    const result = await loadAdminAuditLogs({ ...deps, query: new URLSearchParams() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows.map((row) => row.id)).toEqual([OBJECT_ID(1), OBJECT_ID(5)]);
    expect(result.data.total).toBe(75);
    expect(result.data.hasMore).toBe(true);
  });

  test('une ligne illisible est écartée sans écarter la page', async () => {
    const { deps } = transportOf(() =>
      resultatServi({ data: [servedAuditEntry(), { action: 'X' }], pagination: { total: 2, limit: 30, offset: 0, hasMore: false } }),
    );

    const result = await loadAdminAuditLogs({ ...deps, query: new URLSearchParams() });

    expect(result.ok && result.data.rows).toHaveLength(1);
  });

  test('un refus de la passerelle remonte tel quel', async () => {
    const { deps } = transportOf(() => ({ ok: false, status: 403, error: 'Forbidden' }));

    const result = await loadAdminAuditLogs({ ...deps, query: new URLSearchParams() });

    expect(result).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });
});

describe('les clés de requête — du journal, donc souveraines : jamais écrites sur le disque', () => {
  test('la clé de liste descend du préfixe souverain', () => {
    const key = adminAuditListKey('family=security');

    expect(key[0]).toBe('admin-souverain');
    expect(estClefSouveraine(key)).toBe(true);
    expect(estClefNonPersistable(key)).toBe(true);
    expect(estClefNonPersistable(ADMIN_AUDIT_KEY)).toBe(true);
  });

  test('la clé porte l’adresse de la liste : deux filtres, deux entrées', () => {
    expect(adminAuditListKey('a=1')).not.toEqual(adminAuditListKey('a=2'));
    expect(adminAuditListKey('a=1').slice(0, ADMIN_AUDIT_KEY.length)).toEqual([...ADMIN_AUDIT_KEY]);
  });
});

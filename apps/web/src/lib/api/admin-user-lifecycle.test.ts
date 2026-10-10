import { describe, expect, test } from 'bun:test';

import { deleteAdminUser, restoreAdminUser } from './admin-user-lifecycle';
import type { HttpTransport } from './http';

/**
 * SUPPRIMER ET RESTAURER UN COMPTE (audit 2026-10-04) — les adresses du
 * catalogue, l'identifiant encodé, le motif qui ne part qu'écrit, et la fiche
 * relue que la restauration sert.
 */
const espion = (reponse: { readonly ok: boolean; readonly data?: unknown; readonly status?: number; readonly error?: string }) => {
  const appels: { path: string; method: string; body: unknown }[] = [];
  const transport = {
    request: async (requete: { path: string; method: string; body?: unknown }) => {
      appels.push({ path: requete.path, method: requete.method, body: requete.body });
      return reponse;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway' as const, transport }, appels };
};

describe('deleteAdminUser', () => {
  test('vise DELETE /api/v1/admin/users/:userId, identifiant ENCODÉ, motif sous `reason`', async () => {
    const { deps, appels } = espion({ ok: true, data: { message: 'User deleted successfully' } });
    const resultat = await deleteAdminUser({ ...deps, userId: 'u 1/x', reason: '  doublon de compte  ' });
    expect(appels[0]).toEqual({ method: 'DELETE', path: `/api/v1/admin/users/${encodeURIComponent('u 1/x')}`, body: { reason: 'doublon de compte' } });
    expect(resultat).toEqual({ ok: true, data: { deleted: true } });
  });

  test('sans motif (rang souverain), aucun corps ne part', async () => {
    const { deps, appels } = espion({ ok: true, data: {} });
    await deleteAdminUser({ ...deps, userId: 'u-1', reason: null });
    await deleteAdminUser({ ...deps, userId: 'u-1', reason: '   ' });
    expect(appels.map((appel) => appel.body)).toEqual([undefined, undefined]);
  });

  test('un refus de la passerelle est relayé tel quel', async () => {
    const { deps } = espion({ ok: false, status: 403, error: 'Forbidden' });
    expect(await deleteAdminUser({ ...deps, userId: 'u-1', reason: null })).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });
});

describe('restoreAdminUser', () => {
  test('vise POST …/restore et décode la fiche RELUE', async () => {
    const { deps, appels } = espion({ ok: true, data: { id: 'u-1', username: 'awa', isActive: true, deletedAt: null, _count: { participations: 4 } } });
    const resultat = await restoreAdminUser({ ...deps, userId: 'u-1' });
    expect(appels[0]?.method).toBe('POST');
    expect(appels[0]?.path).toBe('/api/v1/admin/users/u-1/restore');
    expect(resultat.ok && resultat.data.isActive).toBe(true);
    expect(resultat.ok && resultat.data.counts?.participations).toBe(4);
  });
});

import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { describe, expect, test } from 'bun:test';

import { ADMIN_DASHBOARD_KEYS, recomputeAdminDashboard } from './admin-settings';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { estClefNonPersistable } from './souverain';

/**
 * **RECALCULER LES COMPTEURS DU TABLEAU DE BORD** (#8876, #6732) — `POST
 * /admin/dashboard/invalidate-cache` vide le cache serveur de dix minutes ; le client
 * n'envoie aucun corps, lit l'adresse du catalogue, et dit ce que la passerelle a répondu.
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

describe('recomputeAdminDashboard', () => {
  test('POST sur l’adresse du catalogue, sans corps', async () => {
    const { deps, requests } = transportOf(() => ({ ok: true, status: 200, data: undefined }));

    const result = await recomputeAdminDashboard(deps);

    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.path).toBe(adminEndpoints.dashboardInvalidateCache);
    expect(requests[0]?.body).toBeUndefined();
  });

  test('le succès ne porte rien d’autre qu’un accusé : la vérité se relit par invalidation', async () => {
    const { deps } = transportOf(() => ({ ok: true, status: 200, data: { cache: 'SECRET-CACHE-DUMP' } }));

    const result = await recomputeAdminDashboard(deps);

    expect(result).toEqual({ ok: true, status: 200, data: { recomputed: true } });
  });

  test('un refus (la capacité manque) remonte tel quel', async () => {
    const { deps } = transportOf(() => ({ ok: false, status: 403, error: 'Forbidden' }));

    expect(await recomputeAdminDashboard(deps)).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  test('un échec réseau remonte tel quel', async () => {
    const { deps } = transportOf(() => ({ ok: false, status: 0, error: '' }));

    expect(await recomputeAdminDashboard(deps)).toEqual({ ok: false, status: 0, error: '' });
  });
});

describe('les lectures à relire après le recalcul', () => {
  test('les deux familles du tableau de bord : le bloc de chiffres du hub et ses blocs de l’écran', () => {
    expect(ADMIN_DASHBOARD_KEYS).toEqual([['admin', 'dash'], ['admin', 'dashboard']]);
  });

  test('elles restent en mémoire : jamais écrites sur le disque', () => {
    for (const key of ADMIN_DASHBOARD_KEYS) expect(estClefNonPersistable(key)).toBe(true);
  });
});

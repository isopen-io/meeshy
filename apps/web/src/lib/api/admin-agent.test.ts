import { describe, expect, test } from 'bun:test';

import {
  ADMIN_AGENT_PAGE_SIZE,
  agentLiveQueryKey,
  agentOverviewQueryKey,
  agentScanLogQueryKey,
  agentScanLogsQueryKey,
  agentTrackedQueryKey,
  loadAgentLive,
  loadAgentOverview,
  loadAgentScanLog,
  loadAgentScanLogs,
  loadAgentTracked,
  relancerAgent,
  stopperScanAgent,
} from './admin-agent';
import { estClefSouveraine } from './souverain';
import { servedPagination } from '@/test-support/served-pagination';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * **LE PORT DU PILOTAGE DE L'AGENT** (#6733) — les sept lectures et les deux
 * gestes des routes `/admin/agent/*`, qui existent toutes déjà.
 *
 * ## Les trois pièges que ce fichier garde
 *
 * 1. **`page`, jamais `offset`** — l'INVERSE de `GET /admin/users`. Ces
 *    routes-ci lisent `page` (`agent-configs.ts`, `agent-observability.ts`) ;
 *    un `?offset=2` serait simplement IGNORÉ, et la deuxième page rendrait la
 *    première, sans erreur, indéfiniment. Deux conventions de pagination
 *    cohabitent dans la même administration, et rien côté serveur ne rougit
 *    quand on se trompe de mot.
 *
 * 2. **La pagination voyage À CÔTÉ de `data`** (`sendPaginatedSuccess`), et le
 *    transport de la v2 la pose sur `result.pagination`, sibling de
 *    `result.data` — jamais dedans. La lire au mauvais niveau rend `total: 0`
 *    et `hasMore: false` : une liste qui s'arrête à la première page **sans
 *    que rien n'échoue**, donc un bouton « Suivants » définitivement éteint.
 *
 * 3. **Le schéma ne gouverne pas la forme** : ces routes déclarent leurs `data`
 *    en `additionalProperties: true`. Les champs décodés ici viennent de la
 *    lecture des HANDLERS, jamais des schémas.
 *
 * ## Rien de ce qui est lu ici ne touche le disque
 *
 * Les clés descendent d'`ADMIN_SOUVERAIN_PREFIXE` : ces lectures nomment les
 * conversations de l'instance et l'activité qu'un agent y a eue. Sans le
 * préfixe, `query-client.ts` les déshydraterait vers `localStorage` — une
 * copie qu'`AdminAuditLog` ne connaît pas.
 */

function transportQui(
  reponses: (requete: HttpRequest) => ApiResult<unknown>,
): { readonly transport: HttpTransport; readonly vues: HttpRequest[] } {
  const vues: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (async (requete: HttpRequest): Promise<ApiResult<unknown>> => {
    vues.push(requete);
    return reponses(requete);
  }) as HttpTransport['request'];
  return { transport, vues };
}

const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });

describe('les clés de requête sont SOUVERAINES — rien ne part sur le disque', () => {
  test('les cinq fabriques descendent du préfixe souverain', () => {
    for (const clef of [
      agentOverviewQueryKey(),
      agentTrackedQueryKey(1, ''),
      agentLiveQueryKey('c1'),
      agentScanLogsQueryKey(1, ''),
      agentScanLogQueryKey('l1'),
    ]) {
      expect(estClefSouveraine(clef)).toBe(true);
    }
  });

  test('deux pages, deux recherches, deux conversations font DEUX clés distinctes', () => {
    expect(agentTrackedQueryKey(1, '')).not.toEqual(agentTrackedQueryKey(2, ''));
    expect(agentTrackedQueryKey(1, 'a')).not.toEqual(agentTrackedQueryKey(1, 'b'));
    expect(agentScanLogsQueryKey(1, 'c1')).not.toEqual(agentScanLogsQueryKey(1, 'c2'));
  });
});

describe('GET /admin/agent/stats — la vue d’ensemble', () => {
  test('lit les compteurs du handler, et rend 0 sur une charge vide', async () => {
    const { transport } = transportQui(() => ({
      ok: true,
      data: {
        totalConfigs: 12,
        activeConfigs: 5,
        totalControlledUsers: 31,
        totalMessagesSent: 840,
      },
    }));

    const resultat = await loadAgentOverview(deps(transport));

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data).toEqual({
      totalConfigs: 12,
      activeConfigs: 5,
      totalControlledUsers: 31,
      totalMessagesSent: 840,
    });
  });

  test('une charge illisible ne fabrique pas de chiffres', async () => {
    const { transport } = transportQui(() => ({ ok: true, data: null }));

    const resultat = await loadAgentOverview(deps(transport));

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data.totalConfigs).toBe(0);
    expect(resultat.data.totalMessagesSent).toBe(0);
  });
});

describe('GET /admin/agent/configs — les conversations suivies', () => {
  test('pagine par `page`, JAMAIS par `offset` — sinon la page 2 rend la page 1', async () => {
    const { transport, vues } = transportQui(() => ({ ok: true, data: [], pagination: servedPagination({ total: 0 }) }));

    await loadAgentTracked({ ...deps(transport), page: 3, search: '' });

    expect(vues[0]?.path).toContain('page=3');
    expect(vues[0]?.path).not.toContain('offset=');
    expect(vues[0]?.path).toContain(`limit=${ADMIN_AGENT_PAGE_SIZE}`);
  });

  test('une recherche VIDE n’est pas envoyée — elle ferait varier la clé pour rien', async () => {
    const { transport, vues } = transportQui(() => ({ ok: true, data: [], pagination: servedPagination({ total: 0 }) }));

    await loadAgentTracked({ ...deps(transport), page: 1, search: '   ' });

    expect(vues[0]?.path).not.toContain('search=');
  });

  test('lit la pagination À CÔTÉ de data — le sibling que pose le transport', async () => {
    const { transport } = transportQui(() => ({
      ok: true,
      data: [{ conversationId: 'c1', conversation: { id: 'c1', title: 'Atelier', type: 'group' } }],
      pagination: servedPagination({ total: 57, page: 1, limit: 20, hasMore: true }),
    }));

    const resultat = await loadAgentTracked({ ...deps(transport), page: 1, search: '' });

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    // Lue au mauvais niveau, `total` vaudrait 1 et `hasMore` false : une liste
    // qui s'arrête à la première page sans que rien n'échoue.
    expect(resultat.data.total).toBe(57);
    expect(resultat.data.hasMore).toBe(true);
  });

  test('décode la ligne telle que le HANDLER la sert, pas telle que le schéma la déclare', async () => {
    const { transport } = transportQui(() => ({
      ok: true,
      data: [
        {
          id: 'cfg1',
          conversationId: 'c1',
          conversation: { id: 'c1', title: 'Atelier', type: 'group' },
          enabled: true,
          isScanning: true,
          currentNode: 'strategist',
          controlledUserIds: ['u1', 'u2'],
          analytics: { messagesSent: 9, totalWordsSent: 120, avgConfidence: 0.8, lastResponseAt: '2026-09-17T10:00:00.000Z' },
        },
      ],
      pagination: servedPagination({ total: 1, page: 1, limit: 20, hasMore: false }),
    }));

    const resultat = await loadAgentTracked({ ...deps(transport), page: 1, search: '' });

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data.conversations[0]).toEqual({
      conversationId: 'c1',
      title: 'Atelier',
      enabled: true,
      isScanning: true,
      currentNode: 'strategist',
      controlledUsersCount: 2,
      messagesSent: 9,
      lastResponseAt: '2026-09-17T10:00:00.000Z',
    });
  });

  test('une ligne sans conversationId est JETÉE — jamais une ligne qu’on ne peut pas ouvrir', async () => {
    const { transport } = transportQui(() => ({
      ok: true,
      data: [{ conversation: { title: 'orpheline' } }, { conversationId: 'c2' }],
      pagination: servedPagination({ total: 2 }),
    }));

    const resultat = await loadAgentTracked({ ...deps(transport), page: 1, search: '' });

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data.conversations.map((c) => c.conversationId)).toEqual(['c2']);
  });
});

describe('GET /admin/agent/configs/:id/live — l’état vivant', () => {
  test('lit le scan en cours et le nœud du graphe', async () => {
    const { transport, vues } = transportQui(() => ({
      ok: true,
      data: {
        conversationId: 'c1',
        isScanning: true,
        currentNode: 'generator',
        analytics: { messagesSent: 4, totalWordsSent: 60, avgConfidence: 0.5, lastResponseAt: null },
        controlledUsers: [{ userId: 'u1' }],
      },
    }));

    const resultat = await loadAgentLive({ ...deps(transport), conversationId: 'c1' });

    expect(vues[0]?.path).toBe('/api/v1/admin/agent/configs/c1/live');
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data.isScanning).toBe(true);
    expect(resultat.data.currentNode).toBe('generator');
    expect(resultat.data.controlledUsersCount).toBe(1);
  });
});

describe('POST /admin/agent/configs/:id/trigger — LA RELANCE', () => {
  test('frappe la bonne adresse, en POST', async () => {
    const { transport, vues } = transportQui(() => ({
      ok: true,
      data: { conversationId: 'c1', triggered: true, triggeredAt: 1758100000000 },
    }));

    await relancerAgent({ ...deps(transport), conversationId: 'c1' });

    expect(vues[0]?.method).toBe('POST');
    expect(vues[0]?.path).toBe('/api/v1/admin/agent/configs/c1/trigger');
  });

  test('rend `triggered` tel que le handler le dit — jamais un succès supposé', async () => {
    const { transport } = transportQui(() => ({ ok: true, data: { conversationId: 'c1', triggered: false } }));

    const resultat = await relancerAgent({ ...deps(transport), conversationId: 'c1' });

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data.triggered).toBe(false);
  });

  test('un refus reste un refus — la relance ne s’invente pas', async () => {
    const { transport } = transportQui(() => ({ ok: false, status: 404, error: 'Config non trouvée' }));

    const resultat = await relancerAgent({ ...deps(transport), conversationId: 'c1' });

    expect(resultat.ok).toBe(false);
  });
});

describe('POST /admin/agent/configs/:id/stop — L’ARRÊT', () => {
  test('frappe la bonne adresse, en POST', async () => {
    const { transport, vues } = transportQui(() => ({ ok: true, data: { conversationId: 'c1', stopped: true } }));

    await stopperScanAgent({ ...deps(transport), conversationId: 'c1' });

    expect(vues[0]?.method).toBe('POST');
    expect(vues[0]?.path).toBe('/api/v1/admin/agent/configs/c1/stop');
  });

  /**
   * `agentUnavailable: true` est un SUCCÈS PARTIEL que le handler sert
   * délibérément : le marqueur en base est effacé (la pastille se décoince),
   * mais le service agent n'a pas été joint. Le confondre avec un arrêt franc
   * ferait dire à l'interface que tout va bien alors que le service est à
   * terre.
   */
  test('rapporte `agentUnavailable`, que le handler sert avec un succès', async () => {
    const { transport } = transportQui(() => ({
      ok: true,
      data: { conversationId: 'c1', stopped: true, agentUnavailable: true },
    }));

    const resultat = await stopperScanAgent({ ...deps(transport), conversationId: 'c1' });

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data).toEqual({ stopped: true, agentUnavailable: true });
  });
});

describe('GET /admin/agent/scan-logs — le journal des scans', () => {
  test('pagine par `page` et sait se restreindre à une conversation', async () => {
    const { transport, vues } = transportQui(() => ({ ok: true, data: [], pagination: servedPagination({ total: 0 }) }));

    await loadAgentScanLogs({ ...deps(transport), page: 2, conversationId: 'c1' });

    expect(vues[0]?.path).toContain('page=2');
    expect(vues[0]?.path).toContain('conversationId=c1');
    expect(vues[0]?.path).not.toContain('offset=');
  });

  test('décode une ligne du journal', async () => {
    const { transport } = transportQui(() => ({
      ok: true,
      data: [
        {
          id: 'l1',
          conversationId: 'c1',
          conversation: { id: 'c1', title: 'Atelier', type: 'group' },
          trigger: 'manual',
          startedAt: '2026-09-17T09:00:00.000Z',
          durationMs: 4200,
          outcome: 'sent',
          messagesSent: 2,
          reactionsSent: 1,
          messagesRejected: 0,
          estimatedCostUsd: 0.0123,
        },
      ],
      pagination: servedPagination({ total: 1, page: 1, limit: 20, hasMore: false }),
    }));

    const resultat = await loadAgentScanLogs({ ...deps(transport), page: 1, conversationId: '' });

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data.logs[0]).toEqual({
      id: 'l1',
      conversationId: 'c1',
      title: 'Atelier',
      trigger: 'manual',
      startedAt: '2026-09-17T09:00:00.000Z',
      durationMs: 4200,
      outcome: 'sent',
      messagesSent: 2,
    });
  });

  test('une ligne sans id est JETÉE — elle ne pourrait pas ouvrir son détail', async () => {
    const { transport } = transportQui(() => ({
      ok: true,
      data: [{ conversationId: 'c1' }, { id: 'l2', conversationId: 'c1' }],
      pagination: servedPagination({ total: 2 }),
    }));

    const resultat = await loadAgentScanLogs({ ...deps(transport), page: 1, conversationId: '' });

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.data.logs.map((l) => l.id)).toEqual(['l2']);
  });
});

describe('GET /admin/agent/scan-logs/:logId — le détail d’un scan', () => {
  test('frappe l’adresse du log, et rend ses champs longs', async () => {
    const { transport, vues } = transportQui(() => ({
      ok: true,
      data: {
        id: 'l1',
        conversationId: 'c1',
        conversation: { id: 'c1', title: 'Atelier' },
        trigger: 'manual',
        outcome: 'sent',
        startedAt: '2026-09-17T09:00:00.000Z',
        durationMs: 4200,
        messagesSent: 2,
        reactionsSent: 1,
        messagesRejected: 0,
        estimatedCostUsd: 0.0123,
        totalInputTokens: 900,
        totalOutputTokens: 120,
        userIdsUsed: ['u1', 'u2'],
      },
    }));

    const resultat = await loadAgentScanLog({ ...deps(transport), logId: 'l1' });

    expect(vues[0]?.path).toBe('/api/v1/admin/agent/scan-logs/l1');
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    // Ce que la LIGNE du journal ne porte pas : qui l'agent a joué.
    expect(resultat.data.userIdsUsed).toEqual(['u1', 'u2']);
    // Et ce que le handler sert EN PLUS n'entre pas : un champ décodé que
    // personne ne rend est du poids déguisé en feature (voir le doc-comment du
    // port). `totalInputTokens` et `estimatedCostUsd` sont dans la charge
    // ci-dessus — ils ne doivent pas ressortir ici.
    expect(Object.keys(resultat.data)).not.toContain('totalInputTokens');
    expect(Object.keys(resultat.data)).not.toContain('estimatedCostUsd');
  });
});

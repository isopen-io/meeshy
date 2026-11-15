import { describe, expect, test } from 'bun:test';

import { AGENT_ROOT_KEY } from './admin-agent';
import { agentRecentActivityQueryKey, agentScanStatsQueryKey, loadAgentRecentActivity, loadAgentScanStats } from './admin-agent-activity';
import {
  agentArchetypesQueryKey,
  agentConfigQueryKey,
  agentMessagesQueryKey,
  agentRolesQueryKey,
  agentScheduleQueryKey,
  agentSummaryQueryKey,
  assignAgentArchetype,
  deleteAgentConfig,
  loadAgentArchetypes,
  loadAgentConfig,
  loadAgentMessages,
  loadAgentRoles,
  loadAgentSchedule,
  loadAgentSummary,
  resetAgentConversation,
  resetAgentUser,
  saveAgentConfig,
  unlockAgentRole,
} from './admin-agent-conversation';
import {
  agentGlobalConfigQueryKey,
  agentLlmQueryKey,
  loadAgentGlobalConfig,
  loadAgentLlm,
  resetAgentEverything,
  saveAgentGlobalConfig,
  saveAgentLlm,
} from './admin-agent-settings';
import {
  agentQueueQueryKey,
  agentTopicQueryKey,
  agentTopicsQueryKey,
  cancelAgentQueueItem,
  createAgentTopic,
  deleteAgentTopic,
  editAgentQueueItem,
  loadAgentQueue,
  loadAgentTopic,
  loadAgentTopics,
  testAgentTopic,
  updateAgentTopic,
} from './admin-agent-topics';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { estClefSouveraine } from './souverain';

/**
 * **LES PORTS DU LOT « AGENT COMPLET »** — vingt-huit routes `/admin/agent/*`
 * que l'écran Agent ne lisait pas. Chaque témoin garde une forme EXACTE lue
 * dans le handler de la passerelle : la méthode, l'adresse, le corps (et son
 * absence), la pagination, le décodage.
 */
function transportQui(reponses: (requete: HttpRequest) => ApiResult<unknown>): { readonly transport: HttpTransport; readonly vues: HttpRequest[] } {
  const vues: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (async (requete: HttpRequest): Promise<ApiResult<unknown>> => {
    vues.push(requete);
    return reponses(requete);
  }) as HttpTransport['request'];
  return { transport, vues };
}

const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });
const ok = (data: unknown, extra: Readonly<Record<string, unknown>> = {}): ApiResult<unknown> => ({ ok: true, data, ...extra });
const C = 'a'.repeat(24);
const U = 'b'.repeat(24);

describe('toutes les clés descendent de la racine souveraine de l’agent', () => {
  test('aucune lecture de l’agent ne part sur le disque', () => {
    for (const clef of [
      agentRecentActivityQueryKey(''),
      agentScanStatsQueryKey(6, 'day'),
      agentLlmQueryKey(),
      agentGlobalConfigQueryKey(),
      agentConfigQueryKey(C),
      agentSummaryQueryKey(C),
      agentScheduleQueryKey(C),
      agentRolesQueryKey(C),
      agentMessagesQueryKey(C, 1),
      agentArchetypesQueryKey(),
      agentTopicsQueryKey(),
      agentTopicQueryKey('t1'),
      agentQueueQueryKey(),
    ]) {
      expect(estClefSouveraine(clef)).toBe(true);
      expect(clef.slice(0, AGENT_ROOT_KEY.length)).toEqual([...AGENT_ROOT_KEY]);
    }
  });
});

describe('la vue d’ensemble — activité récente et statistiques du journal', () => {
  test('GET /recent-activity : limite et recherche, lignes décodées', async () => {
    const { transport, vues } = transportQui(() =>
      ok([{ conversationId: C, conversation: { title: 'Atelier', type: 'group' }, enabled: true, messagesSent: 3, controlledUsersCount: 2, avgConfidence: 0.5 }]),
    );
    const resultat = await loadAgentRecentActivity({ ...deps(transport), search: ' ate ' });
    expect(vues[0]?.path).toBe('/api/v1/admin/agent/recent-activity?limit=20&search=ate');
    expect(resultat.ok && resultat.data[0]).toMatchObject({ conversationId: C, title: 'Atelier', enabled: true, controlledUsersCount: 2 });
  });

  test('GET /scan-logs/stats : mois et seau, et un seau illisible est écarté', async () => {
    const { transport, vues } = transportQui(() =>
      ok({ buckets: [{ date: '2026-10-01', scans: 4, messagesSent: 2, reactionsSent: 1, costUsd: 0.02 }, { scans: 9 }], totalLogs: 4, since: '2026-04-01T00:00:00.000Z' }),
    );
    const resultat = await loadAgentScanStats({ ...deps(transport), months: 3, bucket: 'week' });
    expect(vues[0]?.path).toBe('/api/v1/admin/agent/scan-logs/stats?months=3&bucket=week');
    expect(resultat.ok && resultat.data).toEqual({
      buckets: [{ date: '2026-10-01', scans: 4, messagesSent: 2, reactionsSent: 1, costUsd: 0.02 }],
      totalLogs: 4,
      since: '2026-04-01T00:00:00.000Z',
    });
  });
});

describe('le modèle et la configuration globale', () => {
  test('GET /llm : la clé n’est jamais relue, seul `hasApiKey` l’est ; `null` sans configuration', async () => {
    const { transport } = transportQui(() => ok({ provider: 'anthropic', model: 'claude', hasApiKey: true, dailyBudgetUsd: 20, apiKeyEncrypted: 'fuite' }));
    const resultat = await loadAgentLlm(deps(transport));
    expect(resultat.ok && resultat.data?.fields).toEqual({ provider: 'anthropic', model: 'claude', dailyBudgetUsd: 20 });
    expect(resultat.ok && resultat.data?.hasApiKey).toBe(true);
    expect(JSON.stringify(resultat)).not.toContain('fuite');

    const vide = await loadAgentLlm(deps(transportQui(() => ok(null)).transport));
    expect(vide.ok && vide.data).toBeNull();
  });

  test('GET /llm : les quatre derniers caractères des clés, facultatifs (un ancien serveur ne les sert pas)', async () => {
    const servi = await loadAgentLlm(
      deps(transportQui(() => ok({ provider: 'openai', hasApiKey: true, apiKeyLast4: 'abcd', hasFallbackApiKey: true, fallbackApiKeyLast4: 'wxyz' })).transport),
    );
    expect(servi.ok && servi.data).toMatchObject({ hasApiKey: true, apiKeyLast4: 'abcd', hasFallbackApiKey: true, fallbackApiKeyLast4: 'wxyz' });
    const ancien = await loadAgentLlm(deps(transportQui(() => ok({ provider: 'openai', hasApiKey: true })).transport));
    expect(ancien.ok && ancien.data).toMatchObject({ hasApiKey: true, apiKeyLast4: null, hasFallbackApiKey: false, fallbackApiKeyLast4: null });
  });

  test('PUT /llm : la clé ne part que saisie, le motif que s’il est écrit', async () => {
    const { transport, vues } = transportQui(() => ok({ provider: 'openai' }));
    await saveAgentLlm({ ...deps(transport), changes: { model: 'gpt' }, apiKey: '  ', reason: null });
    await saveAgentLlm({ ...deps(transport), changes: {}, apiKey: ' sk-1 ', reason: 'Rotation de la clé' });
    expect(vues[0]).toEqual({ method: 'PUT', path: '/api/v1/admin/agent/llm', body: { model: 'gpt' } });
    expect(vues[1]?.body).toEqual({ apiKeyEncrypted: 'sk-1', reason: 'Rotation de la clé' });
  });

  test('GET puis PUT /global-config : les seuls champs changés partent', async () => {
    const { transport, vues } = transportQui((req) => ok(req.method === 'GET' ? { enabled: true, systemPrompt: 'Bonjour', id: 'x' } : { enabled: false }));
    const lu = await loadAgentGlobalConfig(deps(transport));
    expect(lu.ok && lu.data.fields).toEqual({ enabled: true, systemPrompt: 'Bonjour' });
    await saveAgentGlobalConfig({ ...deps(transport), changes: { enabled: false } });
    expect(vues[1]).toEqual({ method: 'PUT', path: '/api/v1/admin/agent/global-config', body: { enabled: false } });
  });

  test('DELETE /reset déclare un corps : `{}` sans motif, `{ reason }` avec ; les décomptes sont lus', async () => {
    const { transport, vues } = transportQui(() => ok({ deleted: { configs: 3, roles: 7, redisKeys: 40 } }));
    const resultat = await resetAgentEverything({ ...deps(transport), reason: null });
    await resetAgentEverything({ ...deps(transport), reason: 'Remise à plat' });
    expect(vues[0]).toEqual({ method: 'DELETE', path: '/api/v1/admin/agent/reset', body: {} });
    expect(vues[1]?.body).toEqual({ reason: 'Remise à plat' });
    expect(resultat.ok && resultat.data).toEqual({ configs: 3, roles: 7, redisKeys: 40 });
  });
});

describe('une conversation suivie', () => {
  test('GET /configs/:id : réglages de la table, membres comptés ; un 404 est « sans configuration »', async () => {
    const { transport } = transportQui(() => ok({ enabled: true, scanIntervalMinutes: 5, controlledUserIds: ['u1', 'u2'], conversationId: C }));
    const resultat = await loadAgentConfig({ ...deps(transport), conversationId: C });
    expect(resultat.ok && resultat.data).toEqual({ fields: { enabled: true, scanIntervalMinutes: 5 }, controlledUsersCount: 2, updatedAt: null });

    const absent = await loadAgentConfig({ ...deps(transportQui(() => ({ ok: false, status: 404, error: 'Config non trouvée' })).transport), conversationId: C });
    expect(absent.ok && absent.data).toBeNull();
    const panne = await loadAgentConfig({ ...deps(transportQui(() => ({ ok: false, status: 500, error: 'x' })).transport), conversationId: C });
    expect(panne.ok).toBe(false);
  });

  test('PUT et DELETE /configs/:id — le DELETE part sans corps', async () => {
    const { transport, vues } = transportQui(() => ok({}));
    await saveAgentConfig({ ...deps(transport), conversationId: C, changes: { enabled: false } });
    await deleteAgentConfig({ ...deps(transport), conversationId: C });
    expect(vues[0]).toEqual({ method: 'PUT', path: `/api/v1/admin/agent/configs/${C}`, body: { enabled: false } });
    expect(vues[1]).toEqual({ method: 'DELETE', path: `/api/v1/admin/agent/configs/${C}` });
  });

  test('résumé et planning : 404 rendu `null`, millisecondes rendues en ISO', async () => {
    const resume = await loadAgentSummary({
      ...deps(transportQui(() => ok({ summary: 'Ça parle cuisine', currentTopics: ['recettes', ''], overallTone: 'chaleureux', messageCount: 40, healthScore: 72 })).transport),
      conversationId: C,
    });
    expect(resume.ok && resume.data).toMatchObject({ summary: 'Ça parle cuisine', currentTopics: ['recettes'], healthScore: 72 });

    const planning = await loadAgentSchedule({
      ...deps(
        transportQui(() =>
          ok({
            scanIntervalMinutes: 3,
            lastScan: 0,
            nextScan: Date.UTC(2026, 9, 5, 10),
            upcomingScans: [1, 2, 3],
            budget: { messagesUsed: 2, messagesMax: 10, isWeekend: false },
            burst: { enabled: true, cooldownActive: false, cooldownEndsAt: 5 },
          }),
        ).transport,
      ),
      conversationId: C,
    });
    expect(planning.ok && planning.data).toEqual({
      scanIntervalMinutes: 3,
      lastScanAt: null,
      nextScanAt: '2026-10-05T10:00:00.000Z',
      upcomingCount: 3,
      messagesUsed: 2,
      messagesMax: 10,
      isWeekend: false,
      burstEnabled: true,
      burstCooldownEndsAt: null,
    });

    const sansResume = await loadAgentSummary({ ...deps(transportQui(() => ({ ok: false, status: 404, error: 'x' })).transport), conversationId: C });
    expect(sansResume.ok && sansResume.data).toBeNull();
  });

  test('GET /configs/:id/roles pagine par OFFSET (l’inverse des listes voisines)', async () => {
    const { transport, vues } = transportQui(() =>
      ok([{ userId: U, origin: 'archetype', archetypeId: 'curious', confidence: 1.4, locked: true, messagesAnalyzed: 12 }, { userId: '' }], {
        pagination: { total: 2, offset: 0, limit: 50, hasMore: false },
      }),
    );
    const resultat = await loadAgentRoles({ ...deps(transport), conversationId: C });
    expect(vues[0]?.path).toBe(`/api/v1/admin/agent/configs/${C}/roles?offset=0&limit=50`);
    expect(resultat.ok && resultat.data.rows).toEqual([{ userId: U, origin: 'archetype', archetypeId: 'curious', confidence: 1, locked: true, messagesAnalyzed: 12 }]);
  });

  test('archétypes, assignation (`{ archetypeId }`) et déverrouillage (sans corps)', async () => {
    const { transport, vues } = transportQui((req) => (req.method === 'GET' ? ok([{ id: 'curious', name: 'Le Curieux' }, { name: 'sans id' }]) : ok({})));
    const archetypes = await loadAgentArchetypes(deps(transport));
    await assignAgentArchetype({ ...deps(transport), conversationId: C, userId: U, archetypeId: 'curious' });
    await unlockAgentRole({ ...deps(transport), conversationId: C, userId: U });
    expect(archetypes.ok && archetypes.data).toEqual([{ id: 'curious', name: 'Le Curieux' }]);
    expect(vues[1]).toEqual({ method: 'POST', path: `/api/v1/admin/agent/roles/${C}/${U}/assign`, body: { archetypeId: 'curious' } });
    expect(vues[2]).toEqual({ method: 'POST', path: `/api/v1/admin/agent/roles/${C}/${U}/unlock` });
  });

  test('GET /configs/:id/messages pagine par PAGE, et nomme l’auteur', async () => {
    const { transport, vues } = transportQui(() =>
      ok([{ id: 'm1', content: 'Salut', createdAt: '2026-10-04T08:00:00.000Z', originalLanguage: 'fr', sender: { displayName: 'Awa', user: { username: 'awa' } } }], {
        pagination: { total: 1, page: 2, limit: 20, hasMore: false },
      }),
    );
    const resultat = await loadAgentMessages({ ...deps(transport), conversationId: C, page: 2 });
    expect(vues[0]?.path).toBe(`/api/v1/admin/agent/configs/${C}/messages?page=2&limit=20`);
    expect(resultat.ok && resultat.data?.rows[0]).toEqual({ id: 'm1', content: 'Salut', createdAt: '2026-10-04T08:00:00.000Z', senderName: 'Awa', senderUsername: 'awa', language: 'fr' });
  });

  test('remises à zéro d’une conversation et d’un membre : DELETE sans corps, décomptes lus', async () => {
    const { transport, vues } = transportQui(() => ok({ deleted: { configs: 1, roles: 2 } }));
    const conversation = await resetAgentConversation({ ...deps(transport), conversationId: C });
    await resetAgentUser({ ...deps(transport), userId: U });
    expect(vues[0]).toEqual({ method: 'DELETE', path: `/api/v1/admin/agent/reset/conversation/${C}` });
    expect(vues[1]).toEqual({ method: 'DELETE', path: `/api/v1/admin/agent/reset/user/${U}` });
    expect(conversation.ok && conversation.data).toEqual({ configs: 1, roles: 2 });
  });
});

describe('les sujets', () => {
  const SUJET = {
    id: 't1',
    slug: 'cuisine',
    label: 'Cuisine',
    keywordPatterns: ['recette', 'four'],
    instructionTemplate: 'Parle de cuisine avec entrain et précision.',
    searchHintTemplate: 'recettes',
    examples: [],
    cooldownMinutes: 60,
    priority: 2,
    isActive: false,
  };

  test('liste (actifs ET inactifs), détail, création, édition, désactivation et suppression', async () => {
    const { transport, vues } = transportQui(() => ok(vues.length === 1 ? [SUJET] : SUJET));
    const liste = await loadAgentTopics(deps(transport));
    await loadAgentTopic({ ...deps(transport), id: 't1' });
    const { id: _id, ...input } = SUJET;
    await createAgentTopic({ ...deps(transport), input: { ...input, description: null } });
    await updateAgentTopic({ ...deps(transport), id: 't1', changes: { priority: 3 } });
    await deleteAgentTopic({ ...deps(transport), id: 't1', hard: false });
    await deleteAgentTopic({ ...deps(transport), id: 't1', hard: true });

    expect(liste.ok && liste.data[0]?.isActive).toBe(false);
    expect(vues.map((vue) => `${vue.method} ${vue.path}`)).toEqual([
      'GET /api/v1/admin/agent/topics?active=all',
      'GET /api/v1/admin/agent/topics/t1',
      'POST /api/v1/admin/agent/topics',
      'PATCH /api/v1/admin/agent/topics/t1',
      'DELETE /api/v1/admin/agent/topics/t1',
      'DELETE /api/v1/admin/agent/topics/t1?hard=true',
    ]);
    expect(vues[3]?.body).toEqual({ priority: 3 });
    expect(vues[4]?.body).toBeUndefined();
  });

  test('un motif refusé rend le message de la passerelle TEL QUEL', async () => {
    const message = 'keywordPatterns: motif refusé — (a+)+$ → [NESTED_QUANTIFIER] quantificateur imbriqué';
    const { transport } = transportQui(() => ({ ok: false, status: 400, error: message }));
    const resultat = await updateAgentTopic({ ...deps(transport), id: 't1', changes: { keywordPatterns: ['(a+)+$'] } });
    expect(resultat.ok === false && resultat.error).toBe(message);
  });

  test('POST /topics/:id/test : `{ sampleText }`, occurrences et refus lus', async () => {
    const { transport, vues } = transportQui(() => ok({ matches: { recette: 2, '(a+)+$': -1 }, refused: [{ pattern: '(a+)+$', code: 'NESTED_QUANTIFIER', message: 'imbriqué' }] }));
    const resultat = await testAgentTopic({ ...deps(transport), id: 't1', sampleText: 'une recette' });
    expect(vues[0]).toEqual({ method: 'POST', path: '/api/v1/admin/agent/topics/t1/test', body: { sampleText: 'une recette' } });
    expect(resultat.ok && resultat.data).toEqual({
      matches: [{ pattern: 'recette', count: 2 }, { pattern: '(a+)+$', count: -1 }],
      refused: [{ pattern: '(a+)+$', message: 'imbriqué' }],
    });
  });
});

describe('la file de livraison', () => {
  test('lit messages et réactions, et écarte une action inconnue', async () => {
    const { transport } = transportQui(() =>
      ok([
        { id: 'q1', conversationId: C, scheduledAt: Date.UTC(2026, 9, 5, 12), mergeCount: 1, action: { type: 'message', asUserId: U, content: 'Bonjour' } },
        { id: 'q2', conversationId: C, scheduledAt: 0, action: { type: 'reaction', asUserId: U, emoji: '👍' } },
        { id: 'q3', action: { type: 'autre' } },
      ]),
    );
    const resultat = await loadAgentQueue(deps(transport));
    expect(resultat.ok && resultat.data.map((item) => [item.id, item.kind, item.content])).toEqual([
      ['q1', 'message', 'Bonjour'],
      ['q2', 'reaction', '👍'],
    ]);
    expect(resultat.ok && resultat.data[0]?.scheduledAt).toBe('2026-10-05T12:00:00.000Z');
  });

  test('nomme la conversation et le membre joué quand la passerelle les sert ; facultatifs pour un ancien serveur', async () => {
    const { transport } = transportQui(() =>
      ok([
        {
          id: 'q1',
          conversationId: C,
          conversation: { id: C, title: 'Les amis du jeudi' },
          persona: { id: U, username: 'lea', displayName: 'Léa Martin' },
          action: { type: 'message', asUserId: U, content: 'Bonjour' },
        },
        { id: 'q2', conversationId: C, conversation: { id: C, title: null }, persona: { id: U, username: 'lea', displayName: null }, action: { type: 'reaction', asUserId: U, emoji: '👍' } },
        { id: 'q3', conversationId: C, conversation: 'abîmé', persona: { username: 'sans-id' }, action: { type: 'message', asUserId: U, content: 'Ancien' } },
        { id: 'q4', conversationId: C, action: { type: 'message', asUserId: U, content: 'Ancien serveur' } },
      ]),
    );
    const resultat = await loadAgentQueue(deps(transport));
    expect(resultat.ok && resultat.data.map((item) => [item.conversation, item.persona])).toEqual([
      [{ id: C, title: 'Les amis du jeudi', participants: [], total: null }, { id: U, username: 'lea', displayName: 'Léa Martin' }],
      [{ id: C, title: null, participants: [], total: null }, { id: U, username: 'lea', displayName: null }],
      [null, null],
      [null, null],
    ]);
  });

  test('une conversation sans titre porte l’aperçu de ses membres (trois au plus) et leur total', async () => {
    const { transport } = transportQui(() =>
      ok([
        {
          id: 'q1',
          conversationId: C,
          conversation: {
            id: C,
            title: null,
            participants: [{ displayName: 'Awa', username: 'awa' }, { displayName: null, username: 'jean' }, 'abîmé', { displayName: 'Zoé' }, { username: 'quatre' }],
            total: 7,
          },
          persona: null,
          action: { type: 'message', asUserId: U, content: 'Bonjour' },
        },
      ]),
    );
    const resultat = await loadAgentQueue(deps(transport));
    expect(resultat.ok && resultat.data[0]?.conversation).toEqual({
      id: C,
      title: null,
      participants: [
        { displayName: 'Awa', username: 'awa' },
        { displayName: null, username: 'jean' },
        { displayName: 'Zoé', username: null },
      ],
      total: 7,
    });
  });

  test('PATCH réécrit le texte (`{ content }`), DELETE annule sans corps', async () => {
    const { transport, vues } = transportQui(() => ok({ deleted: true }));
    await editAgentQueueItem({ ...deps(transport), id: 'q1', content: 'Bonsoir' });
    await cancelAgentQueueItem({ ...deps(transport), id: 'q1' });
    expect(vues[0]).toEqual({ method: 'PATCH', path: '/api/v1/admin/agent/delivery-queue/q1', body: { content: 'Bonsoir' } });
    expect(vues[1]).toEqual({ method: 'DELETE', path: '/api/v1/admin/agent/delivery-queue/q1' });
  });
});

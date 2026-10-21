/**
 * #10242 — chaque appel de la passerelle à l'agent présente le secret interne partagé
 * (`AGENT_INTERNAL_TOKEN`, en-tête `x-meeshy-internal-token`) : l'agent refuse désormais
 * toute route sans lui (`services/agent/src/routes/internal-guard.ts`).
 *
 * - secret absent côté passerelle ⇒ aucun appel ne part, `AgentUnavailableError` (l'agent
 *   refuserait de toute façon, et le secret n'a pas à être deviné) ;
 * - l'agent refuse (401) ou n'est pas configuré (503 `internal-auth-not-configured`) ⇒
 *   `AgentUnavailableError` : une mauvaise configuration interne ne remonte jamais à
 *   l'administrateur comme SON 401 (qui le déconnecterait).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { AgentHttpClient, AgentUnavailableError, AGENT_INTERNAL_TOKEN_HEADER, agentInternalTokenConfigured } from '../../../services/AgentHttpClient';

const TOKEN = 't'.repeat(48);

function respond(body: unknown, status = 200) {
  const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const CALLS: ReadonlyArray<[string, (c: AgentHttpClient) => Promise<unknown>]> = [
  ['getQueue', (c) => c.getQueue('0123456789abcdef01234567')],
  ['deleteQueueItem', (c) => c.deleteQueueItem('item-1')],
  ['editQueueItem', (c) => c.editQueueItem('item-1', 'texte')],
  ['stopScan', (c) => c.stopScan('0123456789abcdef01234567')],
  ['invalidateCache', (c) => c.invalidateCache({ global: true })],
  ['getRangeSummary', (c) => c.getRangeSummary({ conversationId: '0123456789abcdef01234567', fromMessageId: 'a', toMessageId: 'b' })],
];

const saved = process.env.AGENT_INTERNAL_TOKEN;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AGENT_INTERNAL_TOKEN = TOKEN;
});

afterEach(() => {
  if (saved === undefined) delete process.env.AGENT_INTERNAL_TOKEN;
  else process.env.AGENT_INTERNAL_TOKEN = saved;
});

describe("la passerelle présente le secret interne à chaque appel de l'agent (#10242)", () => {
  it("l'en-tête est celui que l'agent lit", () => {
    expect(AGENT_INTERNAL_TOKEN_HEADER).toBe('x-meeshy-internal-token');
  });

  it.each(CALLS)('%s envoie x-meeshy-internal-token', async (_name, invoke) => {
    const fetchMock = respond({ success: true, data: null });
    await invoke(new AgentHttpClient('http://agent-staging:3200'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers[AGENT_INTERNAL_TOKEN_HEADER]).toBe(TOKEN);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('un en-tête fourni par l’appelant ne remplace pas le secret', async () => {
    const fetchMock = respond({ success: true, data: [] });
    const client = new AgentHttpClient('http://agent-staging:3200') as unknown as {
      request: (p: string, o: RequestInit) => Promise<unknown>;
    };
    await client.request('/api/agent/delivery-queue', { headers: { [AGENT_INTERNAL_TOKEN_HEADER]: 'forged' } });
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers[AGENT_INTERNAL_TOKEN_HEADER]).toBe(TOKEN);
  });

  it.each([['absent', undefined], ['vide', ''], ['blanc', '   '], ['trop court (< 32, que l’agent refuserait)', 'x'.repeat(31)]])(
    'secret %s côté passerelle : aucun appel ne part, AgentUnavailableError',
    async (_label, value) => {
      if (value === undefined) delete process.env.AGENT_INTERNAL_TOKEN;
      else process.env.AGENT_INTERNAL_TOKEN = value;
      const fetchMock = respond({ success: true, data: [] });
      for (const [, invoke] of CALLS) {
        await expect(invoke(new AgentHttpClient('http://agent-staging:3200'))).rejects.toBeInstanceOf(AgentUnavailableError);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [401, 'unauthorized'],
    [503, 'internal-auth-not-configured'],
  ])("l'agent répond %i (%s) : AgentUnavailableError, jamais un 401 relayé", async (status, message) => {
    respond({ success: false, message }, status);
    const error = await new AgentHttpClient('http://agent-staging:3200').getQueue().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AgentUnavailableError);
    expect((error as { statusCode?: number }).statusCode).toBeUndefined();
    expect(String((error as Error).message)).not.toContain(TOKEN);
  });

  it("un 503 d'une autre cause (LLM indisponible) garde son statut", async () => {
    respond({ success: false, message: 'llm-unavailable' }, 503);
    const error = await new AgentHttpClient('http://agent-staging:3200').getQueue().catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(AgentUnavailableError);
    expect((error as { statusCode?: number }).statusCode).toBe(503);
  });
});

describe('agentInternalTokenConfigured — le signal de démarrage de la passerelle (#10242)', () => {
  it.each([[undefined, false], ['', false], ['x'.repeat(31), false], ['  ' + 'x'.repeat(31) + '  ', false], ['x'.repeat(32), true]])(
    '%p ⇒ %p (même minimum que l’agent : 32)',
    (value, expected) => {
      if (value === undefined) delete process.env.AGENT_INTERNAL_TOKEN;
      else process.env.AGENT_INTERNAL_TOKEN = value;
      expect(agentInternalTokenConfigured()).toBe(expected);
    },
  );
});

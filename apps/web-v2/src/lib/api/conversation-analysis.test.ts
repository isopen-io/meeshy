import { describe, expect, test } from 'bun:test';

import {
  CONVERSATION_ANALYSIS_PATH,
  fetchConversationAnalysis,
  loadConversationAnalysis,
} from './conversation-analysis';
import { createHttpTransport } from './http';

/**
 * Le port de l'analyse — motif `engagement.test.ts` (#5695, étape 12).
 */

type Call = { readonly url: string; readonly init: RequestInit | undefined };

function transportServing(body: unknown, options: { readonly status?: number; readonly calls?: Call[] } = {}) {
  const fetchImpl: typeof fetch = async (input, init) => {
    options.calls?.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status: options.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return createHttpTransport({
    base: 'https://gate.test',
    credential: () => ({ kind: 'registered', token: 'jwt-test' }),
    fetchImpl,
    timeoutMs: 0,
  });
}

describe('loadConversationAnalysis', () => {
  test('fixtures ⇒ summary null sans appel réseau', async () => {
    const calls: Call[] = [];
    const transport = transportServing({}, { calls });
    const result = await loadConversationAnalysis({ source: 'fixtures', transport, conversationId: 'c1' });
    expect(result.ok && result.data).toEqual({ conversationId: 'c1', summary: null });
    expect(calls).toHaveLength(0);
  });

  test('gateway + charge conforme ⇒ { conversationId, summary: { text } }', async () => {
    const transport = transportServing({
      success: true,
      data: { conversationId: 'c1', summary: { text: 'Résumé.' }, participantProfiles: [], history: [] },
    });
    const result = await loadConversationAnalysis({ source: 'gateway', transport, conversationId: 'c1' });
    expect(result.ok && result.data).toEqual({ conversationId: 'c1', summary: { text: 'Résumé.' } });
  });

  test('gateway + summary null ⇒ summary null, ok', async () => {
    const transport = transportServing({ success: true, data: { conversationId: 'c1', summary: null } });
    const result = await loadConversationAnalysis({ source: 'gateway', transport, conversationId: 'c1' });
    expect(result.ok && result.data.summary).toBeNull();
  });

  test('gateway + 403 ⇒ ok: false, status 403', async () => {
    const transport = transportServing({ success: false, error: 'Access denied' }, { status: 403 });
    const result = await loadConversationAnalysis({ source: 'gateway', transport, conversationId: 'c1' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.status).toBe(403);
  });

  test('gateway + charge malformée ⇒ MALFORMED_PAYLOAD', async () => {
    const transport = transportServing({ success: true, data: { summary: { text: 'x' } } });
    const result = await loadConversationAnalysis({ source: 'gateway', transport, conversationId: 'c1' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe('MALFORMED_PAYLOAD');
  });

  test('le chemin est /api/v1/conversations/<id>/analysis', async () => {
    const calls: Call[] = [];
    const transport = transportServing({ success: true, data: { conversationId: 'c1', summary: null } }, { calls });
    await fetchConversationAnalysis(transport, 'c1');
    expect(calls[0]?.url).toBe(`https://gate.test${CONVERSATION_ANALYSIS_PATH('c1')}`);
    expect(CONVERSATION_ANALYSIS_PATH('c1')).toBe('/api/v1/conversations/c1/analysis');
  });
});

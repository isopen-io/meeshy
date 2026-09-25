import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { fetchMentionSuggestions } from './mention-suggestions';

function fakeTransport(result: ApiResult<unknown>): { readonly transport: HttpTransport; readonly requests: HttpRequest[] } {
  const requests: HttpRequest[] = [];
  const transport = {
    request: async (req: HttpRequest) => {
      requests.push(req);
      return result;
    },
  } as unknown as HttpTransport;
  return { transport, requests };
}

describe('fetchMentionSuggestions — GET /api/v1/mentions/suggestions', () => {
  test('hors conversation, interroge le contexte d’une PUBLICATION (#7846)', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: [] });
    await fetchMentionSuggestions({ source: 'gateway', transport }, { context: { type: 'post', id: 'p1' }, query: 'al' });
    expect(requests[0]?.path).toBe('/api/v1/mentions/suggestions?contextId=p1&contextType=post&query=al');
  });

  test('en gateway, interroge la route CONTEXTUELLE de la conversation, requête encodée', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: [] });
    await fetchMentionSuggestions({ source: 'gateway', transport }, { context: { type: 'conversation', id: 'c 1' }, query: 'al é' });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.path).toBe('/api/v1/mentions/suggestions?contextId=c%201&contextType=conversation&query=al%20%C3%A9');
  });

  test('décode la forme servie (`MentionSuggestion`) et écarte ce qui n’a ni identifiant ni pseudo', async () => {
    const { transport } = fakeTransport({
      ok: true,
      data: [
        { id: 'u1', username: 'alice', displayName: 'Alice', avatar: 'https://cdn/a.png', badge: 'conversation', inConversation: true, isFriend: false },
        { id: 'u2', username: 'bob', displayName: null, avatar: null, badge: 'friend', inConversation: false, isFriend: true },
        { id: 'u3', username: 'carl', displayName: '  ', avatar: '', badge: 'inconnu', inConversation: false, isFriend: false },
        { username: 'sans-id' },
        { id: 'u4', username: '' },
        'pas un objet',
      ],
    });
    const result = await fetchMentionSuggestions({ source: 'gateway', transport }, { context: { type: 'conversation', id: 'c1' }, query: 'a' });
    expect(result.ok && result.data).toEqual([
      { id: 'u1', username: 'alice', displayName: 'Alice', avatar: 'https://cdn/a.png', badge: 'conversation' },
      { id: 'u2', username: 'bob', displayName: 'bob', badge: 'friend' },
      { id: 'u3', username: 'carl', displayName: 'carl' },
    ]);
  });

  test('un refus de la passerelle remonte tel quel', async () => {
    const { transport } = fakeTransport({ ok: false, status: 403, error: 'refusé' });
    const result = await fetchMentionSuggestions({ source: 'gateway', transport }, { context: { type: 'conversation', id: 'c1' }, query: 'al' });
    expect(result.ok).toBe(false);
  });

  test('en fixtures, aucun appel réseau : les candidats locaux sont la réponse complète', async () => {
    const { transport, requests } = fakeTransport({ ok: false, status: 0, error: 'jamais appelé' });
    const result = await fetchMentionSuggestions({ source: 'fixtures', transport }, { context: { type: 'conversation', id: 'c1' }, query: 'al' });
    expect(result).toEqual({ ok: true, data: [] });
    expect(requests).toHaveLength(0);
  });
});

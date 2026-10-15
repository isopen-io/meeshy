import { describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from './conversations';
import { conversationStatsQueryKey, decodeConversationStats, loadConversationStats } from './conversation-stats';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * **LE PORT DES STATISTIQUES D'UNE CONVERSATION** (#7835) — `GET
 * /api/v1/conversations/:id/stats`, la route que lit l'onglet Stats de
 * `ConversationInfoSheet.swift` (`ConversationAnalysisService.fetchStats`).
 */

const wire = {
  conversationId: 'c1',
  totalMessages: 42,
  totalWords: 310,
  totalCharacters: 1500,
  contentTypes: { text: 30, image: 5, audio: 3, video: 2, file: 1, location: 1 },
  participantStats: [
    { userId: 'u-nour', username: 'nour', displayName: 'Nour Haddad', avatar: 'https://cdn/nour.jpg', messageCount: 30, wordCount: 200 },
    { userId: 'u-sam', username: 'sam', displayName: null, avatar: null, messageCount: 12, wordCount: 110 },
    { userId: 'u-x', username: null, displayName: null, avatar: null, messageCount: 1, wordCount: 1 },
  ],
  dailyActivity: [{ date: '2026-10-12', count: 3 }],
  hourlyDistribution: { '9': 4 },
  languageDistribution: [{ language: 'fr', count: 30 }],
  updatedAt: '2026-10-12T10:00:00.000Z',
};

describe('decodeConversationStats', () => {
  test('les compteurs, l’activité, les langues ; un participant se nomme par son nom affiché, sinon son pseudo', () => {
    const stats = decodeConversationStats(wire);
    expect(stats?.totalMessages).toBe(42);
    expect(stats?.totalWords).toBe(310);
    expect(stats?.contentTypes).toEqual({ text: 30, image: 5, audio: 3, video: 2, file: 1, location: 1 });
    expect(stats?.participants.map((entry) => entry.name)).toEqual(['Nour Haddad', 'sam', '']);
    expect(stats?.participants[0]?.avatar).toBe('https://cdn/nour.jpg');
    expect(stats?.dailyActivity).toEqual([{ date: '2026-10-12', count: 3 }]);
    expect(stats?.languages).toEqual([{ language: 'fr', count: 30 }]);
  });

  test('une charge vide (conversation sans message) se lit comme zéro, jamais comme une erreur', () => {
    expect(decodeConversationStats({})).toEqual({
      totalMessages: 0,
      totalWords: 0,
      contentTypes: { text: 0, image: 0, audio: 0, video: 0, file: 0, location: 0 },
      participants: [],
      dailyActivity: [],
      languages: [],
    });
  });

  test('une charge qui n’est pas un objet n’est pas une statistique', () => {
    expect(decodeConversationStats('oups')).toBeNull();
  });
});

describe('loadConversationStats', () => {
  test('appelle la route de la passerelle et rend la charge décodée', async () => {
    const calls: HttpRequest[] = [];
    const transport = (async () => ({ ok: false, status: 0, error: '' })) as unknown as HttpTransport;
    transport.request = (async (req: HttpRequest) => {
      calls.push(req);
      return { ok: true, data: wire } as ApiResult<unknown>;
    }) as HttpTransport['request'];
    const deps: ConversationsDeps = { source: 'gateway', transport };
    const result = await loadConversationStats({ ...deps, conversationId: 'c1' });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(['GET /api/v1/conversations/c1/stats']);
    expect(result.ok && result.data.totalMessages).toBe(42);
  });

  test('une clé de cache hors du préfixe des conversations', () => {
    expect(conversationStatsQueryKey('c1')).toEqual(['conversation-stats', 'c1']);
  });
});

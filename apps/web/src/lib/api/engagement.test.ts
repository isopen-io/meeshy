import { describe, expect, test } from 'bun:test';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { ENGAGEMENT_PROGRESS_FIXTURE } from './engagement-fixture';
import { ENGAGEMENT_PROGRESS_PATH, fetchEngagementProgress, loadEngagementProgress } from './engagement';
import { createHttpTransport } from './http';

/**
 * LE PORT DE LA PROGRESSION (#5547) — la requête EXACTE, la garde de
 * frontière, et la source de données qui se lit à la construction.
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

describe('fetchEngagementProgress — la requête que la passerelle attend', () => {
  test('GET /api/v1/me/engagement, sous le jeton de la session', async () => {
    const calls: Call[] = [];
    const transport = transportServing({ success: true, data: ENGAGEMENT_PROGRESS_FIXTURE }, { calls });

    const result = await fetchEngagementProgress(transport);

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`https://gate.test${ENGAGEMENT_PROGRESS_PATH}`);
    expect(calls[0]?.init?.method).toBe('GET');
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBe('Bearer jwt-test');
  });

  test('une charge bien formée est rendue telle quelle', async () => {
    const transport = transportServing({ success: true, data: ENGAGEMENT_PROGRESS_FIXTURE });
    const result = await fetchEngagementProgress(transport);
    expect(result.ok && result.data).toEqual(ENGAGEMENT_PROGRESS_FIXTURE);
  });

  test('une charge MALFORMÉE est refusée entière — jamais un niveau peint depuis un score en chaîne', async () => {
    const transport = transportServing({
      success: true,
      data: { ...ENGAGEMENT_PROGRESS_FIXTURE, level: { engagementScore: '350' } },
    });
    const result = await fetchEngagementProgress(transport);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe('MALFORMED_PAYLOAD');
  });

  test('un refus de la passerelle traverse tel quel, avec son statut', async () => {
    const transport = transportServing({ success: false, error: 'Authentication required' }, { status: 401 });
    const result = await fetchEngagementProgress(transport);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.status).toBe(401);
    expect(!result.ok && result.error).toBe('Authentication required');
  });
});

describe('loadEngagementProgress — la source se lit à la construction', () => {
  test("source 'fixtures' : la fixture résolue, AUCUN appel réseau", async () => {
    const calls: Call[] = [];
    const transport = transportServing({ success: true, data: ENGAGEMENT_PROGRESS_FIXTURE }, { calls });

    const result = await loadEngagementProgress({ source: 'fixtures', transport });

    // Ce qui est sous test est que la fixture est RÉSOLUE sans réseau, pas
    // quel niveau elle atteint : le barème est un paramètre réglable, et un
    // témoin qui l'épingle casse à chaque réglage sans rien dire du transport.
    const attendu = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
    expect(calls).toHaveLength(0);
    expect(result.ok && result.data.level.level).toBe(attendu.level.level);
    expect(result.ok && result.data.badgesEarned).toBe(attendu.badgesEarned);
  });

  test("source 'gateway' : la progression RÉSOLUE depuis la charge servie", async () => {
    const transport = transportServing({
      success: true,
      data: { counters: [{ axisKey: 'content.post', count: 1 }], milestones: [], streak: { currentStreakDays: 1, longestStreakDays: 1 }, level: { engagementScore: 3 } },
    });

    const result = await loadEngagementProgress({ source: 'gateway', transport });

    expect(result.ok && result.data.isEmpty).toBe(false);
    expect(result.ok && result.data.badgesEarned).toBe(1);
    expect(result.ok && result.data.level.nextThreshold).toBe(10);
  });

  test("source 'gateway' : l'échec traverse, l'écran le nomme", async () => {
    const transport = transportServing({ success: false, error: 'boom' }, { status: 500 });
    const result = await loadEngagementProgress({ source: 'gateway', transport });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.status).toBe(500);
  });
});

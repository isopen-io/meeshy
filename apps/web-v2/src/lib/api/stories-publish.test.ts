import { describe, expect, test } from 'bun:test';

import { buildStoryCanvasEffects, studioMediaIds } from '@/lib/stories/story-document';

import { createHttpTransport } from './http';
import { publishStory } from './stories-publish';

const BACKGROUND = { postMediaId: 'pm-bg', fileUrl: '2026/09/u1/bg.jpg' } as const;

function fakeFetch(response: { readonly status: number; readonly body?: unknown }) {
  const calls: Array<{ readonly url: string; readonly init: RequestInit }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), { status: response.status });
  }) as typeof fetch;
  return { impl, calls };
}

function headerOf(init: RequestInit, name: string): string | null {
  const headers = init.headers;
  if (headers instanceof Headers) return headers.get(name);
  if (headers && typeof headers === 'object') {
    const entry = Object.entries(headers as Record<string, string>).find(([k]) => k.toLowerCase() === name.toLowerCase());
    return entry?.[1] ?? null;
  }
  return null;
}

describe('publishStory — POST /api/v1/posts (core.ts:370-462)', () => {
  test('corps exact : type STORY, content, storyEffects, mediaIds ; X-Canvas-Caps posé (§3.3)', async () => {
    const effects = buildStoryCanvasEffects({ text: 'Bonjour', locale: 'fr', background: { ready: BACKGROUND, mediaType: 'image' } })!;
    const { impl, calls } = fakeFetch({ status: 201, body: { success: true, data: { id: 'post-1' } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    const result = await publishStory({
      source: 'gateway',
      transport,
      content: 'Bonjour',
      originalLanguage: 'fr',
      storyEffects: effects,
      mediaIds: studioMediaIds({ background: BACKGROUND }),
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe('post-1');
    const call = calls[0]!;
    expect(call.url).toBe('/api/v1/posts');
    expect(headerOf(call.init, 'X-Canvas-Caps')).toBe('3');
    const body = JSON.parse(String(call.init.body));
    expect(body.type).toBe('STORY');
    expect(body.content).toBe('Bonjour');
    expect(body.mediaIds).toEqual(['pm-bg']);
    expect(body.storyEffects.v).toBe(3);
  });

  test('un média RÉFÉRENCÉ mais absent de mediaIds ⇒ le port refuse, AUCUN appel réseau', async () => {
    const effects = buildStoryCanvasEffects({ text: '', locale: 'fr', background: { ready: BACKGROUND, mediaType: 'image' } })!;
    const { impl, calls } = fakeFetch({ status: 201, body: { success: true, data: { id: 'post-1' } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    const result = await publishStory({ source: 'gateway', transport, content: '', storyEffects: effects, mediaIds: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MEDIA_NOT_CLAIMED');
    expect(calls).toHaveLength(0);
  });

  test('un refus CANVAS_INVALID de la passerelle (core.ts:118-129) traverse tel quel', async () => {
    const effects = buildStoryCanvasEffects({ text: 'x', locale: 'fr' })!;
    const { impl } = fakeFetch({ status: 400, body: { success: false, error: 'Invalid canvas', code: 'CANVAS_INVALID' } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    const result = await publishStory({ source: 'gateway', transport, content: 'x', storyEffects: effects, mediaIds: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe('CANVAS_INVALID');
    }
  });

  test('un échec serveur (429) traverse tel quel — le composeur affiche sa raison', async () => {
    const effects = buildStoryCanvasEffects({ text: 'x', locale: 'fr' })!;
    const { impl } = fakeFetch({ status: 429, body: { success: false, error: 'Too many requests', retryAfter: 12 } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    const result = await publishStory({ source: 'gateway', transport, content: 'x', storyEffects: effects, mediaIds: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(429);
      expect(result.retryAfter).toBe(12);
    }
  });
});

describe('publishStory — la source fixtures ne touche jamais le réseau', () => {
  test('source fixtures ⇒ un identifiant simulé, aucun fetch, le document toujours VALIDÉ', async () => {
    const effects = buildStoryCanvasEffects({ text: 'Bonjour', locale: 'fr' })!;
    const { impl, calls } = fakeFetch({ status: 500 });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    const result = await publishStory({ source: 'fixtures', transport, content: 'Bonjour', storyEffects: effects, mediaIds: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id.startsWith('fx-story-')).toBe(true);
    expect(calls).toHaveLength(0);

    const refused = await publishStory({
      source: 'fixtures',
      transport,
      content: '',
      storyEffects: buildStoryCanvasEffects({ text: '', locale: 'fr', background: { ready: BACKGROUND, mediaType: 'image' } })!,
      mediaIds: [],
    });
    expect(refused.ok).toBe(false);
  });
});

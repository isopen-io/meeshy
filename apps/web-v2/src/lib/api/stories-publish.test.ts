import { describe, expect, test } from 'bun:test';

import { buildStoryCanvasEffects, studioMediaIds } from '@/lib/stories/story-document';
import { newTextLayer } from '@/lib/stories/studio-text';

import { createHttpTransport } from './http';
import { publishStory } from './stories-publish';

const BACKGROUND = { postMediaId: 'pm-bg', fileUrl: '2026/09/u1/bg.jpg' } as const;
const texts = (text: string) => (text === '' ? [] : [newTextLayer({ id: 'text-1', language: 'fr', text })]);

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
    const effects = buildStoryCanvasEffects({ texts: texts('Bonjour'), background: { source: BACKGROUND, mediaType: 'image' } })!;
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
    const effects = buildStoryCanvasEffects({ texts: [], background: { source: BACKGROUND, mediaType: 'image' } })!;
    const { impl, calls } = fakeFetch({ status: 201, body: { success: true, data: { id: 'post-1' } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    const result = await publishStory({ source: 'gateway', transport, content: '', storyEffects: effects, mediaIds: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MEDIA_NOT_CLAIMED');
    expect(calls).toHaveLength(0);
  });

  test('un document AVEC texte de scène ⇒ corps POST SANS `content` (défaut 4, revue-correction)', async () => {
    const effects = buildStoryCanvasEffects({ texts: texts('Bonjour') })!;
    const { impl, calls } = fakeFetch({ status: 201, body: { success: true, data: { id: 'post-1' } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    await publishStory({ source: 'gateway', transport, originalLanguage: 'fr', storyEffects: effects, mediaIds: [] });

    const body = JSON.parse(String(calls[0]!.init.body));
    expect('content' in body).toBe(false);
    expect(body.storyEffects.scenes[0].objects.some((o: { kind: string }) => o.kind === 'text')).toBe(true);
  });

  /** **LA LÉGENDE D'UN MÉDIA VOYAGE, ET SÉPARÉMENT DE `content`** (#6944) —
   * `mediaCaption` est la carte `{ postMediaId → texte }` que
   * `CreatePostSchema` attend (`routes/posts/types.ts:282`) ; `content` est le
   * contenu de la PUBLICATION, qu'une story n'a pas. Les confondre est la
   * faute que la directive porteur du 2026-09-17 a levée. */
  test('`mediaCaption` part dans le corps, et une story reste SANS `content`', async () => {
    const effects = buildStoryCanvasEffects({ texts: texts('Bonjour'), background: { source: BACKGROUND, mediaType: 'image' } })!;
    const { impl, calls } = fakeFetch({ status: 201, body: { success: true, data: { id: 'post-1' } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    await publishStory({
      source: 'gateway',
      transport,
      originalLanguage: 'fr',
      mediaCaption: { 'pm-bg': 'Au lever du jour' },
      storyEffects: effects,
      mediaIds: studioMediaIds({ background: BACKGROUND }),
    });

    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.mediaCaption).toEqual({ 'pm-bg': 'Au lever du jour' });
    expect('content' in body).toBe(false);
  });

  test('aucune légende ⇒ AUCUNE clé `mediaCaption` dans le corps', async () => {
    const effects = buildStoryCanvasEffects({ texts: texts('Bonjour') })!;
    const { impl, calls } = fakeFetch({ status: 201, body: { success: true, data: { id: 'post-1' } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    await publishStory({ source: 'gateway', transport, storyEffects: effects, mediaIds: [] });
    expect('mediaCaption' in JSON.parse(String(calls[0]!.init.body))).toBe(false);
  });

  test('un refus CANVAS_INVALID de la passerelle (core.ts:118-129) traverse tel quel', async () => {
    const effects = buildStoryCanvasEffects({ texts: texts('x') })!;
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
    const effects = buildStoryCanvasEffects({ texts: texts('x') })!;
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
    const effects = buildStoryCanvasEffects({ texts: texts('Bonjour') })!;
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
      storyEffects: buildStoryCanvasEffects({ texts: [], background: { source: BACKGROUND, mediaType: 'image' } })!,
      mediaIds: [],
    });
    expect(refused.ok).toBe(false);
  });
});

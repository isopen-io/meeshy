import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from './http';
import { POST_CONTENT_MAX_LENGTH, publishPost, publishRefusalOf, type PublishableMedia } from './posts-publish';

/**
 * LE PORT DE PUBLICATION D'UN POST ET D'UN RÉEL (#7449).
 *
 * Deux affirmations, et la seconde est celle qui coûte : le corps envoyé est
 * celui que `CreatePostSchema` attend, ET un réel non qualifiant est REFUSÉ
 * ICI — jamais laissé partir pour être dégradé en post par le serveur, sans un
 * mot à l'auteur.
 */

function fakeFetch(response: { readonly status: number; readonly body?: unknown }) {
  const calls: Array<{ readonly url: string; readonly init: RequestInit }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), { status: response.status });
  }) as typeof fetch;
  return { impl, calls };
}

const VIDEO = (durationMs: number | null): PublishableMedia => ({ postMediaId: 'pm-v', mimeType: 'video/mp4', durationMs });
const IMAGE = (id: string): PublishableMedia => ({ postMediaId: id, mimeType: 'image/jpeg' });

describe('publishPost — POST /api/v1/posts', () => {
  test('un POST de texte : type POST, content, aucun mediaIds, aucune visibility', async () => {
    const { impl, calls } = fakeFetch({ status: 201, body: { success: true, data: { id: 'post-1' } } });
    const result = await publishPost({
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      type: 'POST',
      content: 'Bonjour le fil',
      originalLanguage: 'fr',
      media: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe('post-1');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(calls[0]!.url).toBe('/api/v1/posts');
    expect(body.type).toBe('POST');
    expect(body.content).toBe('Bonjour le fil');
    expect(body.originalLanguage).toBe('fr');
    expect('mediaIds' in body).toBe(false);
    /* L'AUDIENCE EST UNE RÈGLE SERVEUR — un défaut recopié ici est exactement
       ce qui avait laissé les stories web à FRIENDS quand les posts naissaient
       publics. */
    expect('visibility' in body).toBe(false);
  });

  test('un RÉEL qualifiant part avec ses médias, et rien qu’eux', async () => {
    const { impl, calls } = fakeFetch({ status: 201, body: { success: true, data: { id: 'reel-1' } } });
    const result = await publishPost({
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      type: 'REEL',
      media: [VIDEO(8_000)],
    });

    expect(result.ok).toBe(true);
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.type).toBe('REEL');
    expect(body.mediaIds).toEqual(['pm-v']);
    /* Un texte VIDE ne part pas comme chaîne vide : `content` reste absent,
       même discipline que `publishStory`. */
    expect('content' in body).toBe(false);
  });

  test('un RÉEL non qualifiant est REFUSÉ, et AUCUN octet ne part', async () => {
    const { impl, calls } = fakeFetch({ status: 201, body: { success: true, data: { id: 'reel-1' } } });
    const result = await publishPost({
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      type: 'REEL',
      content: 'un réel de texte',
      media: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('REEL_NOT_QUALIFYING');
    expect(calls.length).toBe(0);
  });

  test('un brouillon VIDE est refusé avant le réseau — le serveur rendrait 400', async () => {
    const { impl, calls } = fakeFetch({ status: 201, body: { success: true, data: { id: 'x' } } });
    const result = await publishPost({
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      type: 'POST',
      content: '   ',
      media: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('POST_EMPTY');
    expect(calls.length).toBe(0);
  });
});

describe('publishRefusalOf — la règle de composition, par la source UNIQUE du dépôt', () => {
  test('une vidéo de moins de trois secondes ne qualifie pas ; huit secondes, si', () => {
    expect(publishRefusalOf({ type: 'REEL', content: '', media: [VIDEO(1_500)] })).toBe('reel-without-qualifying-media');
    expect(publishRefusalOf({ type: 'REEL', content: '', media: [VIDEO(8_000)] })).toBeNull();
  });

  /* Une durée INCONNUE ne qualifie jamais — le navigateur n'a pas su décoder
     les métadonnées, et un repli permissif enverrait un réel que le serveur
     dégraderait. */
  test('une durée inconnue ne qualifie pas', () => {
    expect(publishRefusalOf({ type: 'REEL', content: '', media: [VIDEO(null)] })).toBe('reel-without-qualifying-media');
  });

  test('UNE image ne fait pas un réel, DEUX oui', () => {
    expect(publishRefusalOf({ type: 'REEL', content: '', media: [IMAGE('a')] })).toBe('reel-without-qualifying-media');
    expect(publishRefusalOf({ type: 'REEL', content: '', media: [IMAGE('a'), IMAGE('b')] })).toBeNull();
  });

  /* La même composition est un POST parfaitement valide : la qualification ne
     garde QUE le réel. */
  test('ce qui ne fait pas un réel fait un post', () => {
    expect(publishRefusalOf({ type: 'POST', content: '', media: [IMAGE('a')] })).toBeNull();
    expect(publishRefusalOf({ type: 'POST', content: 'un mot', media: [] })).toBeNull();
  });

  test('la borne du texte est celle du schéma serveur', () => {
    expect(POST_CONTENT_MAX_LENGTH).toBe(5000);
  });
});

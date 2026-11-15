import { describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from './conversations';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { createTextPost, publishFromAttachment, repostWithCaption } from './share-publish';

/**
 * Les trois PORTS de l'envoi vers une publication (#8884) — chacun pose SON
 * corps sur SA route, rien de plus : les règles (quoi publier, sous quel
 * format) vivent dans `lib/send/send-sheet-plan.ts`.
 */
const recording = (respond: ApiResult<unknown> = { ok: true, data: { id: 'post-1' } }) => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
      requests.push(request);
      return respond as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  const deps: ConversationsDeps = { source: 'gateway', transport };
  return { deps, requests };
};

describe('publishFromAttachment', () => {
  test('POST /posts/from-attachment avec la pièce, le format et la légende', async () => {
    const { deps, requests } = recording();
    const result = await publishFromAttachment({ ...deps, attachmentId: 'att-1', target: 'STORY', content: 'Regarde' });
    expect(result.ok).toBe(true);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.path).toBe('/api/v1/posts/from-attachment');
    expect(requests[0]?.body).toEqual({ attachmentId: 'att-1', target: 'STORY', content: 'Regarde' });
  });

  test('sans légende, la clé content est ABSENTE (jamais une chaîne vide)', async () => {
    const { deps, requests } = recording();
    await publishFromAttachment({ ...deps, attachmentId: 'att-1', target: 'POST' });
    expect(requests[0]?.body).toEqual({ attachmentId: 'att-1', target: 'POST' });
  });

  test('une légende blanche ne part pas', async () => {
    const { deps, requests } = recording();
    await publishFromAttachment({ ...deps, attachmentId: 'att-1', target: 'REEL', content: '   ' });
    expect(requests[0]?.body).toEqual({ attachmentId: 'att-1', target: 'REEL' });
  });

  test('un refus de la passerelle est rendu tel quel', async () => {
    const { deps } = recording({ ok: false, status: 400, error: 'protégé', code: 'PROTECTED_MEDIA' });
    const result = await publishFromAttachment({ ...deps, attachmentId: 'att-1', target: 'POST' });
    expect(result).toEqual({ ok: false, status: 400, error: 'protégé', code: 'PROTECTED_MEDIA' });
  });

  test('fixtures : aucun appel réseau, un identifiant', async () => {
    const { requests, deps } = recording();
    const result = await publishFromAttachment({ ...deps, source: 'fixtures', attachmentId: 'att-1', target: 'POST' });
    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(0);
  });
});

describe('repostWithCaption', () => {
  test('une légende fait une CITATION : isQuote vrai, targetType et content posés', async () => {
    const { deps, requests } = recording();
    await repostWithCaption({ ...deps, postId: 'p9', targetType: 'STORY', content: 'À voir', isQuote: true });
    expect(requests[0]?.path).toBe('/api/v1/posts/p9/repost');
    expect(requests[0]?.body).toEqual({ targetType: 'STORY', content: 'À voir', isQuote: true });
  });

  test('sans légende : repost simple, isQuote faux, pas de content', async () => {
    const { deps, requests } = recording();
    await repostWithCaption({ ...deps, postId: 'p9', targetType: 'REEL', isQuote: false });
    expect(requests[0]?.body).toEqual({ targetType: 'REEL', isQuote: false });
  });

  test('chaque appel porte sa propre clé de mutation (rejouable sans doublon)', async () => {
    const { deps, requests } = recording();
    await repostWithCaption({ ...deps, postId: 'p9', isQuote: false });
    await repostWithCaption({ ...deps, postId: 'p9', isQuote: false });
    const first = requests[0]?.headers?.['X-Client-Mutation-Id'];
    const second = requests[1]?.headers?.['X-Client-Mutation-Id'];
    expect(typeof first).toBe('string');
    expect(first).not.toBe(second);
  });
});

describe('createTextPost', () => {
  test('POST /posts avec le type et le texte', async () => {
    const { deps, requests } = recording();
    await createTextPost({ ...deps, type: 'POST', content: 'Bonjour https://meeshy.me/x' });
    expect(requests[0]?.path).toBe('/api/v1/posts');
    expect(requests[0]?.body).toEqual({ type: 'POST', content: 'Bonjour https://meeshy.me/x' });
  });
});

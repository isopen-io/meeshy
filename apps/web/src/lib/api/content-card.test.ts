import { describe, expect, test } from 'bun:test';

import { ApiError } from './client';
import { contentPostStateOf, contentTargetStateOf, loadContentLinkTarget } from './content-card';
import type { FeedPost } from './feed-pages';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * **LES DONNÉES ET LES ÉTATS DE LA CARTE D'UN CONTENU (#19334).**
 *
 * - un lien suivi se résout en contenu, ou en « pas un contenu » ;
 * - la carte a quatre états : en chargement (rien de connu), la carte (même
 *   périmée), indisponible (le refus de la passerelle, 404 compris) et
 *   l'échec réseau, où le lien reste tel quel.
 */

const POST_ID = '66f0c0ffee0000000000c0de';

const transportOf = (replies: Readonly<Record<string, ApiResult<unknown>>>) => {
  const calls: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'never' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    calls.push(req);
    return replies[`${req.method} ${req.path}`] ?? { ok: false, status: 404, error: 'not found' };
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, calls: () => calls };
};

const RESOLVE = 'GET /api/v1/tracking-links/Ab3xYz/resolve';

describe('loadContentLinkTarget — ce qu’un lien suivi désigne', () => {
  test('une cible typée de partage est un contenu', async () => {
    const { deps } = transportOf({ [RESOLVE]: { ok: true, data: { kind: 'tracking', isActive: true, targetType: 'REEL', targetId: POST_ID, originalUrl: null } } });
    expect(await loadContentLinkTarget({ ...deps, token: 'Ab3xYz' })).toEqual({ ok: true, data: { postId: POST_ID, type: 'REEL' } });
  });

  test('un jeton frappé depuis un message (cible EXTERNAL) vaut son adresse d’origine', async () => {
    const { deps } = transportOf({
      [RESOLVE]: { ok: true, data: { kind: 'tracking', isActive: true, targetType: 'EXTERNAL', targetId: null, originalUrl: `https://meeshy.me/post/${POST_ID}` } },
    });
    expect(await loadContentLinkTarget({ ...deps, token: 'Ab3xYz' })).toEqual({ ok: true, data: { postId: POST_ID, type: 'POST' } });
  });

  test('un site, une invitation ou un lien mort ne sont pas des contenus', async () => {
    const site = transportOf({ [RESOLVE]: { ok: true, data: { kind: 'tracking', isActive: true, targetType: 'EXTERNAL', originalUrl: 'https://example.com' } } });
    const invitation = transportOf({ [RESOLVE]: { ok: true, data: { kind: 'conversation', isActive: true, originalUrl: null } } });
    const dead = transportOf({ [RESOLVE]: { ok: false, status: 404, error: 'not found' } });
    for (const { deps } of [site, invitation, dead]) {
      expect(await loadContentLinkTarget({ ...deps, token: 'Ab3xYz' })).toEqual({ ok: true, data: null });
    }
  });

  test('une passerelle injoignable reste un échec : la carte retombera sur le lien', async () => {
    const { deps } = transportOf({ [RESOLVE]: { ok: false, status: 0, error: 'offline' } });
    expect((await loadContentLinkTarget({ ...deps, token: 'Ab3xYz' })).ok).toBe(false);
  });
});

const cached: FeedPost = { id: POST_ID, type: 'POST', createdAt: '2026-11-17T09:00:00.000Z', content: 'Le marché du matin' };

describe('contentPostStateOf — les quatre états de la carte', () => {
  test('rien de connu, rien d’échoué : le squelette', () => {
    expect(contentPostStateOf({ data: undefined, error: null })).toEqual({ kind: 'loading' });
  });

  test('une carte connue se peint, même pendant une relecture qui échoue', () => {
    expect(contentPostStateOf({ data: cached, error: null })).toEqual({ kind: 'card', post: cached });
    expect(contentPostStateOf({ data: cached, error: new ApiError({ ok: false, status: 0, error: 'offline' }) })).toEqual({ kind: 'card', post: cached });
  });

  test('le refus de la passerelle (supprimé, expiré, hors audience) : indisponible, même si une carte était connue', () => {
    for (const status of [403, 404, 410]) {
      expect(contentPostStateOf({ data: undefined, error: new ApiError({ ok: false, status, error: 'refused' }) })).toEqual({ kind: 'unavailable' });
    }
    expect(contentPostStateOf({ data: cached, error: new ApiError({ ok: false, status: 404, error: 'gone' }) })).toEqual({ kind: 'unavailable' });
  });

  test('une panne sans rien de connu : l’échec, jamais un trou', () => {
    expect(contentPostStateOf({ data: undefined, error: new ApiError({ ok: false, status: 503, error: 'down' }) })).toEqual({ kind: 'failed' });
  });
});

describe('contentTargetStateOf — un lien suivi avant sa carte', () => {
  test('en résolution, résolu en contenu, résolu en autre chose, en échec', () => {
    expect(contentTargetStateOf({ data: undefined, error: null })).toEqual({ kind: 'loading' });
    expect(contentTargetStateOf({ data: { postId: POST_ID, type: null }, error: null })).toEqual({ kind: 'content', target: { postId: POST_ID, type: null } });
    expect(contentTargetStateOf({ data: null, error: null })).toEqual({ kind: 'none' });
    expect(contentTargetStateOf({ data: undefined, error: new ApiError({ ok: false, status: 0, error: 'offline' }) })).toEqual({ kind: 'failed' });
  });

  test('la publication qui porte le lien ne se cite pas elle-même, même par un lien suivi', () => {
    expect(contentTargetStateOf({ data: { postId: POST_ID, type: 'POST' }, error: null }, POST_ID)).toEqual({ kind: 'none' });
  });
});

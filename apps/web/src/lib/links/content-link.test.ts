import { describe, expect, test } from 'bun:test';

import type { TrackingResolution } from './tracking-redirect';
import { CONTENT_CARD_CANDIDATES, contentLinksIn, contentOfTrackingResolution, contentRouteOf, linkEmbedOf } from './content-link';

/**
 * **QUEL LIEN D'UN TEXTE DEVIENT LA CARTE D'UN CONTENU (#19334, parapluie #19331).**
 *
 * La loi de reconnaissance est celle de `@meeshy/shared/utils/content-link`
 * (ses vecteurs sont dans `packages/shared/__tests__/content-link.test.ts`) ;
 * ces témoins disent ce que le web en fait : quel lien d'un message ou d'une
 * publication est retenu, comment un lien suivi se lit une fois résolu, quelle
 * carte gagne quand un message en porte plusieurs, et où mène le geste.
 */

const POST_ID = '66f0c0ffee0000000000c0de';
const OTHER_ID = '66f0c0ffee0000000000beef';
const THIRD_ID = '66f0c0ffee0000000000f00d';

const CONTEXT = { origins: ['https://staging.meeshy.me'], isAppPath: (path: string) => /^\/(c|chat|u|post|reel|story|mood)\//u.test(path) };

describe('contentLinksIn — les liens de contenu d’un texte, dans l’ordre du texte', () => {
  test('une adresse directe donne son contenu et son type', () => {
    expect(contentLinksIn(`Regarde https://meeshy.me/reel/${POST_ID} !`, {})).toEqual([{ kind: 'content', postId: POST_ID, type: 'REEL' }]);
  });

  test('une URL que la passerelle a rendue traçable se lit sous son adresse d’ORIGINE, jamais sous son jeton', () => {
    const text = `Vu ça : https://meeshy.me/post/${POST_ID}`;
    const trackingLinks = [{ token: 'Ab3xYz', url: `https://meeshy.me/post/${POST_ID}` }];
    expect(contentLinksIn(text, { trackingLinks })).toEqual([{ kind: 'content', postId: POST_ID, type: 'POST' }]);
  });

  test('un lien suivi `/l/<jeton>` frappé par une feuille de partage reste à résoudre', () => {
    expect(contentLinksIn('https://meeshy.me/l/Ab3xYz', {})).toEqual([{ kind: 'tracked', token: 'Ab3xYz' }]);
  });

  test('chaque lien une fois, au plus trois candidats, dans l’ordre écrit', () => {
    const text = [
      `https://meeshy.me/story/${POST_ID}`,
      `https://meeshy.me/story/${POST_ID}`,
      'https://meeshy.me/l/Ab3xYz',
      `https://meeshy.me/mood/${OTHER_ID}`,
      `https://meeshy.me/post/${THIRD_ID}`,
    ].join(' et ');
    expect(contentLinksIn(text, {})).toEqual([
      { kind: 'content', postId: POST_ID, type: 'STORY' },
      { kind: 'tracked', token: 'Ab3xYz' },
      { kind: 'content', postId: OTHER_ID, type: 'STATUS' },
    ]);
    expect(CONTENT_CARD_CANDIDATES).toBe(3);
  });

  test('une publication ne se cite pas elle-même', () => {
    const text = `moi : https://meeshy.me/post/${POST_ID} et lui : https://meeshy.me/reel/${OTHER_ID}`;
    expect(contentLinksIn(text, { excludePostId: POST_ID })).toEqual([{ kind: 'content', postId: OTHER_ID, type: 'REEL' }]);
  });

  test('ni un autre hôte, ni une autre adresse Meeshy, ni un `m+<jeton>` ne sont des contenus', () => {
    const text = `https://evil.example/post/${POST_ID} https://meeshy.me/u/amani https://meeshy.me/chat/mshy_beta m+Ab3xYz`;
    expect(contentLinksIn(text, {})).toEqual([]);
  });

  test('un texte sans lien ne coûte rien', () => {
    expect(contentLinksIn('Bonjour à tous', {})).toEqual([]);
  });
});

const resolution = (overrides: Partial<TrackingResolution> = {}): TrackingResolution => ({
  kind: 'tracking',
  originalUrl: null,
  isActive: true,
  content: null,
  ...overrides,
});

describe('contentOfTrackingResolution — ce que désigne un lien suivi, une fois résolu', () => {
  test('une cible TYPÉE est un contenu', () => {
    expect(contentOfTrackingResolution(resolution({ content: { type: 'STORY', id: POST_ID } }))).toEqual({ postId: POST_ID, type: 'STORY' });
  });

  test('sans cible typée (jeton frappé depuis un message), l’adresse d’origine décide par la même loi', () => {
    expect(contentOfTrackingResolution(resolution({ originalUrl: `https://www.meeshy.me/feeds/post/${POST_ID}` }))).toEqual({ postId: POST_ID, type: null });
  });

  test('une cible typée dont l’identifiant n’est pas un ObjectId ne vaut rien, l’adresse d’origine reste lue', () => {
    expect(contentOfTrackingResolution(resolution({ content: { type: 'POST', id: '123' } }))).toBeNull();
    expect(contentOfTrackingResolution(resolution({ content: { type: 'POST', id: '123' }, originalUrl: `https://meeshy.me/mood/${OTHER_ID}` }))).toEqual({
      postId: OTHER_ID,
      type: 'STATUS',
    });
  });

  test('une invitation, un site ou un autre lien suivi ne sont pas des contenus', () => {
    expect(contentOfTrackingResolution(resolution({ kind: 'conversation', originalUrl: `https://meeshy.me/post/${POST_ID}` }))).toBeNull();
    expect(contentOfTrackingResolution(resolution({ originalUrl: 'https://example.com/article' }))).toBeNull();
    expect(contentOfTrackingResolution(resolution({ originalUrl: 'https://meeshy.me/l/Zz9yXw' }))).toBeNull();
  });
});

describe('linkEmbedOf — UNE carte par message, et l’ordre de préséance', () => {
  test('la carte de conversation passe avant la carte de contenu, même écrite après', () => {
    const text = `https://meeshy.me/post/${POST_ID} puis https://meeshy.me/chat/mshy_beta`;
    expect(linkEmbedOf(text, CONTEXT)).toEqual({ kind: 'conversation', targets: [{ kind: 'share-link', identifier: 'mshy_beta' }] });
  });

  test('sans conversation, les liens de contenu sont les candidats', () => {
    expect(linkEmbedOf(`https://meeshy.me/l/Ab3xYz et https://meeshy.me/reel/${POST_ID}`, CONTEXT)).toEqual({
      kind: 'content',
      candidates: [
        { kind: 'tracked', token: 'Ab3xYz' },
        { kind: 'content', postId: POST_ID, type: 'REEL' },
      ],
    });
  });

  test('sans lien Meeshy, aucune carte', () => {
    expect(linkEmbedOf('https://example.com et rien d’autre', CONTEXT)).toBeNull();
  });
});

describe('contentRouteOf — le geste ouvre le contenu à SA place', () => {
  test('chaque type a sa porte, un type inconnu ouvre le détail', () => {
    expect(contentRouteOf('POST')).toBe('post');
    expect(contentRouteOf('REEL')).toBe('reel');
    expect(contentRouteOf('STORY')).toBe('story');
    expect(contentRouteOf('STATUS')).toBe('mood');
    expect(contentRouteOf(null)).toBe('postDeepLink');
  });
});

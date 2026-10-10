import { describe, expect, test } from 'bun:test';

import type { ApiFailure, ApiResult } from '@/lib/api/http';

import { decideTrackingRedirect, isTrackingToken, safeExternalTarget, sharedContentPath, type TrackingClick, type TrackingResolution } from './tracking-redirect';

/**
 * OÙ MÈNE UN LIEN SUIVI (#6714) — la décision est PURE : deux réponses de la
 * passerelle entrent, une issue sort. Les témoins couvrent les issues que
 * l'écran dessine, et d'abord la seule qui protège le lecteur : une cible qui
 * n'est pas une adresse web ne sort JAMAIS de la page.
 */

const TOKEN = 'abc123';

const clicked = (originalUrl: string | null): ApiResult<TrackingClick> => ({ ok: true, data: { originalUrl } });

const resolved = (overrides: Partial<TrackingResolution> = {}): ApiResult<TrackingResolution> => ({
  ok: true,
  data: { kind: 'tracking', originalUrl: 'https://meeshy.me/post/p1', isActive: true, ...overrides },
});

const refused = (status: number, code?: string): ApiFailure => ({ ok: false, status, error: 'refus', ...(code === undefined ? {} : { code }) });

describe('safeExternalTarget — seule une adresse web sort de la page', () => {
  test('http et https passent, normalisées par le parseur', () => {
    expect(safeExternalTarget('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeExternalTarget('http://Example.com')).toBe('http://example.com/');
  });

  test('tout autre schéma est refusé', () => {
    for (const raw of [
      'javascript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'meeshy://p/1',
      'vbscript:msgbox(1)',
    ]) {
      expect({ raw, target: safeExternalTarget(raw) }).toEqual({ raw, target: null });
    }
  });

  test('les caractères que le parseur retire ne déguisent pas un javascript:', () => {
    expect(safeExternalTarget('java\tscript:alert(1)')).toBeNull();
    expect(safeExternalTarget(' javascript:alert(1)')).toBeNull();
  });

  test('ce qui n’est pas une adresse absolue n’en devient pas une', () => {
    for (const raw of ['', '   ', '/post/p1', 'example.com', null, undefined, 42]) {
      expect({ raw, target: safeExternalTarget(raw) }).toEqual({ raw, target: null });
    }
  });
});

describe('isTrackingToken — la forme que la passerelle accepte', () => {
  test('2 à 50 caractères : lettres, chiffres, tiret, souligné', () => {
    expect(isTrackingToken('ab')).toBe(true);
    expect(isTrackingToken('mshy_abc-123')).toBe(true);
    expect(isTrackingToken('a')).toBe(false);
    expect(isTrackingToken('a'.repeat(51))).toBe(false);
    expect(isTrackingToken('abc/def')).toBe(false);
    expect(isTrackingToken('abc def')).toBe(false);
  });
});

describe('decideTrackingRedirect — le clic compté, la cible ouverte', () => {
  test('une cible https : le lecteur la rejoint', () => {
    expect(decideTrackingRedirect({ token: TOKEN, click: clicked('https://example.com/a?b=1'), resolution: resolved() })).toEqual({
      kind: 'leave',
      target: 'https://example.com/a?b=1',
    });
  });

  test('javascript: est refusé et traité comme un lien mort', () => {
    const resolution = resolved({ originalUrl: 'javascript:alert(document.cookie)' });
    expect(decideTrackingRedirect({ token: TOKEN, click: clicked('javascript:alert(document.cookie)'), resolution })).toEqual({ kind: 'dead' });
  });

  test('data: aussi, même quand la résolution est hors ligne', () => {
    expect(decideTrackingRedirect({ token: TOKEN, click: clicked('data:text/html,x'), resolution: refused(0) })).toEqual({ kind: 'dead' });
  });

  test('le clic tombe en panne mais la résolution sert une cible sûre : le lecteur part quand même', () => {
    expect(decideTrackingRedirect({ token: TOKEN, click: refused(500), resolution: resolved() })).toEqual({
      kind: 'leave',
      target: 'https://meeshy.me/post/p1',
    });
  });

  test('une invitation de conversation mène à la jonction de la v2', () => {
    const resolution = resolved({ kind: 'conversation', originalUrl: null });
    expect(decideTrackingRedirect({ token: TOKEN, click: refused(404), resolution })).toEqual({ kind: 'join', linkId: TOKEN });
  });
});

describe('decideTrackingRedirect — un lien mort le dit', () => {
  test('inconnu : 404 des deux côtés', () => {
    expect(decideTrackingRedirect({ token: TOKEN, click: refused(404), resolution: refused(404) })).toEqual({ kind: 'dead' });
  });

  test('expiré ou désactivé : 410 au clic, inactif à la résolution', () => {
    const resolution = resolved({ isActive: false });
    expect(decideTrackingRedirect({ token: TOKEN, click: refused(410, 'LINK_EXPIRED'), resolution })).toEqual({ kind: 'dead' });
  });

  test('désactivé : la résolution l’emporte même si le clic avait répondu', () => {
    const resolution = resolved({ isActive: false });
    expect(decideTrackingRedirect({ token: TOKEN, click: clicked('https://example.com/'), resolution })).toEqual({ kind: 'dead' });
  });

  test('une invitation désactivée est morte aussi', () => {
    const resolution = resolved({ kind: 'conversation', originalUrl: null, isActive: false });
    expect(decideTrackingRedirect({ token: TOKEN, click: refused(404), resolution })).toEqual({ kind: 'dead' });
  });

  test('un jeton hors forme ne mène nulle part, quelle que soit la réponse', () => {
    expect(decideTrackingRedirect({ token: 'a', click: clicked('https://example.com/'), resolution: resolved() })).toEqual({ kind: 'dead' });
  });

  test('un 404 d’un côté suffit, même si l’autre côté n’a pas répondu', () => {
    expect(decideTrackingRedirect({ token: TOKEN, click: refused(0), resolution: refused(404) })).toEqual({ kind: 'dead' });
  });
});

describe('decideTrackingRedirect — une passerelle en échec n’est pas un lien mort', () => {
  test('panne des deux côtés : indisponible', () => {
    expect(decideTrackingRedirect({ token: TOKEN, click: refused(500), resolution: refused(502) })).toEqual({ kind: 'unavailable' });
  });

  test('aucune réponse des deux côtés : hors ligne', () => {
    expect(decideTrackingRedirect({ token: TOKEN, click: refused(0), resolution: refused(0) })).toEqual({ kind: 'offline' });
  });

  test('un délai dépassé est une passerelle muette, pas un réseau coupé', () => {
    expect(decideTrackingRedirect({ token: TOKEN, click: refused(0, 'TIMEOUT'), resolution: refused(0, 'TIMEOUT') })).toEqual({
      kind: 'unavailable',
    });
  });
});

describe('un CONTENU partagé s’ouvre dans sa page, avec la trace du partageur (#9149)', () => {
  const POST_ID = '6abfd6cb9fa9a97766e6bf7a';

  test('un réel partagé ouvre sa page canonique, sans quitter l’application', () => {
    const outcome = decideTrackingRedirect({
      token: TOKEN,
      click: clicked(`https://meeshy.me/reel/${POST_ID}`),
      resolution: resolved({ content: { type: 'REEL', id: POST_ID } }),
    });
    expect(outcome).toEqual({ kind: 'open', content: { type: 'REEL', id: POST_ID }, via: TOKEN });
  });

  test('chaque type de contenu partagé s’ouvre', () => {
    for (const type of ['POST', 'REEL', 'STORY', 'STATUS'] as const) {
      const outcome = decideTrackingRedirect({ token: TOKEN, click: refused(500), resolution: resolved({ content: { type, id: POST_ID } }) });
      expect(outcome).toEqual({ kind: 'open', content: { type, id: POST_ID }, via: TOKEN });
    }
  });

  test('un lien éteint ne rouvre pas son contenu', () => {
    const outcome = decideTrackingRedirect({ token: TOKEN, click: refused(410), resolution: resolved({ isActive: false, content: { type: 'REEL', id: POST_ID } }) });
    expect(outcome).toEqual({ kind: 'dead' });
  });

  test('un identifiant de contenu hors forme retombe sur l’adresse servie', () => {
    const outcome = decideTrackingRedirect({
      token: TOKEN,
      click: clicked('https://meeshy.me/post/p1'),
      resolution: resolved({ content: { type: 'POST', id: '../admin' } }),
    });
    expect(outcome).toEqual({ kind: 'leave', target: 'https://meeshy.me/post/p1' });
  });
});

describe('sharedContentPath — l’adresse canonique, `?via=` compris', () => {
  test('un réel, une publication, une story, une humeur', () => {
    expect(sharedContentPath({ type: 'REEL', id: 'r1' }, 'abc123')).toBe('/reel/r1?via=abc123');
    expect(sharedContentPath({ type: 'POST', id: 'p1' }, 'abc123')).toBe('/post/p1?via=abc123');
    expect(sharedContentPath({ type: 'STORY', id: 's1' }, 'abc123')).toBe('/story/s1?via=abc123');
    expect(sharedContentPath({ type: 'STATUS', id: 'm1' }, 'abc123')).toBe('/mood/m1?via=abc123');
  });
});

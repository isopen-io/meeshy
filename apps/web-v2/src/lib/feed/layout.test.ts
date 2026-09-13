import { describe, expect, test } from 'bun:test';

import { clampRatio, feedMediaKindOf, postMediaRatio, reelCardRatio } from './layout';

describe('clampRatio', () => {
  test('borne des deux côtés', () => {
    expect(clampRatio(0.5, 0.75, 1.4)).toBe(0.75);
    expect(clampRatio(2, 0.75, 1.4)).toBe(1.4);
    expect(clampRatio(1, 0.75, 1.4)).toBe(1);
  });
});

describe('postMediaRatio — miroir FeedPostCardLayout.swift:26-38', () => {
  test('dimensions absentes ⇒ repli 0.75', () => {
    expect(postMediaRatio(undefined, undefined)).toBe(0.75);
  });

  test('un ratio dans la fenêtre passe INCHANGÉ', () => {
    expect(postMediaRatio(1000, 1000)).toBe(1);
  });

  test('un média très haut est BORNÉ à 1.4, jamais rendu brut', () => {
    expect(postMediaRatio(100, 1000)).toBe(1.4);
  });

  test('un média très large est BORNÉ à 0.75', () => {
    expect(postMediaRatio(1000, 100)).toBe(0.75);
  });
});

describe('reelCardRatio — miroir ReelFeedLayout.swift:31-44', () => {
  test('dimensions absentes ⇒ repli 1.25 (presque un portrait), PAS 0.75', () => {
    expect(reelCardRatio(undefined, undefined)).toBe(1.25);
  });

  test('un portrait franc (1080×1920) est borné à 1.25', () => {
    expect(reelCardRatio(1080, 1920)).toBe(1.25);
  });

  test('un carré passe inchangé', () => {
    expect(reelCardRatio(1000, 1000)).toBe(1);
  });
});

describe('feedMediaKindOf', () => {
  test('classe par le préfixe MIME, jamais une extension', () => {
    expect(feedMediaKindOf('image/jpeg')).toBe('image');
    expect(feedMediaKindOf('video/mp4')).toBe('video');
    expect(feedMediaKindOf('audio/mpeg')).toBe('audio');
    expect(feedMediaKindOf('application/pdf')).toBe('other');
    expect(feedMediaKindOf(undefined)).toBe('other');
  });
});

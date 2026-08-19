import { describe, it, expect } from 'vitest';
import {
  allowedRepostVisibilities,
  isRepostVisibilityAllowed,
  repostVisibilityInheritsAudienceList,
} from '../../utils/repost-audience.js';
import type { PostVisibility } from '../../types/post.js';

const ALL: readonly PostVisibility[] = ['PUBLIC', 'COMMUNITY', 'FRIENDS', 'EXCEPT', 'ONLY', 'PRIVATE'];

describe('allowedRepostVisibilities', () => {
  it('lets a PUBLIC original be republished to any audience — all are subsets of « everyone »', () => {
    expect(new Set(allowedRepostVisibilities('PUBLIC'))).toEqual(new Set(ALL));
  });

  it('restricts a FRIENDS original to FRIENDS or PRIVATE', () => {
    expect(new Set(allowedRepostVisibilities('FRIENDS'))).toEqual(new Set<PostVisibility>(['FRIENDS', 'PRIVATE']));
  });

  it('restricts a COMMUNITY original to COMMUNITY or PRIVATE', () => {
    expect(new Set(allowedRepostVisibilities('COMMUNITY'))).toEqual(new Set<PostVisibility>(['COMMUNITY', 'PRIVATE']));
  });

  it('collapses a PRIVATE original to PRIVATE alone', () => {
    expect(allowedRepostVisibilities('PRIVATE')).toEqual(['PRIVATE']);
  });

  it('always offers the original itself — republishing unchanged is the nominal case', () => {
    for (const original of ALL) {
      expect(allowedRepostVisibilities(original)).toContain(original);
    }
  });

  it('always offers PRIVATE — the strictly narrowest audience, sound from any original', () => {
    for (const original of ALL) {
      expect(allowedRepostVisibilities(original)).toContain<PostVisibility>('PRIVATE');
    }
  });
});

describe('isRepostVisibilityAllowed', () => {
  it('refuses every widening', () => {
    // Paires (original, demandé) où le demandé est STRICTEMENT plus large.
    const widenings: ReadonlyArray<readonly [PostVisibility, PostVisibility]> = [
      ['PRIVATE', 'PUBLIC'], ['PRIVATE', 'FRIENDS'], ['PRIVATE', 'COMMUNITY'],
      ['PRIVATE', 'EXCEPT'], ['PRIVATE', 'ONLY'],
      ['FRIENDS', 'PUBLIC'], ['FRIENDS', 'EXCEPT'], ['FRIENDS', 'COMMUNITY'],
      ['COMMUNITY', 'PUBLIC'], ['COMMUNITY', 'FRIENDS'],
      ['ONLY', 'PUBLIC'], ['ONLY', 'FRIENDS'],
      ['EXCEPT', 'PUBLIC'],
    ];
    for (const [original, requested] of widenings) {
      expect(isRepostVisibilityAllowed(original, requested)).toBe(false);
    }
  });

  it('accepts the identity for every audience', () => {
    for (const v of ALL) {
      expect(isRepostVisibilityAllowed(v, v)).toBe(true);
    }
  });

  it('accepts PRIVATE from every audience', () => {
    for (const v of ALL) {
      expect(isRepostVisibilityAllowed(v, 'PRIVATE')).toBe(true);
    }
  });

  it('agrees with allowedRepostVisibilities on all 36 pairs — un seul comportement, deux lectures', () => {
    for (const original of ALL) {
      for (const requested of ALL) {
        expect(isRepostVisibilityAllowed(original, requested))
          .toBe(allowedRepostVisibilities(original).includes(requested));
      }
    }
  });
});

describe('repostVisibilityInheritsAudienceList', () => {
  /// EXCEPT/ONLY ne se lisent pas seules : leur portée EST la liste
  /// d'utilisateurs qui les accompagne. Laisser le republieur fournir SA liste
  /// rouvrirait l'élargissement par la porte de service — « même audience »
  /// avec une liste `ONLY` plus longue est plus LARGE. La liste doit donc être
  /// héritée de l'original, jamais reprise du client.
  it('demands the original audience list for the set-based audiences', () => {
    expect(repostVisibilityInheritsAudienceList('EXCEPT')).toBe(true);
    expect(repostVisibilityInheritsAudienceList('ONLY')).toBe(true);
  });

  it('needs no list for the audiences that are self-describing', () => {
    for (const v of ['PUBLIC', 'COMMUNITY', 'FRIENDS', 'PRIVATE'] as const) {
      expect(repostVisibilityInheritsAudienceList(v)).toBe(false);
    }
  });
});

import { describe, it, expect } from '@jest/globals';
import {
  reelAffinityBreakdown,
  reelAffinityScore,
  REEL_AFFINITY_WEIGHTS as W,
  type ReelCandidate,
  type ReelAffinityContext,
  type ReelSeed,
} from '../reelAffinity';

const NOW_MS = new Date('2026-01-01T12:00:00Z').getTime();
const HALF_LIFE_MS = 48 * 3_600_000;

const makeCandidate = (overrides: Partial<ReelCandidate> = {}): ReelCandidate => ({
  id: 'reel-001',
  authorId: 'author-A',
  originalLanguage: 'fr',
  createdAt: new Date(NOW_MS - 1000), // 1 second old
  likeCount: 0,
  commentCount: 0,
  repostCount: 0,
  bookmarkCount: 0,
  viewCount: 0,
  mentionedUserIds: [],
  ...overrides,
});

const makeSeed = (overrides: Partial<ReelSeed> = {}): ReelSeed => ({
  id: 'seed-001',
  authorId: 'author-A',
  originalLanguage: 'fr',
  mentionedUserIds: new Set<string>(),
  ...overrides,
});

const makeCtx = (overrides: Partial<ReelAffinityContext> = {}): ReelAffinityContext => ({
  nowMs: NOW_MS,
  viewerId: 'viewer-1',
  contactIds: new Set<string>(),
  viewerLanguages: new Set<string>(['fr']),
  seenReelIds: new Set<string>(),
  seed: null,
  ...overrides,
});

describe('REEL_AFFINITY_WEIGHTS', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(W)).toBe(true);
  });

  it('has all expected signal keys', () => {
    const keys = [
      'seedSameAuthor', 'seedSameLanguage', 'seedSharedMention',
      'contactAuthor', 'viewerLanguage', 'engagement', 'freshness', 'seenPenalty',
    ];
    expect(Object.keys(W).sort()).toEqual(keys.sort());
  });

  it('seenPenalty is negative', () => {
    expect(W.seenPenalty).toBeLessThan(0);
  });

  it('all positive weights are > 0', () => {
    const positiveKeys = ['seedSameAuthor', 'seedSameLanguage', 'seedSharedMention', 'contactAuthor', 'viewerLanguage', 'engagement', 'freshness'] as const;
    for (const k of positiveKeys) {
      expect(W[k]).toBeGreaterThan(0);
    }
  });
});

describe('reelAffinityBreakdown — seed signals', () => {
  it('seedSameAuthor = 0 when seed is null', () => {
    const bd = reelAffinityBreakdown(makeCandidate({ authorId: 'X' }), makeCtx({ seed: null }));
    expect(bd.seedSameAuthor).toBe(0);
  });

  it('seedSameAuthor = W.seedSameAuthor when author matches seed', () => {
    const seed = makeSeed({ authorId: 'author-A' });
    const bd = reelAffinityBreakdown(makeCandidate({ authorId: 'author-A' }), makeCtx({ seed }));
    expect(bd.seedSameAuthor).toBe(W.seedSameAuthor);
  });

  it('seedSameAuthor = 0 when author differs from seed', () => {
    const seed = makeSeed({ authorId: 'author-B' });
    const bd = reelAffinityBreakdown(makeCandidate({ authorId: 'author-A' }), makeCtx({ seed }));
    expect(bd.seedSameAuthor).toBe(0);
  });

  it('seedSameLanguage = W.seedSameLanguage when languages match', () => {
    const seed = makeSeed({ originalLanguage: 'fr' });
    const bd = reelAffinityBreakdown(makeCandidate({ originalLanguage: 'fr' }), makeCtx({ seed }));
    expect(bd.seedSameLanguage).toBe(W.seedSameLanguage);
  });

  it('seedSameLanguage = 0 when candidate language is null', () => {
    const seed = makeSeed({ originalLanguage: 'fr' });
    const bd = reelAffinityBreakdown(makeCandidate({ originalLanguage: null }), makeCtx({ seed }));
    expect(bd.seedSameLanguage).toBe(0);
  });

  it('seedSameLanguage = 0 when seed language is null', () => {
    const seed = makeSeed({ originalLanguage: null });
    const bd = reelAffinityBreakdown(makeCandidate({ originalLanguage: 'fr' }), makeCtx({ seed }));
    expect(bd.seedSameLanguage).toBe(0);
  });

  it('seedSameLanguage = 0 when languages differ', () => {
    const seed = makeSeed({ originalLanguage: 'en' });
    const bd = reelAffinityBreakdown(makeCandidate({ originalLanguage: 'fr' }), makeCtx({ seed }));
    expect(bd.seedSameLanguage).toBe(0);
  });

  it('seedSharedMention = W.seedSharedMention when mention overlap', () => {
    const seed = makeSeed({ mentionedUserIds: new Set(['user-X', 'user-Y']) });
    const bd = reelAffinityBreakdown(
      makeCandidate({ mentionedUserIds: ['user-Y', 'user-Z'] }),
      makeCtx({ seed }),
    );
    expect(bd.seedSharedMention).toBe(W.seedSharedMention);
  });

  it('seedSharedMention = 0 when no mention overlap', () => {
    const seed = makeSeed({ mentionedUserIds: new Set(['user-X']) });
    const bd = reelAffinityBreakdown(
      makeCandidate({ mentionedUserIds: ['user-Z'] }),
      makeCtx({ seed }),
    );
    expect(bd.seedSharedMention).toBe(0);
  });

  it('seedSharedMention = 0 when seed is null', () => {
    const bd = reelAffinityBreakdown(
      makeCandidate({ mentionedUserIds: ['user-Z'] }),
      makeCtx({ seed: null }),
    );
    expect(bd.seedSharedMention).toBe(0);
  });
});

describe('reelAffinityBreakdown — viewer affinity signals', () => {
  it('contactAuthor = W.contactAuthor when author is in contacts', () => {
    const ctx = makeCtx({ contactIds: new Set(['author-A']) });
    const bd = reelAffinityBreakdown(makeCandidate({ authorId: 'author-A' }), ctx);
    expect(bd.contactAuthor).toBe(W.contactAuthor);
  });

  it('contactAuthor = 0 when author is not in contacts', () => {
    const ctx = makeCtx({ contactIds: new Set(['author-B']) });
    const bd = reelAffinityBreakdown(makeCandidate({ authorId: 'author-A' }), ctx);
    expect(bd.contactAuthor).toBe(0);
  });

  it('viewerLanguage = W.viewerLanguage when candidate language matches viewer languages', () => {
    const ctx = makeCtx({ viewerLanguages: new Set(['fr', 'en']) });
    const bd = reelAffinityBreakdown(makeCandidate({ originalLanguage: 'fr' }), ctx);
    expect(bd.viewerLanguage).toBe(W.viewerLanguage);
  });

  it('viewerLanguage = 0 when candidate language is null', () => {
    const ctx = makeCtx({ viewerLanguages: new Set(['fr']) });
    const bd = reelAffinityBreakdown(makeCandidate({ originalLanguage: null }), ctx);
    expect(bd.viewerLanguage).toBe(0);
  });

  it('viewerLanguage = 0 when candidate language not in viewer set', () => {
    const ctx = makeCtx({ viewerLanguages: new Set(['en']) });
    const bd = reelAffinityBreakdown(makeCandidate({ originalLanguage: 'fr' }), ctx);
    expect(bd.viewerLanguage).toBe(0);
  });
});

describe('reelAffinityBreakdown — engagement', () => {
  it('engagement = 0 for zero-engagement reel', () => {
    const bd = reelAffinityBreakdown(
      makeCandidate({ likeCount: 0, commentCount: 0, repostCount: 0, bookmarkCount: 0, viewCount: 0 }),
      makeCtx(),
    );
    // log10(1 + 0) / 5 = 0
    expect(bd.engagement).toBe(0);
  });

  it('engagement is positive for non-zero engagement', () => {
    const bd = reelAffinityBreakdown(
      makeCandidate({ likeCount: 100, commentCount: 50, repostCount: 10, bookmarkCount: 20, viewCount: 1000 }),
      makeCtx(),
    );
    expect(bd.engagement).toBeGreaterThan(0);
    expect(bd.engagement).toBeLessThanOrEqual(W.engagement);
  });

  it('engagement is capped at W.engagement for very high engagement', () => {
    // Raw score > 10^5 → log10 / 5 > 1 → min(1, ...) = 1 → engagement = W.engagement
    const bd = reelAffinityBreakdown(
      makeCandidate({ likeCount: 10_000_000, commentCount: 5_000_000, repostCount: 0, bookmarkCount: 0, viewCount: 0 }),
      makeCtx(),
    );
    expect(bd.engagement).toBeCloseTo(W.engagement, 5);
  });
});

describe('reelAffinityBreakdown — freshness', () => {
  it('freshness is high for a very fresh reel (1 second old)', () => {
    const bd = reelAffinityBreakdown(
      makeCandidate({ createdAt: new Date(NOW_MS - 1000) }),
      makeCtx({ nowMs: NOW_MS }),
    );
    // ageMs = 1000, HALF_LIFE = 48h ≈ 172800000ms → 1 / (1 + 1000/172800000) ≈ 1
    expect(bd.freshness).toBeGreaterThan(W.freshness * 0.99);
  });

  it('freshness is exactly W.freshness/2 at half-life age (48h)', () => {
    const bd = reelAffinityBreakdown(
      makeCandidate({ createdAt: new Date(NOW_MS - HALF_LIFE_MS) }),
      makeCtx({ nowMs: NOW_MS }),
    );
    // 1 / (1 + 1) = 0.5 → score = 0.5 * W.freshness
    expect(bd.freshness).toBeCloseTo(W.freshness * 0.5, 5);
  });

  it('freshness is non-negative for reel from the future (createdAt > nowMs)', () => {
    const bd = reelAffinityBreakdown(
      makeCandidate({ createdAt: new Date(NOW_MS + 1_000_000) }),
      makeCtx({ nowMs: NOW_MS }),
    );
    // ageMs = max(0, nowMs - futureMs) = 0 → freshness = 1 * W.freshness
    expect(bd.freshness).toBeGreaterThanOrEqual(0);
  });
});

describe('reelAffinityBreakdown — seen penalty', () => {
  it('seenPenalty = W.seenPenalty when reel is in seenReelIds', () => {
    const ctx = makeCtx({ seenReelIds: new Set(['reel-001']) });
    const bd = reelAffinityBreakdown(makeCandidate({ id: 'reel-001' }), ctx);
    expect(bd.seenPenalty).toBe(W.seenPenalty);
  });

  it('seenPenalty = 0 when reel is not in seenReelIds', () => {
    const ctx = makeCtx({ seenReelIds: new Set(['reel-999']) });
    const bd = reelAffinityBreakdown(makeCandidate({ id: 'reel-001' }), ctx);
    expect(bd.seenPenalty).toBe(0);
  });
});

describe('reelAffinityBreakdown — total', () => {
  it('total = sum of all signals', () => {
    const seed = makeSeed({ authorId: 'author-A', originalLanguage: 'fr', mentionedUserIds: new Set(['user-M']) });
    const ctx = makeCtx({
      seed,
      contactIds: new Set(['author-A']),
      viewerLanguages: new Set(['fr']),
      seenReelIds: new Set(['reel-001']),
      nowMs: NOW_MS,
    });
    const candidate = makeCandidate({
      id: 'reel-001',
      authorId: 'author-A',
      originalLanguage: 'fr',
      mentionedUserIds: ['user-M'],
      createdAt: new Date(NOW_MS - 1000),
    });
    const bd = reelAffinityBreakdown(candidate, ctx);
    const expectedTotal =
      bd.seedSameAuthor +
      bd.seedSameLanguage +
      bd.seedSharedMention +
      bd.contactAuthor +
      bd.viewerLanguage +
      bd.engagement +
      bd.freshness +
      bd.seenPenalty;
    expect(bd.total).toBeCloseTo(expectedTotal, 10);
  });
});

describe('reelAffinityScore', () => {
  it('returns the same value as breakdown.total', () => {
    const candidate = makeCandidate();
    const ctx = makeCtx();
    const score = reelAffinityScore(candidate, ctx);
    const { total } = reelAffinityBreakdown(candidate, ctx);
    expect(score).toBe(total);
  });

  it('returns a positive number for a fresh, unvisited reel with viewer-language match', () => {
    const ctx = makeCtx({ viewerLanguages: new Set(['fr']) });
    const score = reelAffinityScore(makeCandidate({ originalLanguage: 'fr' }), ctx);
    expect(score).toBeGreaterThan(0);
  });

  it('returns a lower score for a seen reel', () => {
    const candidate = makeCandidate({ id: 'reel-001' });
    const notSeen = reelAffinityScore(candidate, makeCtx({ seenReelIds: new Set() }));
    const seen = reelAffinityScore(candidate, makeCtx({ seenReelIds: new Set(['reel-001']) }));
    expect(seen).toBeLessThan(notSeen);
  });
});

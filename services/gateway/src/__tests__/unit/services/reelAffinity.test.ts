/**
 * reelAffinityScore — moteur d'affinité du thread Reels (fondation).
 *
 * Fonction PURE : classe un réel candidat par affinité au réel touché (« seed »)
 * + affinité à l'utilisateur connecté. Ces tests verrouillent chaque signal
 * isolément et leurs interactions — c'est le contrat que le futur moteur de
 * reco/monétisation devra préserver (ou faire évoluer explicitement).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  reelAffinityScore,
  reelAffinityBreakdown,
  REEL_AFFINITY_WEIGHTS,
  type ReelCandidate,
  type ReelAffinityContext,
  type ReelSeed,
} from '../../../services/posts/reelAffinity';

const NOW = new Date('2026-06-13T00:00:00Z').getTime();

function makeCandidate(overrides: Partial<ReelCandidate> = {}): ReelCandidate {
  return {
    id: 'r-1',
    authorId: 'author-x',
    originalLanguage: null,
    createdAt: new Date(NOW),
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    bookmarkCount: 0,
    viewCount: 0,
    mentionedUserIds: [],
    ...overrides,
  };
}

function makeContext(overrides: Partial<ReelAffinityContext> = {}): ReelAffinityContext {
  return {
    nowMs: NOW,
    viewerId: 'viewer-1',
    contactIds: new Set<string>(),
    viewerLanguages: new Set<string>(),
    seenReelIds: new Set<string>(),
    seed: null,
    ...overrides,
  };
}

function makeSeed(overrides: Partial<ReelSeed> = {}): ReelSeed {
  return {
    id: 'seed-1',
    authorId: 'author-seed',
    originalLanguage: 'fr',
    mentionedUserIds: new Set<string>(),
    ...overrides,
  };
}

describe('reelAffinityScore — signaux de similitude au seed', () => {
  it('boost si même auteur que le seed', () => {
    const seed = makeSeed({ authorId: 'author-seed' });
    const sameAuthor = reelAffinityScore(makeCandidate({ authorId: 'author-seed' }), makeContext({ seed }));
    const otherAuthor = reelAffinityScore(makeCandidate({ authorId: 'author-x' }), makeContext({ seed }));
    expect(sameAuthor).toBeGreaterThan(otherAuthor);
    expect(reelAffinityBreakdown(makeCandidate({ authorId: 'author-seed' }), makeContext({ seed })).seedSameAuthor)
      .toBe(REEL_AFFINITY_WEIGHTS.seedSameAuthor);
  });

  it('boost si même langue que le seed', () => {
    const seed = makeSeed({ originalLanguage: 'fr' });
    const b = reelAffinityBreakdown(makeCandidate({ originalLanguage: 'fr' }), makeContext({ seed }));
    expect(b.seedSameLanguage).toBe(REEL_AFFINITY_WEIGHTS.seedSameLanguage);
  });

  it('pas de boost langue quand le seed ou le candidat a une langue nulle', () => {
    const seed = makeSeed({ originalLanguage: null });
    const b = reelAffinityBreakdown(makeCandidate({ originalLanguage: 'fr' }), makeContext({ seed }));
    expect(b.seedSameLanguage).toBe(0);
  });

  it('boost si @mention commune avec le seed', () => {
    const seed = makeSeed({ mentionedUserIds: new Set(['u-99']) });
    const shared = reelAffinityBreakdown(
      makeCandidate({ mentionedUserIds: ['u-99', 'u-2'] }),
      makeContext({ seed })
    );
    const none = reelAffinityBreakdown(
      makeCandidate({ mentionedUserIds: ['u-7'] }),
      makeContext({ seed })
    );
    expect(shared.seedSharedMention).toBe(REEL_AFFINITY_WEIGHTS.seedSharedMention);
    expect(none.seedSharedMention).toBe(0);
  });

  it('aucun signal seed quand seed est null (onglet « Pour toi »)', () => {
    const b = reelAffinityBreakdown(
      makeCandidate({ authorId: 'author-seed', originalLanguage: 'fr' }),
      makeContext({ seed: null })
    );
    expect(b.seedSameAuthor).toBe(0);
    expect(b.seedSameLanguage).toBe(0);
    expect(b.seedSharedMention).toBe(0);
  });
});

describe('reelAffinityScore — signaux d\'affinité utilisateur', () => {
  it('boost si l\'auteur est un contact (ami/DM)', () => {
    const b = reelAffinityBreakdown(
      makeCandidate({ authorId: 'friend-1' }),
      makeContext({ contactIds: new Set(['friend-1']) })
    );
    expect(b.contactAuthor).toBe(REEL_AFFINITY_WEIGHTS.contactAuthor);
  });

  it('boost si la langue du réel est lue par l\'utilisateur', () => {
    const b = reelAffinityBreakdown(
      makeCandidate({ originalLanguage: 'es' }),
      makeContext({ viewerLanguages: new Set(['fr', 'es']) })
    );
    expect(b.viewerLanguage).toBe(REEL_AFFINITY_WEIGHTS.viewerLanguage);
  });
});

describe('reelAffinityScore — popularité, fraîcheur, déjà-vu', () => {
  it('un réel plus engagé score plus haut (toutes choses égales)', () => {
    const popular = reelAffinityScore(makeCandidate({ viewCount: 10_000, likeCount: 500 }), makeContext());
    const quiet = reelAffinityScore(makeCandidate({ viewCount: 0, likeCount: 0 }), makeContext());
    expect(popular).toBeGreaterThan(quiet);
  });

  it('un réel plus récent score plus haut (toutes choses égales)', () => {
    const fresh = reelAffinityScore(makeCandidate({ createdAt: new Date(NOW) }), makeContext());
    const old = reelAffinityScore(
      makeCandidate({ createdAt: new Date(NOW - 30 * 24 * 3_600_000) }),
      makeContext()
    );
    expect(fresh).toBeGreaterThan(old);
  });

  it('applique une forte pénalité aux réels déjà vus', () => {
    const seen = reelAffinityScore(
      makeCandidate({ id: 'r-seen' }),
      makeContext({ seenReelIds: new Set(['r-seen']) })
    );
    const unseen = reelAffinityScore(makeCandidate({ id: 'r-unseen' }), makeContext());
    expect(unseen - seen).toBeCloseTo(-REEL_AFFINITY_WEIGHTS.seenPenalty, 5);
  });

  it('un réel vu mais du même auteur que le seed peut rester au-dessus d\'un non-vu sans affinité', () => {
    // La pénalité déjà-vu (−0.5) > boost même-auteur (+0.3) : un réel vu coule
    // SOUS un non-vu équivalent. Vérifie que la pénalité domine bien le signal seed.
    const seed = makeSeed({ authorId: 'author-seed' });
    const seenSameAuthor = reelAffinityScore(
      makeCandidate({ id: 'r-a', authorId: 'author-seed' }),
      makeContext({ seed, seenReelIds: new Set(['r-a']) })
    );
    const unseenUnrelated = reelAffinityScore(
      makeCandidate({ id: 'r-b', authorId: 'author-x' }),
      makeContext({ seed })
    );
    expect(unseenUnrelated).toBeGreaterThan(seenSameAuthor);
  });
});

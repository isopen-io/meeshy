/**
 * La note d'après-appel dans l'agrégat (#8072) — la lecture de
 * `CallParticipant.feedback`, écrite par `call:quality-feedback`. Pure et
 * totale, comme `callAnalyticsAggregate` : une ligne dérivée est sautée,
 * jamais une erreur.
 */
import { describe, it, expect } from '@jest/globals';
import { coerceCallFeedback, summarizeCallFeedback } from '../../../services/callAnalyticsAggregate';

describe('coerceCallFeedback', () => {
  it('lit une note valide et ses motifs connus', () => {
    expect(coerceCallFeedback({ rating: 2, issues: ['echo', 'dropped'], ratedAt: '2026-09-26T20:00:00Z' })).toEqual({
      rating: 2,
      issues: ['echo', 'dropped'],
    });
  });

  it('saute une ligne absente, une note hors de 1 à 5 et ignore les motifs inconnus', () => {
    expect(coerceCallFeedback(null)).toBeNull();
    expect(coerceCallFeedback({ rating: 0 })).toBeNull();
    expect(coerceCallFeedback({ rating: 3.5 })).toBeNull();
    expect(coerceCallFeedback({ rating: 4, issues: ['echo', 'nope', 7] })).toEqual({ rating: 4, issues: ['echo'] });
  });
});

describe('summarizeCallFeedback', () => {
  it('compte les notes, en fait la moyenne, la répartition et les motifs', () => {
    const summary = summarizeCallFeedback([
      { rating: 5, issues: [] },
      { rating: 2, issues: ['echo', 'dropped'] },
      { rating: 2, issues: ['echo'] },
    ]);
    expect(summary).toEqual({
      ratedCalls: 3,
      avgRating: 3,
      ratingDistribution: { 1: 0, 2: 2, 3: 0, 4: 0, 5: 1 },
      byIssue: { echo: 2, dropped: 1 },
    });
  });

  it('rend une moyenne nulle quand personne n’a noté', () => {
    expect(summarizeCallFeedback([])).toEqual({
      ratedCalls: 0,
      avgRating: null,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      byIssue: {},
    });
  });
});

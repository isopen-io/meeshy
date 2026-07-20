// Re-export barrel test: verifies all exports are present without testing internals.
// Each import exercises the barrel's re-export lines, reaching 100% line coverage.

import * as RankingIndex from '@/components/admin/ranking';

describe('ranking/index.ts barrel exports', () => {
  it('exports RankingFilters', () => {
    expect(RankingIndex.RankingFilters).toBeDefined();
  });

  it('exports RankingTable', () => {
    expect(RankingIndex.RankingTable).toBeDefined();
  });

  it('exports RankingStats', () => {
    expect(RankingIndex.RankingStats).toBeDefined();
  });

  it('exports RankingPodium', () => {
    expect(RankingIndex.RankingPodium).toBeDefined();
  });

  it('exports UserRankCard', () => {
    expect(RankingIndex.UserRankCard).toBeDefined();
  });

  it('exports ConversationRankCard', () => {
    expect(RankingIndex.ConversationRankCard).toBeDefined();
  });

  it('exports MessageRankCard', () => {
    expect(RankingIndex.MessageRankCard).toBeDefined();
  });

  it('exports LinkRankCard', () => {
    expect(RankingIndex.LinkRankCard).toBeDefined();
  });

  it('re-exports from constants (RANKING_CRITERIA)', () => {
    expect(RankingIndex.RANKING_CRITERIA).toBeDefined();
  });

  it('re-exports from utils (formatCount)', () => {
    expect(RankingIndex.formatCount).toBeDefined();
  });
});

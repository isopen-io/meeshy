import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_FIXTURE } from './engagement-fixture';
import type { EngagementWithGame } from './engagement';
import { gameBlockFixture } from './game-fixture';
import { applyGameUpdated } from './game-state-live';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, keepNewerGameState } from './game-state-order';

const seeded = (gameRevision: number): { client: QueryClient; view: EngagementWithGame } => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryDefaults(ENGAGEMENT_PROGRESS_QUERY_KEY, { structuralSharing: keepNewerGameState });
  const view: EngagementWithGame = { ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE), game: gameBlockFixture(), gameRevision };
  client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, view);
  return { client, view };
};

const read = (client: QueryClient) => client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY);

describe('game:updated (#10900) — l’état servi ailleurs se pose, jamais un plus ancien', () => {
  test('un état plus récent pose son bloc et sa révision', () => {
    const { client } = seeded(100);
    const game = gameBlockFixture({ score: 4_000 });
    applyGameUpdated(client, { gameRevision: 200, reason: 'mint', game });
    expect(read(client)?.gameRevision).toBe(200);
    expect(read(client)?.game?.level.score).toBe(4_000);
  });

  test('un état plus ancien est ignoré', () => {
    const { client, view } = seeded(300);
    applyGameUpdated(client, { gameRevision: 200, reason: 'credit', game: gameBlockFixture({ score: 4_000 }) });
    expect(read(client)).toEqual(view);
  });

  test('un événement sans révision lisible est ignoré', () => {
    const { client, view } = seeded(300);
    applyGameUpdated(client, { reason: 'mint', game: gameBlockFixture({ score: 4_000 }) });
    expect(read(client)).toEqual(view);
  });
});

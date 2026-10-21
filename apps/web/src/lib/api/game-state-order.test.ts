import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, keepNewerGameState, servedGameRevision } from './game-state-order';

const state = (price: number, gameRevision?: number) => ({ price, ...(gameRevision === undefined ? {} : { gameRevision }) });

describe('l’état du jeu ne recule jamais (#10898, #10900)', () => {
  test('une écriture plus ancienne que celle en cache est ignorée', () => {
    const current = state(629, 200);
    expect(keepNewerGameState(current, state(635, 150))).toBe(current);
  });

  test('une écriture égale ou plus récente s’applique', () => {
    expect(keepNewerGameState(state(635, 150), state(629, 200))).toEqual(state(629, 200));
    expect(keepNewerGameState(state(635, 200), state(629, 200))).toEqual(state(629, 200));
  });

  test('sans révision (passerelle antérieure), l’écriture s’applique comme hier', () => {
    expect(keepNewerGameState(state(635, 200), state(629))).toEqual(state(629));
    expect(keepNewerGameState(state(635), state(629, 100))).toEqual(state(629, 100));
  });

  test('posée sur la clé de la progression, une lecture en retard ne repeint pas le prix', () => {
    const client = new QueryClient();
    client.setQueryDefaults(ENGAGEMENT_PROGRESS_QUERY_KEY, { structuralSharing: keepNewerGameState });
    client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, state(629, 200));
    client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, state(635, 150));
    expect(client.getQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY)).toEqual(state(629, 200));
  });

  test('la révision servie se lit sans croire la charge', () => {
    expect(servedGameRevision({ gameRevision: 12 })).toBe(12);
    expect(servedGameRevision({ gameRevision: '12' })).toBeUndefined();
    expect(servedGameRevision(null)).toBeUndefined();
  });
});

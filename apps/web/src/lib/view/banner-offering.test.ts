import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import type { ChestClaimResponse } from '@meeshy/shared/types/game';
import { GAME_ERROR_CODES } from '@meeshy/shared/types/game-routes';

import type { ApiResult } from '@/lib/api/http';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { gameBlockFixture } from '@/lib/api/game-fixture';
import { ENGAGEMENT_PROGRESS_QUERY_KEY } from '@/lib/api/game-state-order';

import { createOfferingOpener } from './banner-offering';

/**
 * L'OFFRANDE S'OUVRE SUR LE BANDEAU (#18199) — la même règle que tous les gestes du jeu : capturer, appliquer en
 * local, envoyer, restaurer si refus. L'identifiant d'idempotence ne se renouvelle qu'après un succès.
 */
const readyView = (): EngagementWithGame => {
  const game = gameBlockFixture();
  return { game: { ...game, missions: { ...game.missions, unlocked: true }, chest: { ...game.chest, status: 'ready', reward: null } } } as EngagementWithGame;
};

const claimed = (points: number): ChestClaimResponse => ({ status: 'claimed', reward: { points, fragment: false, freeze: false }, score: 1000 + points });

const harness = (answers: ReadonlyArray<ApiResult<ChestClaimResponse>>) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, readyView());
  const sent: string[] = [];
  let ids = 0;
  let turn = 0;
  const opener = createOfferingOpener({
    client,
    newId: () => `id-${(ids += 1)}`,
    claim: async (requestId) => {
      sent.push(requestId);
      const answer = answers[Math.min(turn, answers.length - 1)];
      turn += 1;
      if (answer === undefined) throw new Error('aucune réponse prévue');
      return answer;
    },
  });
  const status = () => client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY)?.game?.chest.status;
  return { client, opener, sent, status };
};

const refused = (code?: string): ApiResult<ChestClaimResponse> => ({ ok: false, status: 409, error: 'refus', ...(code === undefined ? {} : { code }) });

describe('ouvrir l’Offrande depuis le bandeau', () => {
  test('l’Offrande passe ouverte AVANT la réponse (mise à jour optimiste)', async () => {
    let release: (value: ApiResult<ChestClaimResponse>) => void = () => undefined;
    const client = new QueryClient();
    client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, readyView());
    const opener = createOfferingOpener({ client, newId: () => 'id', claim: () => new Promise((resolve) => (release = resolve)) });
    const pending = opener.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY)?.game?.chest.status).toBe('claimed');
    release({ ok: true, data: claimed(40) });
    expect(await pending).toEqual({ kind: 'opened', points: 40 });
  });

  test('ouverte : le gain se pose dans le cache et se rend à l’hôte', async () => {
    const { opener, client } = harness([{ ok: true, data: claimed(40) }]);
    expect(await opener.open()).toEqual({ kind: 'opened', points: 40 });
    expect(client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY)?.game?.chest.reward?.points).toBe(40);
  });

  test('refusée : l’état d’avant revient, et le même identifiant repart au second toucher', async () => {
    const { opener, status, sent } = harness([refused('NETWORK_DOWN'), { ok: true, data: claimed(12) }]);
    expect(await opener.open()).toEqual({ kind: 'refused' });
    expect(status()).toBe('ready');
    expect(await opener.open()).toEqual({ kind: 'opened', points: 12 });
    expect(sent).toEqual(['id-1', 'id-1']);
  });

  test('un identifiant déjà pris par une autre écriture ne resert pas', async () => {
    const { opener, sent } = harness([refused(GAME_ERROR_CODES.requestIdConflict), { ok: true, data: claimed(5) }]);
    await opener.open();
    await opener.open();
    expect(sent).toEqual(['id-1', 'id-2']);
  });

  test('après une ouverture, la suivante prend un identifiant neuf', async () => {
    const { opener, client, sent } = harness([{ ok: true, data: claimed(5) }]);
    await opener.open();
    client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, readyView());
    await opener.open();
    expect(sent).toEqual(['id-1', 'id-2']);
  });

  test('deux touchers rapides n’envoient qu’une demande', async () => {
    const { opener, sent } = harness([{ ok: true, data: claimed(5) }]);
    const [first, second] = await Promise.all([opener.open(), opener.open()]);
    expect(first).toEqual({ kind: 'opened', points: 5 });
    expect(second).toEqual({ kind: 'skipped' });
    expect(sent).toEqual(['id-1']);
  });

  test('une Offrande qui n’est plus prête dans le cache ne part pas', async () => {
    const { opener, client, sent } = harness([{ ok: true, data: claimed(5) }]);
    const view = readyView();
    if (view.game === undefined) throw new Error('bloc attendu');
    client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, { ...view, game: { ...view.game, chest: { ...view.game.chest, status: 'claimed' } } });
    expect(await opener.open()).toEqual({ kind: 'skipped' });
    expect(sent).toEqual([]);
  });
});

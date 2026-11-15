import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act, useState } from 'react';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { leagueFriendsFixture, leagueWeekFixture } from '@/lib/api/game-v2-queries-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { GameV2Actions } from './game-v2-actions';
import { LigueBody } from './progression-ligue';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/ligue' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const gesture = <V,>() => ({ run: (_: V) => undefined, pending: false, vars: undefined, error: undefined });
const actions: GameV2Actions = {
  consent: gesture(),
  pseudonym: gesture(),
  invite: gesture(),
  accept: gesture(),
  abandon: gesture(),
  claimStep: gesture(),
  buySeal: gesture(),
  saveOrder: gesture(),
  visibility: gesture(),
  prestige: gesture(),
};

const base = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const progress = (game = gameBlockWithExtrasFixture()): EngagementWithGame => ({ ...base, game });

function Harness({ view }: { readonly view: EngagementWithGame }) {
  const [tab, setTab] = useState<'mine' | 'friends'>('mine');
  return (
    <LigueBody
      progress={view}
      tab={tab}
      onTab={setTab}
      week={{ status: 'ready', week: leagueWeekFixture() }}
      friendsState={{ status: 'ready', data: leagueFriendsFixture() }}
      friends={[{ id: 'friend-1', displayName: 'Amina' }]}
      names={new Map([['friend-1', 'Amina']])}
      actions={actions}
      online
      now={new Date('2026-11-05T14:00:00')}
      onRetryWeek={() => undefined}
      onRetryFriends={() => undefined}
    />
  );
}

/**
 * LA PAGE « LIGUE » (#9384, #9385) — deux onglets (ma ligue, mes amis), et sous
 * eux la mission en duo. Devant un ancien serveur, elle dit que cette partie du
 * jeu n’est pas disponible.
 */
describe('la page Ligue', () => {
  test('ma ligue d’abord : le classement du groupe, le duo dessous', async () => {
    const host = await mount(<Harness view={progress()} />);
    expect(host.querySelector('[data-game-standings]')).not.toBeNull();
    expect(host.querySelector('#game-duo')).not.toBeNull();
    expect(host.querySelector('[data-game-friends-standings]')).toBeNull();
  });

  test('l’onglet Amis remplace le classement public par la ligue entre amis, le duo reste', async () => {
    const host = await mount(<Harness view={progress()} />);
    await click(host.querySelector('[data-game-league-tab="friends"]'));
    expect(host.querySelector('[data-game-friends-standings]')).not.toBeNull();
    expect(host.querySelector('[data-game-standings]')).toBeNull();
    expect(host.querySelector('#game-duo')).not.toBeNull();
    expect(host.querySelector('[data-game-league-tab="friends"]')?.getAttribute('aria-selected')).toBe('true');
  });

  test('un ancien serveur : le message, aucun onglet', async () => {
    const host = await mount(<Harness view={progress(gameBlockFixture())} />);
    expect(host.textContent).toContain('pas encore disponible');
    expect(host.querySelector('[role="tablist"]')).toBeNull();
  });
});

describe('le clavier sur les onglets', () => {
  test('les flèches passent d’un onglet à l’autre, et seul l’onglet choisi est dans l’ordre de tabulation', async () => {
    const host = await mount(<Harness view={progress()} />);
    const list = host.querySelector('[role="tablist"]');
    expect(host.querySelector('[data-game-league-tab="mine"]')?.getAttribute('tabindex')).toBe('0');
    expect(host.querySelector('[data-game-league-tab="friends"]')?.getAttribute('tabindex')).toBe('-1');
    await act(async () => {
      list?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    expect(host.querySelector('[data-game-league-tab="friends"]')?.getAttribute('aria-selected')).toBe('true');
    await act(async () => {
      list?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    });
    expect(host.querySelector('[data-game-league-tab="mine"]')?.getAttribute('aria-selected')).toBe('true');
  });
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { GAME_SETTINGS_QUERY_KEY } from '@/lib/api/game-v2-queries';
import { appQueryClient } from '@/lib/api/query-client';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { gamePrefs } from './preferences';
import { useGameSettings } from './use-game-settings';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => gamePrefs.set({ hidden: false, celebrations: true }));
afterEach(() => {
  unmountAll();
  appQueryClient.removeQueries({ queryKey: GAME_SETTINGS_QUERY_KEY });
});

function Probe({ enabled }: { readonly enabled: boolean }) {
  useGameSettings(enabled);
  return null;
}

const settings = (gameHidden: boolean) => ({ gameHidden, friendsLeagueOptOut: false, visibility: { showcase: 'friends', rank: 'friends', treasury: 'friends', atlas: 'me' } }) as const;

/**
 * LES RÉGLAGES DU JEU, LUS DU SERVEUR (#9481) — la dernière lecture (cache persisté) règle tout de suite
 * la copie de l'appareil : un jeu masqué sur un autre appareil l'est ici, un jeu réaffiché ailleurs aussi.
 */
describe('le serveur règle la copie de l’appareil', () => {
  test('masqué côté compte : le jeu se masque ici, sans attendre le réseau', async () => {
    appQueryClient.setQueryData(GAME_SETTINGS_QUERY_KEY, settings(true));
    await mount(<Probe enabled={false} />);
    expect(gamePrefs.get().hidden).toBe(true);
  });

  test('réaffiché côté compte : la copie masquée de l’appareil se lève', async () => {
    gamePrefs.set({ hidden: true });
    appQueryClient.setQueryData(GAME_SETTINGS_QUERY_KEY, settings(false));
    await mount(<Probe enabled={false} />);
    expect(gamePrefs.get().hidden).toBe(false);
  });

  test('rien de lu : la copie reste le dernier état connu (hors ligne, premier lancement)', async () => {
    gamePrefs.set({ hidden: true });
    await mount(<Probe enabled={false} />);
    expect(gamePrefs.get().hidden).toBe(true);
  });
});

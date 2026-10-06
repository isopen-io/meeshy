import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { GAME_SETTINGS_QUERY_KEY } from '@/lib/api/game-v2-queries';
import { appQueryClient } from '@/lib/api/query-client';
import { gamePrefs } from '@/lib/game/preferences';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ContactGameStripSlot, GameProfileOwnSlot, GameProfileVisitorSlot } from './game-profile-slots';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

/**
 * Les emplacements lisent `appQueryClient`, le cache PARTAGÉ par tout le
 * process `bun test` : sans le vider, « d’abord rien » et « sans session : rien »
 * dépendent de ce qu’un témoin précédent — de ce fichier ou d’un autre — y a
 * laissé sous `['me', 'engagement']`. Dans la suite complète, le profil se
 * dessinait dès le montage ; l’échec d’un `toBeNull()` sur un élément monté par
 * React met ~13 s à se formater (et ne lève pas sous bun 1.3.14), le témoin
 * dépassait son délai, et son corps abandonné poursuivait ses `act()` par-dessus
 * les fichiers suivants (3 523 rouges, #9481). Les verdicts sur ces éléments se
 * lisent donc en booléens : un échec y coûte une milliseconde et reste local.
 *
 * Le chunk du jeu peut déjà être chargé par un fichier précédent : au montage,
 * on voit alors le profil entier tout de suite. « D’abord rien » se lit donc
 * « rien OU le profil entier » — jamais un squelette, jamais une moitié.
 */
beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  appQueryClient.clear();
  gamePrefs.set({ hidden: false });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  appQueryClient.clear();
  gamePrefs.set({ hidden: false });
});
afterEach(unmountAll);

/** Le chunk du jeu, son catalogue et la lecture se résolvent l’un après l’autre : on laisse passer quelques tours. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await act(() => new Promise<void>((resolve) => setTimeout(resolve, 25)));
};

/**
 * LES EMPLACEMENTS DU JEU DANS LES PROFILS (#9481) — chargés à la demande, après
 * la première peinture de l’écran qui les héberge : jusqu’à ce qu’ils soient
 * prêts, RIEN (jamais un squelette pour une carte qui n’existe pas toujours).
 */
describe('mon profil', () => {
  test('le jeu arrive quand il est prêt, et jamais avant : d’abord rien', async () => {
    const host = await mount(<GameProfileOwnSlot enabled />);
    const drawn = host.querySelector('#game-profile') !== null;
    expect(drawn || host.innerHTML === '').toBe(true);
    await settle();
    expect(host.querySelector('#game-profile') !== null).toBe(true);
  });

  test('« Jeu masqué » : le jeu ne se dessine pas sur le profil', async () => {
    /* Le serveur fait foi (#9481) : le réglage du COMPTE, lu, règle la copie de l'appareil. */
    appQueryClient.setQueryData(GAME_SETTINGS_QUERY_KEY, { gameHidden: true, friendsLeagueOptOut: false, visibility: { showcase: 'friends', rank: 'friends', treasury: 'friends', atlas: 'me' } });
    const host = await mount(<GameProfileOwnSlot enabled />);
    await settle();
    expect(host.querySelector('#game-profile') === null).toBe(true);
  });

  test('sans session (lecture désactivée) : rien ne part, rien ne se dessine', async () => {
    const host = await mount(<GameProfileOwnSlot enabled={false} />);
    await settle();
    expect(host.querySelector('#game-profile') === null).toBe(true);
  });
});

describe('le profil d’un autre et la carte de contact', () => {
  test('son jeu et sa vitrine, si ses réglages l’autorisent', async () => {
    const host = await mount(<GameProfileVisitorSlot userId="friend-1" name="Amina" enabled />);
    await settle();
    expect(host.textContent).toContain('Le jeu de Amina');
    expect(host.querySelector('[data-game-standing]') !== null).toBe(true);
    expect(host.querySelector('[data-game-visitor-showcase]') !== null).toBe(true);
  });

  test('la bande de la carte de contact : le niveau et les coupes, en lecture seule', async () => {
    const host = await mount(<ContactGameStripSlot userId="friend-1" enabled />);
    await settle();
    expect(host.querySelector('[data-game-contact-standing]') !== null).toBe(true);
    expect(host.querySelector('[data-game-contact-strip]') !== null).toBe(true);
  });

  test('lecture désactivée (et rien en cache pour ce membre) : rien', async () => {
    const host = await mount(<GameProfileVisitorSlot userId="friend-9" name="Zoé" enabled={false} />);
    await settle();
    expect(host.textContent).toBe('');
  });
});

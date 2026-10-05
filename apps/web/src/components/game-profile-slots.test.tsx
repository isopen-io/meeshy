import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { gamePrefs } from '@/lib/game/preferences';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ContactGameStripSlot, GameProfileOwnSlot, GameProfileVisitorSlot } from './game-profile-slots';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => gamePrefs.set({ hidden: false }));
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
    expect(host.querySelector('#game-profile')).toBeNull();
    await settle();
    expect(host.querySelector('#game-profile')).not.toBeNull();
  });

  test('« Jeu masqué » : le jeu ne se dessine pas sur le profil', async () => {
    gamePrefs.set({ hidden: true });
    const host = await mount(<GameProfileOwnSlot enabled />);
    await settle();
    expect(host.querySelector('#game-profile')).toBeNull();
  });

  test('sans session (lecture désactivée) : rien ne part, rien ne se dessine', async () => {
    const host = await mount(<GameProfileOwnSlot enabled={false} />);
    await settle();
    expect(host.querySelector('#game-profile')).toBeNull();
  });
});

describe('le profil d’un autre et la carte de contact', () => {
  test('sa vitrine, si son réglage l’autorise', async () => {
    const host = await mount(<GameProfileVisitorSlot userId="friend-1" name="Amina" enabled />);
    await settle();
    expect(host.textContent).toContain('Vitrine de Amina');
  });

  test('la bande de la carte de contact : les coupes, en lecture seule', async () => {
    const host = await mount(<ContactGameStripSlot userId="friend-1" enabled />);
    await settle();
    expect(host.querySelector('[data-game-contact-strip]')).not.toBeNull();
  });

  test('lecture désactivée (et rien en cache pour ce membre) : rien', async () => {
    const host = await mount(<GameProfileVisitorSlot userId="friend-9" name="Zoé" enabled={false} />);
    await settle();
    expect(host.textContent).toBe('');
  });
});

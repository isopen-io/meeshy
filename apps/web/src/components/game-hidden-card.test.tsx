import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameHiddenCard } from './game-hidden-card';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

/**
 * LE JEU MASQUÉ (#9481) — réafficher écrit le compte : le serveur fait foi, donc le geste demande le réseau
 * et dit pourquoi quand il manque ; un refus se dit sous le bouton.
 */
describe('la carte « jeu masqué »', () => {
  test('réafficher appelle le geste du compte', async () => {
    const calls: number[] = [];
    const host = await mount(<GameHiddenCard online show={async () => (calls.push(1), { status: 'saved' })} />);
    await click(host.querySelector('[data-game-show]'));
    expect(calls).toEqual([1]);
  });

  test('hors ligne : le bouton est suspendu et la carte le dit', async () => {
    const host = await mount(<GameHiddenCard online={false} show={async () => ({ status: 'saved' })} />);
    expect(host.querySelector<HTMLButtonElement>('[data-game-show]')?.disabled).toBe(true);
    expect(host.textContent).toContain('connexion');
  });

  test('un refus du serveur se lit sous le bouton', async () => {
    const host = await mount(<GameHiddenCard online show={async () => ({ status: 'refused', error: 'Le serveur a refusé.' })} />);
    await click(host.querySelector('[data-game-show]'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Le serveur a refusé.');
  });
});

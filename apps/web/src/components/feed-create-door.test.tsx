import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FeedCreateDoor } from './feed-create-door';

/**
 * LA PORTE DE CRÉATION DU FLUX (#7449) — loi 4 : « un contrôle existe s'il a
 * un EFFET ». Le témoin ne regarde donc pas le dessin du bouton mais ce que
 * ses deux lignes OUVRENT : `/posts/new` et `/posts/new?type=reel`. Une porte
 * qui mènerait deux fois à la même adresse aurait la même allure, et le même
 * libellé, sans aucun format de réel derrière.
 */
describe('FeedCreateDoor — deux formats, deux adresses', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const monte = () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<FeedCreateDoor language="fr" />);
    });
    return container.querySelector<HTMLButtonElement>('[data-feed-create]');
  };

  /* Le menu se rend en PORTAIL (`document.body`) : il ne vit pas sous
     `container`, et le chercher là aurait rendu un témoin vert à tort. */
  const lignes = () => [...document.querySelectorAll<HTMLAnchorElement>('[data-feed-create-choice]')];

  test('au repos, aucun menu — et le bouton s’annonce comme en ouvrant un', () => {
    const bouton = monte();
    expect(bouton).not.toBeNull();
    expect(bouton?.getAttribute('aria-haspopup')).toBe('menu');
    expect(bouton?.getAttribute('aria-expanded')).toBe('false');
    expect(bouton?.getAttribute('aria-label')).toBe('Créer une publication ou un réel');
    expect(lignes().length).toBe(0);
  });

  test('un appui ouvre DEUX lignes : Publication vers /posts/new, Réel vers /posts/new?type=reel', () => {
    const bouton = monte();
    act(() => bouton?.click());

    expect(bouton?.getAttribute('aria-expanded')).toBe('true');
    const items = lignes();
    expect(items.length).toBe(2);
    expect(items.map((a) => a.getAttribute('data-feed-create-choice'))).toEqual(['post', 'reel']);
    expect(items.map((a) => a.textContent)).toEqual(['Publication', 'Réel']);
    /* Des LIENS, jamais des boutons : c'est ce qui garde l'ouverture en nouvel
       onglet et le menu contextuel du navigateur. */
    expect(items.map((a) => a.tagName)).toEqual(['A', 'A']);
    expect(items.map((a) => a.getAttribute('href'))).toEqual(['/posts/new', '/posts/new?type=reel']);
    expect(items.every((a) => a.getAttribute('role') === 'menuitem')).toBe(true);
  });

  test('un second appui referme — et le menu quitte le document', () => {
    const bouton = monte();
    act(() => bouton?.click());
    expect(lignes().length).toBe(2);
    act(() => bouton?.click());
    expect(lignes().length).toBe(0);
    expect(bouton?.getAttribute('aria-expanded')).toBe('false');
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { ENGAGEMENT_PROGRESS_QUERY_KEY } from '@/lib/api/game-state-order';
import { appQueryClient } from '@/lib/api/query-client';
import { gamePrefs } from '@/lib/game/preferences';

import { FloatingMenus } from './floating-menus';

/**
 * L'ANNEAU DES ACTES DU JOUR (#17768) — autour du bouton du menu, un segment
 * s'allume par acte du rêve réalisé aujourd'hui. Il se lit dans le CACHE du
 * bloc `game` (la même entrée que le bandeau et « Ma Légende ») : aucune
 * requête ne part pour lui, et « Jeu masqué » l'efface.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  appQueryClient.removeQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
  gamePrefs.set({ hidden: false });
});

function monter(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<FloatingMenus routeKey="list" />);
  });
}

function servir(options: { readonly unlocked?: boolean; readonly done: ReadonlyArray<boolean> }): void {
  act(() => {
    appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, {
      game: {
        missions: {
          unlocked: options.unlocked ?? true,
          items: options.done.map((done) => ({ completedAt: done ? '2026-11-13T09:00:00.000Z' : null })),
        },
      },
    });
  });
}

const anneau = () => container.querySelector('[data-acts-ring]');
const segmentsAllumes = () => container.querySelectorAll('[data-act-segment="done"]').length;
const boutonMenu = () => container.querySelector('[data-floating-menu]') as HTMLButtonElement;
const description = () => {
  const id = boutonMenu().getAttribute('aria-describedby');
  return id === null ? null : (document.getElementById(id)?.textContent ?? null);
};

describe('l’anneau des actes autour du bouton du menu', () => {
  test('deux actes sur trois : deux segments allumés, et le lecteur d’écran le dit', () => {
    servir({ done: [true, false, true] });
    monter();

    expect(anneau()?.getAttribute('data-acts-ring')).toBe('2/3');
    expect(segmentsAllumes()).toBe(2);
    expect(description()).toBe('Actes du jour : 2 sur 3');
  });

  test('le nom du bouton ne change pas : l’anneau se DÉCRIT, il ne renomme rien', () => {
    servir({ done: [true, false, false] });
    monter();

    expect(boutonMenu().getAttribute('aria-label')).not.toContain('Actes');
  });

  test('un acte réalisé arrive dans le cache : l’anneau suit sans requête', () => {
    servir({ done: [false, false, false] });
    monter();
    expect(segmentsAllumes()).toBe(0);
    expect(anneau()).not.toBeNull();

    servir({ done: [true, true, true] });
    expect(segmentsAllumes()).toBe(3);
    expect(description()).toBe('Actes du jour : 3 sur 3');
  });

  test('cache vide : aucun anneau, aucune description', () => {
    monter();

    expect(anneau()).toBeNull();
    expect(boutonMenu().getAttribute('aria-describedby')).toBeNull();
  });

  test('avant le niveau 5 : aucun anneau', () => {
    servir({ unlocked: false, done: [true, false, false] });
    monter();

    expect(anneau()).toBeNull();
  });

  test('« Jeu masqué » : aucun anneau', () => {
    gamePrefs.set({ hidden: true });
    servir({ done: [true, true, false] });
    monter();

    expect(anneau()).toBeNull();
    expect(boutonMenu().getAttribute('aria-describedby')).toBeNull();
  });
});

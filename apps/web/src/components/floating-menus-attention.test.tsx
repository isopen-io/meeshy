import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { ENGAGEMENT_PROGRESS_QUERY_KEY } from '@/lib/api/game-state-order';
import { appQueryClient } from '@/lib/api/query-client';
import { gamePrefs } from '@/lib/game/preferences';

import { FloatingMenus } from './floating-menus';

/**
 * LE POINT DU BARREAU « MA LÉGENDE » (#18165) — quand l'Offrande du jour est
 * prête ou la Flamme en danger, le barreau du jeu porte un point, et son nom le
 * dit. Le signal est LU dans le cache du bloc `game` (`gameAttention`, #17796) :
 * aucune requête, aucune règle recalculée, et « Jeu masqué » n'a plus de barreau.
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

type Chest = 'locked' | 'ready' | 'claimed';
type Flame = 'none' | 'lit' | 'at-risk' | 'covered' | 'lost';

function servir(options: { readonly chest?: Chest; readonly flame?: Flame; readonly unlocked?: boolean }): void {
  act(() => {
    appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, {
      game: {
        missions: { unlocked: options.unlocked ?? true, items: [] },
        chest: { status: options.chest ?? 'locked' },
        flame: { status: options.flame ?? 'lit', days: 4 },
      },
    });
  });
}

function monterOuvert(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<FloatingMenus routeKey="list" />);
  });
  act(() => {
    (container.querySelector('[data-floating-menu]') as HTMLButtonElement).click();
  });
}

const barreauDuJeu = () => container.querySelector('a[href$="/progression"]');
const point = () => barreauDuJeu()?.querySelector('[data-rung-dot]') ?? null;
const pointsDeLEchelle = () => container.querySelectorAll('[data-rung-dot]').length;

describe('le point du barreau « Ma Légende »', () => {
  test('Offrande prête : le barreau porte un point, et son nom le dit', () => {
    servir({ chest: 'ready' });
    monterOuvert();

    expect(point()).not.toBeNull();
    expect(point()?.getAttribute('aria-hidden')).toBe('true');
    expect(barreauDuJeu()?.getAttribute('aria-label')).toBe('Ma Légende, Offrande prête');
  });

  test('Flamme en danger : un point, et le nom dit la Flamme', () => {
    servir({ flame: 'at-risk' });
    monterOuvert();

    expect(point()).not.toBeNull();
    expect(barreauDuJeu()?.getAttribute('aria-label')).toBe('Ma Légende, Flamme en danger');
  });

  test('les deux à la fois : UN point, et le nom dit les deux', () => {
    servir({ chest: 'ready', flame: 'at-risk' });
    monterOuvert();

    expect(pointsDeLEchelle()).toBe(1);
    expect(barreauDuJeu()?.getAttribute('aria-label')).toBe('Ma Légende, Offrande prête, Flamme en danger');
  });

  test('rien à signaler : aucun point, le nom est celui du barreau', () => {
    servir({ chest: 'claimed', flame: 'lit' });
    monterOuvert();

    expect(point()).toBeNull();
    expect(barreauDuJeu()?.getAttribute('aria-label')).toBe('Ma Légende');
  });

  test('avant que les actes s’ouvrent, une Offrande « prête » ne fait aucun point', () => {
    servir({ chest: 'ready', unlocked: false });
    monterOuvert();

    expect(point()).toBeNull();
  });

  test('cache vide : aucun point', () => {
    monterOuvert();

    expect(point()).toBeNull();
  });

  test('l’Offrande ouverte arrive dans le cache : le point s’efface sans requête', () => {
    servir({ chest: 'ready' });
    monterOuvert();
    expect(point()).not.toBeNull();

    servir({ chest: 'claimed' });
    expect(point()).toBeNull();
  });

  test('« Jeu masqué » : ni barreau du jeu, ni point nulle part', () => {
    gamePrefs.set({ hidden: true });
    servir({ chest: 'ready', flame: 'at-risk' });
    monterOuvert();

    expect(barreauDuJeu()).toBeNull();
    expect(pointsDeLEchelle()).toBe(0);
  });
});

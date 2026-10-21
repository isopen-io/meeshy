import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { RowMenuMore, RowSubmenuChoice } from '@/lib/view/row-actions';

import { RowActions } from './row-actions';

/**
 * LE MENU D'UNE LIGNE PORTE LES SOUS-MENUS D'iOS (#10593) — « Favori › » et
 * « Déplacer vers… › » remplacent le panneau par leurs entrées, un « Retour »
 * en tête ; le clavier y entre et en sort ; une entrée choisie part vers
 * l'écran et referme le menu.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
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
});

const MORE: RowMenuMore = { details: true, rename: true, organize: true, favorite: '🔥', block: null };

function mount(): { readonly actions: string[]; readonly choices: RowSubmenuChoice[] } {
  const actions: string[] = [];
  const choices: RowSubmenuChoice[] = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ul>
        <li data-row>
          <RowActions
            flags={{ isPinned: false, isMuted: false, isArchived: false }}
            unread={false}
            magnified
            language="fr"
            more={MORE}
            categoryId="cat-b"
            categories={[
              { id: 'cat-a', name: 'Travail' },
              { id: 'cat-b', name: 'Proches' },
            ]}
            onAction={(id) => actions.push(id)}
            onChoice={(choice) => choices.push(choice)}
          />
        </li>
      </ul>,
    );
  });
  return { actions, choices };
}

const items = (): HTMLButtonElement[] => [...document.body.querySelectorAll<HTMLButtonElement>('[role="menu"] button')];
const labels = (): string[] => items().map((b) => b.textContent ?? '');
const item = (label: string): HTMLButtonElement | undefined => items().find((b) => b.textContent === label);
const menuLabel = (): string | null => document.body.querySelector('[role="menu"]')?.getAttribute('aria-label') ?? null;

function openMenu(): void {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Actions de conversation"]');
  act(() => {
    button?.click();
  });
}

describe('RowActions — les sous-menus Favori et Déplacer vers…', () => {
  test('« Favori » s’annonce comme une porte de menu et ouvre ses huit emojis, le courant coché', () => {
    mount();
    openMenu();
    const trigger = item('Favori');
    expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
    act(() => {
      trigger?.click();
    });
    expect(menuLabel()).toBe('Favori');
    expect(labels()).toEqual(['Favori', '⭐️', '❤️', '🔥', '💎', '🎯', '✨', '🏆', '💡', 'Retirer le favori']);
    expect(item('🔥')?.getAttribute('aria-checked')).toBe('true');
    expect(item('💎')?.getAttribute('aria-checked')).toBe('false');
  });

  test('choisir un emoji le remet à l’écran et referme le menu', () => {
    const { choices } = mount();
    openMenu();
    act(() => {
      item('Favori')?.click();
    });
    act(() => {
      item('💎')?.click();
    });
    expect(choices).toEqual([{ kind: 'favorite', emoji: '💎' }]);
    expect(menuLabel()).toBeNull();
  });

  test('« Déplacer vers… » : les catégories puis « Mes conversations » ; retoucher la courante la vide', () => {
    const { choices } = mount();
    openMenu();
    act(() => {
      item('Déplacer vers…')?.click();
    });
    expect(labels()).toEqual(['Déplacer vers…', 'Travail', 'Proches', 'Mes conversations']);
    act(() => {
      item('Proches')?.click();
    });
    expect(choices).toEqual([{ kind: 'moveTo', categoryId: null }]);
  });

  test('le retour ramène le menu principal ; « Détails » et « Renommer » partent vers l’écran', () => {
    const { actions } = mount();
    openMenu();
    act(() => {
      item('Favori')?.click();
    });
    act(() => {
      items()[0]?.click();
    });
    expect(menuLabel()).toBe('Actions de conversation');
    expect(labels()).toContain('Déplacer vers…');
    act(() => {
      item('Détails')?.click();
    });
    openMenu();
    act(() => {
      item('Renommer')?.click();
    });
    expect(actions).toEqual(['details', 'rename']);
  });

  test('au clavier : Flèche droite entre dans le sous-menu, Flèche gauche en sort', () => {
    mount();
    openMenu();
    const menu = (): HTMLElement | null => document.body.querySelector('[role="menu"]');
    const press = (key: string) =>
      act(() => {
        menu()?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
    for (const _ of ['mute', 'read', 'details', 'rename', 'favorite']) press('ArrowDown');
    expect(document.activeElement?.textContent).toBe('Favori');
    press('ArrowRight');
    expect(menuLabel()).toBe('Favori');
    press('ArrowLeft');
    expect(menuLabel()).toBe('Actions de conversation');
  });
});

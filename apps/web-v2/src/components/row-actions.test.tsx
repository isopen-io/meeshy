import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { ConversationFlags } from '@/lib/api/preferences';

import { RowActions } from './row-actions';

/**
 * LE RETOUR MATÉRIEL FERME LE MENU DE RANGÉE, PAS LA LISTE (#6357).
 *
 * Mesuré sur l'émulateur Android contre staging : menu « Actions de
 * conversation » ouvert sur `/`, `history.length` inchangé, un appui RETOUR
 * fermait le menu ET quittait la liste pour `/settings`. Le menu Meeshy
 * flottant, lui, consomme ce retour (`useBackDismiss`). Ces témoins portent la
 * même loi sur le menu de rangée, par son API publique : on ouvre par le
 * bouton, on observe l'historique et le DOM.
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

const flagsOf = (overrides: Partial<ConversationFlags> = {}): ConversationFlags => ({
  isPinned: false,
  isMuted: false,
  isArchived: false,
  ...overrides,
});

function mountRowActions(): { readonly actions: string[] } {
  const actions: string[] = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<RowActions flags={flagsOf({ isPinned: true })} unread magnified onAction={(id) => actions.push(id)} />);
  });
  return { actions };
}

/** Un BOOLÉEN, jamais le nœud : un `expect(node).toBeNull()` en échec imprime
 * tout l'objet global de happy-dom (mesuré : 20 s, test tué à 5 s). */
const menuIsOpen = (): boolean =>
  document.body.querySelector('[role="menu"][aria-label="Actions de conversation"]') !== null;

function openMenu(): void {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Actions de conversation"]');
  if (button === null) throw new Error('bouton « Actions de conversation » introuvable');
  act(() => {
    button.click();
  });
}

const carriesBackDismiss = (state: unknown): boolean =>
  typeof state === 'object' && state !== null && 'backDismiss' in state;

describe('RowActions — le retour matériel consomme le menu, jamais la liste (#6357)', () => {
  test('ouvrir le menu pose SA propre entrée d’historique', () => {
    mountRowActions();
    const before = window.history.length;

    openMenu();

    expect(menuIsOpen()).toBe(true);
    expect(window.history.length).toBe(before + 1);
    expect(carriesBackDismiss(window.history.state)).toBe(true);
  });

  test('popstate (retour matériel) menu ouvert ⇒ le menu se ferme', () => {
    mountRowActions();
    openMenu();
    expect(menuIsOpen()).toBe(true);

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(menuIsOpen()).toBe(false);
  });

  test('menu fermé, un popstate ne touche à rien : aucune entrée n’est posée tant que le menu n’est pas ouvert', () => {
    mountRowActions();
    const before = window.history.length;

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(menuIsOpen()).toBe(false);
    expect(window.history.length).toBe(before);
  });
});

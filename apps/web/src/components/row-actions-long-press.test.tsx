import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';
import { LONG_PRESS_MAX_DISTANCE_PX, LONG_PRESS_MS } from '@/lib/view/long-press';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LensRow } from './lens-row';

/**
 * TENIR UNE LIGNE OUVRE SON APERÇU (#11211) — `useLongPress`, étalé sur la
 * ligne : Safari iOS et la PWA iPhone n'émettent pas `contextmenu`, donc
 * l'appui seul doit suffire. Le clic qui suit le relâcher n'ouvre pas la
 * conversation ; Échap et le voile referment, et le focus revient sur ⋮.
 */

const group = {
  id: 'c-lyon',
  type: 'group',
  title: 'Équipe Lyon',
  status: 'active',
  visibility: 'private',
  isActive: true,
  memberCount: 4,
  participants: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  unreadCount: 0,
  currentUserRole: 'member',
  isMember: true,
} as unknown as Conversation;

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/chats' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadRowMenuCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  window.history.replaceState(null, '', '/chats');
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ul>
        <LensRow
          conversation={group}
          languages={['fr']}
          viewerId="u-moi"
          flags={{ isPinned: false, isMuted: false, isArchived: false }}
          unreadCount={0}
          onRowAction={() => undefined}
        />
      </ul>,
    );
  });
}

const row = (): HTMLElement => {
  const node = container.querySelector<HTMLElement>('[data-row]');
  if (node === null) throw new Error('ligne introuvable');
  return node;
};
const textLink = (): HTMLAnchorElement => {
  const node = container.querySelector<HTMLAnchorElement>('[data-row] a[href="/c/c-lyon"]:not([aria-hidden])');
  if (node === null) throw new Error('lien introuvable');
  return node;
};
const peekIsOpen = (): boolean => document.body.querySelector('[data-conversation-peek]') !== null;
const menuButton = (): HTMLButtonElement | null => container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');

const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const pointer = (target: Element, type: string, x: number, y: number) =>
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, isPrimary: true, pointerType: 'touch', pointerId: 7, clientX: x, clientY: y }));
  });

async function holdOpen() {
  pointer(textLink(), 'pointerdown', 40, 40);
  await wait(LONG_PRESS_MS + 40);
}

describe('LensRow — l’appui long ouvre l’aperçu de la conversation', () => {
  test('un appui maintenu, sans contextmenu, ouvre la grappe aperçu + actions', async () => {
    mount();
    await holdOpen();
    expect(peekIsOpen()).toBe(true);
    expect(document.body.querySelector('[data-conversation-peek] [role="menu"]')).not.toBeNull();
  });

  test('le clic qui suit le relâcher n’ouvre pas la conversation', async () => {
    mount();
    await holdOpen();
    pointer(textLink(), 'pointerup', 40, 40);
    act(() => {
      textLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(window.location.pathname).toBe('/chats');
    expect(peekIsOpen()).toBe(true);
  });

  test('un déplacement de plus de 6 px annule le geste', async () => {
    mount();
    pointer(textLink(), 'pointerdown', 40, 40);
    pointer(textLink(), 'pointermove', 40, 40 + LONG_PRESS_MAX_DISTANCE_PX + 3);
    await wait(LONG_PRESS_MS + 40);
    expect(peekIsOpen()).toBe(false);
  });

  test('Maj+F10 au clavier ouvre la grappe', async () => {
    mount();
    textLink().focus();
    act(() => {
      textLink().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    });
    await wait(20);
    expect(peekIsOpen()).toBe(true);
  });

  test('le clic droit ouvre la grappe, sans le menu du navigateur', async () => {
    mount();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    act(() => {
      row().dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(peekIsOpen()).toBe(true);
  });

  test('Échap referme et rend le focus au bouton ⋮', async () => {
    mount();
    await holdOpen();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(peekIsOpen()).toBe(false);
    expect(document.activeElement).toBe(menuButton());
  });

  test('toucher le voile referme et rend le focus au bouton ⋮', async () => {
    mount();
    await holdOpen();
    const veil = document.body.querySelector<HTMLElement>('[data-conversation-peek-veil]');
    expect(veil).not.toBeNull();
    act(() => {
      veil?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      veil?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(peekIsOpen()).toBe(false);
    expect(document.activeElement).toBe(menuButton());
  });

  test('le bouton ⋮ garde son panneau ancré, sans aperçu', () => {
    mount();
    act(() => menuButton()?.click());
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    expect(peekIsOpen()).toBe(false);
  });
});

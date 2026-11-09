import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';
import { LONG_PRESS_MS } from '@/lib/view/long-press';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { peekSheetFrame, peekSheetHeights } from '@/lib/view/peek-sheet';

import { LensRow } from './lens-row';

/**
 * #17243 — L'APERÇU TENU EST GRAND, SON MENU COMPACT, ET ON LE TIRE. Observé
 * par ce que l'utilisateur voit et touche : le cran du menu, la poignée et
 * son état annoncé, les deux hauteurs pendant et après le geste, et les
 * actions qui restent atteignables sans le geste (clavier, focus, Réduire les
 * animations).
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
  const actions: string[] = [];
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
          onRowAction={(_, action) => actions.push(action)}
        />
      </ul>,
    );
  });
  return { actions };
}

const textLink = (): HTMLAnchorElement => {
  const node = container.querySelector<HTMLAnchorElement>('[data-row] a[href="/c/c-lyon"]:not([aria-hidden])');
  if (node === null) throw new Error('lien introuvable');
  return node;
};

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


const sheet = (): HTMLElement => {
  const node = document.body.querySelector<HTMLElement>('[data-peek-sheet]');
  if (node === null) throw new Error('menu de la grappe introuvable');
  return node;
};
const slot = (): HTMLElement => {
  const node = document.body.querySelector<HTMLElement>('[data-peek-card-slot]');
  if (node === null) throw new Error('carte de la grappe introuvable');
  return node;
};
const handle = (): HTMLButtonElement => {
  const node = document.body.querySelector<HTMLButtonElement>('[data-peek-handle]');
  if (node === null) throw new Error('poignée introuvable');
  return node;
};
const menuItems = (): HTMLButtonElement[] => [...document.body.querySelectorAll<HTMLButtonElement>('[data-peek-menu] [role^="menuitem"]')];
const frame = () => peekSheetFrame({ viewport: { width: window.innerWidth, height: window.innerHeight }, safe: { top: 0, bottom: 0 }, itemCount: menuItems().length });
const px = (value: number) => `${value}px`;

const drag = (target: Element, type: string, y: number) =>
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, isPrimary: true, pointerType: 'touch', pointerId: 9, clientX: 100, clientY: y }));
  });

async function holdOpenAndRelease() {
  await holdOpen();
  pointer(textLink(), 'pointerup', 40, 40);
}

describe('#17243 — au repos, la carte est grande et le menu compact', () => {
  test('l’appui long ouvre le menu compact : la poignée annonce qu’il reste des actions', async () => {
    mount();
    await holdOpenAndRelease();
    expect(sheet().dataset.peekDetent).toBe('compact');
    expect(handle().getAttribute('aria-expanded')).toBe('false');
    expect(handle().getAttribute('aria-label')).toBe('Afficher toutes les actions');
    const rest = peekSheetHeights(frame(), 0);
    expect(sheet().style.height).toBe(px(rest.menu));
    expect(slot().style.height).toBe(px(rest.card));
  });

  test('toutes les actions sont dans le menu, même compact : le catalogue ne change pas', async () => {
    mount();
    await holdOpenAndRelease();
    expect(menuItems().map((item) => item.textContent)).toContain('Archiver');
  });
});

describe('#17243 — tirer le menu', () => {
  test('tirer la poignée vers le haut de toute la course étend le menu et réduit la carte', async () => {
    mount();
    await holdOpenAndRelease();
    const f = frame();
    const travel = f.menuExpanded - f.menuCompact;
    drag(handle(), 'pointerdown', 600);
    drag(handle(), 'pointermove', 600 - travel / 2);
    expect(sheet().style.height).toBe(px(peekSheetHeights(f, 0.5).menu));
    expect(slot().style.height).toBe(px(peekSheetHeights(f, 0.5).card));
    drag(handle(), 'pointermove', 600 - travel);
    await wait(150);
    drag(handle(), 'pointerup', 600 - travel);
    expect(sheet().dataset.peekDetent).toBe('expanded');
    expect(handle().getAttribute('aria-expanded')).toBe('true');
    expect(sheet().style.height).toBe(px(f.menuExpanded));
    expect(slot().style.height).toBe(px(peekSheetHeights(f, 1).card));
  });

  test('relâché lentement avant la moitié de la course, le menu revient compact', async () => {
    mount();
    await holdOpenAndRelease();
    const f = frame();
    const travel = f.menuExpanded - f.menuCompact;
    drag(handle(), 'pointerdown', 600);
    drag(handle(), 'pointermove', 600 - travel * 0.3);
    await wait(150);
    drag(handle(), 'pointerup', 600 - travel * 0.3);
    expect(sheet().dataset.peekDetent).toBe('compact');
    expect(sheet().style.height).toBe(px(f.menuCompact));
  });

  test('revenir en arrière avant de relâcher restaure le menu compact', async () => {
    mount();
    await holdOpenAndRelease();
    const f = frame();
    const travel = f.menuExpanded - f.menuCompact;
    drag(handle(), 'pointerdown', 600);
    drag(handle(), 'pointermove', 600 - travel * 0.8);
    drag(handle(), 'pointermove', 600);
    await wait(150);
    drag(handle(), 'pointerup', 600);
    expect(sheet().dataset.peekDetent).toBe('compact');
  });

  test('un coup rapide vers le haut étend, même court', async () => {
    mount();
    await holdOpenAndRelease();
    drag(handle(), 'pointerdown', 600);
    drag(handle(), 'pointermove', 590);
    drag(handle(), 'pointermove', 570);
    drag(handle(), 'pointerup', 570);
    expect(sheet().dataset.peekDetent).toBe('expanded');
  });

  test('tirer vers le bas referme en compact', async () => {
    mount();
    await holdOpenAndRelease();
    drag(handle(), 'pointerdown', 300);
    drag(handle(), 'pointerup', 300);
    act(() => handle().click());
    expect(sheet().dataset.peekDetent).toBe('expanded');
    const f = frame();
    drag(handle(), 'pointerdown', 300);
    drag(handle(), 'pointermove', 300 + (f.menuExpanded - f.menuCompact));
    await wait(150);
    drag(handle(), 'pointerup', 300 + (f.menuExpanded - f.menuCompact));
    expect(sheet().dataset.peekDetent).toBe('compact');
  });

  test('tirer depuis une action ne la déclenche pas', async () => {
    const { actions } = mount();
    await holdOpenAndRelease();
    const pin = menuItems().find((item) => item.textContent === 'Épingler');
    if (pin === undefined) throw new Error('« Épingler » introuvable');
    drag(pin, 'pointerdown', 600);
    drag(pin, 'pointermove', 560);
    drag(pin, 'pointermove', 500);
    drag(pin, 'pointerup', 500);
    act(() => {
      pin.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(actions).toEqual([]);
    expect(sheet().dataset.peekDetent).toBe('expanded');
  });

  test('un toucher sans tirage agit comme avant', async () => {
    const { actions } = mount();
    await holdOpenAndRelease();
    const pin = menuItems().find((item) => item.textContent === 'Épingler');
    if (pin === undefined) throw new Error('« Épingler » introuvable');
    drag(pin, 'pointerdown', 600);
    drag(pin, 'pointermove', 602);
    drag(pin, 'pointerup', 602);
    act(() => {
      pin.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(actions).toEqual(['pin']);
  });
});

describe('#17243 — toutes les actions sans le geste', () => {
  test('la poignée est un bouton : Entrée étend, flèche bas replie, sans voler le focus du menu', async () => {
    mount();
    await holdOpenAndRelease();
    handle().focus();
    act(() => {
      handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(sheet().dataset.peekDetent).toBe('expanded');
    expect(handle().getAttribute('aria-label')).toBe('Réduire les actions');
    act(() => {
      handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    });
    expect(sheet().dataset.peekDetent).toBe('compact');
    expect(document.activeElement).toBe(handle());
    act(() => {
      handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    });
    expect(sheet().dataset.peekDetent).toBe('expanded');
  });

  test('une action hors de la tête qui reçoit le focus étend le menu', async () => {
    mount();
    await holdOpenAndRelease();
    const hidden = menuItems()[3];
    if (hidden === undefined) throw new Error('quatrième action introuvable');
    act(() => hidden.focus());
    expect(sheet().dataset.peekDetent).toBe('expanded');
  });

  test('ouverte au clavier (Maj+F10), la grappe montre toutes les actions', async () => {
    mount();
    textLink().focus();
    act(() => {
      textLink().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    });
    await wait(20);
    expect(sheet().dataset.peekDetent).toBe('expanded');
  });

  test('sous « Réduire les animations », l’appui long ouvre le menu étendu', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      mount();
      await holdOpenAndRelease();
      expect(sheet().dataset.peekDetent).toBe('expanded');
    } finally {
      window.matchMedia = original;
    }
  });
});

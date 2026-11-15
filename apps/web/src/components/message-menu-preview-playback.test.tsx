import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { messageMenuItems } from '@/lib/view/message-actions';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageMenu } from './message-menu';

/**
 * L'APERÇU D'APPUI LONG LIT LES VOCAUX ET LES VIDÉOS (#11339, décision porteur
 * du 2026-10-24, option B) — par le menu entier, comme l'utilisateur.
 *
 * 1. Cliquer lecture dans l'aperçu lance la lecture, et le menu RESTE ouvert.
 * 2. Fermer le menu met en pause ce que l'aperçu a lancé.
 * 3. Une pièce à vue unique ne se lit jamais depuis l'aperçu : l'hôte reste
 *    une image inerte.
 * 4. Le bouton de lecture est atteint au clavier et nommé pour le lecteur
 *    d'écran.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

const rectOf = (box: { top: number; left: number; width: number; height: number }): DOMRect =>
  ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => box }) as DOMRect;

const VOICE =
  '<div data-voice-card data-attachment="a1"><audio preload="none"></audio><div>' +
  '<button type="button" data-voice-play aria-label="Lire l’audio">▶</button>' +
  '<button type="button" aria-label="Vitesse">1×</button></div></div>';

/** La rangée VIVANTE : son bouton bascule un `<audio>` piloté à la main, comme `toggle`. */
function liveRow(html: string): { readonly row: HTMLElement; readonly audio: () => { readonly paused: boolean } } {
  const row = document.createElement('div');
  row.setAttribute('data-row', 'm1');
  row.innerHTML = html;
  row.getBoundingClientRect = () => rectOf({ top: 300, left: 0, width: 390, height: 80 });
  document.body.append(row);
  const audio = row.querySelector('audio');
  const state = { paused: true };
  if (audio !== null) {
    Object.defineProperty(audio, 'paused', { configurable: true, get: () => state.paused });
    audio.play = () => {
      state.paused = false;
      return Promise.resolve();
    };
    audio.pause = () => {
      state.paused = true;
    };
    row.querySelector<HTMLButtonElement>('[data-voice-play]')!.addEventListener('click', () => {
      if (state.paused) void audio.play();
      else audio.pause();
    });
  }
  return { row, audio: () => state };
}

function mountMenu(row: HTMLElement) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const closed: string[] = [];
  function Harness() {
    const [open, setOpen] = useState(true);
    return open ? (
      <MessageMenu
        target={{ messageId: 'm1', element: row, isMine: false }}
        items={messageMenuItems({ hasText: false, isProtected: false, languageCount: 1, canForward: true })}
        choices={[]}
        subjectLabel="Actions du message"
        onClose={() => {
          closed.push('close');
          setOpen(false);
        }}
        onReact={() => {}}
        onExpandReactions={() => {}}
        onAction={() => {}}
        onPickLanguage={() => {}}
      />
    ) : null;
  }
  act(() => {
    root!.render(<Harness />);
  });
  return { closed };
}

const host = (): HTMLElement => document.querySelector<HTMLElement>('[data-message-menu-preview-host]')!;
const previewPlay = (): HTMLButtonElement | null => host().querySelector<HTMLButtonElement>('[data-voice-play]');

describe('l’aperçu lit le vocal (#11339)', () => {
  test('cliquer lecture dans l’aperçu lance la lecture, et le menu reste ouvert', () => {
    const { row, audio } = liveRow(VOICE);
    const { closed } = mountMenu(row);
    act(() => previewPlay()!.click());
    expect(audio().paused).toBe(false);
    expect(closed).toEqual([]);
    expect(document.querySelector('[role="menu"]')).not.toBe(null);
  });

  test('fermer le menu met en pause ce que l’aperçu a lancé', () => {
    const { row, audio } = liveRow(VOICE);
    mountMenu(row);
    act(() => previewPlay()!.click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });
    expect(document.querySelector('[role="menu"]')).toBe(null);
    expect(audio().paused).toBe(true);
  });

  test('le bouton de lecture est nommé, focalisable, dans un groupe « Aperçu du message »', () => {
    const { row } = liveRow(VOICE);
    mountMenu(row);
    expect(host().hasAttribute('inert')).toBe(false);
    expect(host().getAttribute('role')).toBe('group');
    expect(host().getAttribute('aria-label')).toBe(translate('fr', 'message.menu.preview'));
    expect(previewPlay()!.closest('[inert]')).toBe(null);
    expect(previewPlay()!.getAttribute('aria-label')).toBe('Lire l’audio');
    expect(host().querySelector('[aria-label="Vitesse"]')!.closest('[inert]')).not.toBe(null);
  });

  test('Tab depuis la dernière entrée du menu atteint le bouton de lecture', async () => {
    const { row } = liveRow(VOICE);
    mountMenu(row);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"], [data-message-menu-rail] button'));
    const last = document.querySelectorAll<HTMLElement>('.message-menu-list [role="menuitem"]');
    act(() => {
      last[last.length - 1]!.focus();
      document.querySelector<HTMLElement>('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    });
    act(() => {
      (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));
    });
    expect(items.length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(previewPlay());
  });

  test('Tab depuis le bouton de lecture boucle sur la première entrée, puis avance — jamais coincé', async () => {
    const { row } = liveRow(VOICE);
    mountMenu(row);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const menu = () => document.querySelector<HTMLElement>('[role="menu"]')!;
    const tab = () =>
      act(() => {
        (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));
      });
    act(() => {
      menu().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }));
    });
    const first = document.activeElement;
    act(() => {
      menu().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    });
    const second = document.activeElement;
    act(() => {
      menu().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    });
    const last = document.activeElement;
    expect(new Set([first, second, last]).size).toBe(3);
    tab();
    expect(document.activeElement).toBe(previewPlay());
    tab();
    expect(document.activeElement).toBe(first);
    tab();
    expect(document.activeElement).toBe(second);
  });

  test('Maj+Tab depuis la première entrée passe par le bouton de lecture puis revient à la dernière', async () => {
    const { row } = liveRow(VOICE);
    mountMenu(row);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const menu = () => document.querySelector<HTMLElement>('[role="menu"]')!;
    const shiftTab = () =>
      act(() => {
        (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', shiftKey: true }));
      });
    act(() => {
      menu().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    });
    const last = document.activeElement;
    act(() => {
      menu().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }));
    });
    shiftTab();
    expect(document.activeElement).toBe(previewPlay());
    shiftTab();
    expect(document.activeElement).toBe(last);
  });
});

describe('vue unique : l’aperçu ne lit rien (#11339)', () => {
  test('la pièce protégée n’offre aucun bouton vivant, l’hôte reste une image inerte', () => {
    const { row, audio } = liveRow(`<div data-protected="hidden">${VOICE}</div>`);
    mountMenu(row);
    expect(host().hasAttribute('inert')).toBe(true);
    expect(host().getAttribute('aria-hidden')).toBe('true');
    previewPlay()?.click();
    expect(audio().paused).toBe(true);
  });
});

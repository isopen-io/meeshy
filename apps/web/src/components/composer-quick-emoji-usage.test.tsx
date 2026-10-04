import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { EMOJI_USAGE_KEY } from '@/lib/emoji-usage';
import { LONG_PRESS_MS } from '@/lib/view/long-press';
import { Composer } from './composer';

/**
 * LES EMOJIS RAPIDES SUIVENT L'USAGE, ET UN APPUI LONG EN CHOISIT UN AUTRE
 * (#7983) — miroir `UniversalComposerBar+Send.swift` : `EmojiUsageTracker
 * .topEmojis(count:defaults:)` classe le cadre, l'appui long ouvre la feuille
 * des emojis (#7931), l'emoji choisi part directement.
 */
describe('Composer — les emojis rapides suivent l’usage du lecteur', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(async () => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    await import('./composer-emoji-sheet');
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const disposers: Array<() => void> = [];

  afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose());
    localStorage.clear();
  });

  const mount = (onSend: (payload: { text: string }) => void = () => {}) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<Composer onSend={onSend} preferred={['fr']} />);
    });
    disposers.push(() => {
      act(() => root.unmount());
      container.remove();
    });
    return container;
  };

  const shown = (el: HTMLElement) =>
    [...el.querySelectorAll<HTMLButtonElement>('[data-composer-quick-emoji] button')].map((b) => b.textContent);
  const button = (el: HTMLElement, emoji: string) =>
    el.querySelector<HTMLButtonElement>(`[data-composer-quick-emoji] button[aria-label="Envoyer directement ${emoji}"]`)!;
  const sheet = () => document.querySelector<HTMLElement>('[data-quick-emoji-picker]');

  async function settleUntil(ready: () => boolean): Promise<void> {
    for (let turn = 0; turn < 50 && !ready(); turn += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  const longPress = async (target: HTMLElement) => {
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 }));
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 20)));
    act(() => {
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
      target.click();
    });
  };

  test('sans historique : les défauts d’iOS, 😂 ❤️ 👍', () => {
    expect(shown(mount())).toEqual(['😂', '❤️', '👍']);
  });

  test('l’emoji que ce lecteur emploie le plus passe en tête, même hors des défauts', () => {
    localStorage.setItem(EMOJI_USAGE_KEY, JSON.stringify([['🔥', 2], ['🦄', 5]]));
    expect(shown(mount())).toEqual(['🦄', '🔥', '😂']);
  });

  test('un envoi rapide compte : au retour du composeur, l’emoji envoyé est classé', () => {
    const el = mount();
    act(() => button(el, '👍').click());
    act(() => button(el, '👍').click());
    expect(shown(el)).toEqual(['😂', '❤️', '👍']);
    expect(shown(mount())).toEqual(['👍', '😂', '❤️']);
  });

  test('un stockage illisible laisse les défauts', () => {
    localStorage.setItem(EMOJI_USAGE_KEY, '{oops');
    expect(shown(mount())).toEqual(['😂', '❤️', '👍']);
  });

  test('l’appui long ouvre la palette sans envoyer l’emoji pressé ; l’emoji choisi part directement', async () => {
    const sent: string[] = [];
    const el = mount((payload) => sent.push(payload.text));
    await longPress(button(el, '❤️'));
    await settleUntil(() => sheet() !== null);
    expect(sheet()?.textContent).toContain('Choisir un autre emoji');
    expect(sent).toEqual([]);
    act(() => sheet()!.querySelector<HTMLButtonElement>('button[aria-label="🎉"]')!.click());
    expect(sent).toEqual(['🎉']);
    expect(sheet()).toBeNull();
    expect(JSON.parse(localStorage.getItem(EMOJI_USAGE_KEY)!)).toEqual([['🎉', 1]]);
  });

  test('après la palette, un toucher simple envoie de nouveau', async () => {
    const sent: string[] = [];
    const el = mount((payload) => sent.push(payload.text));
    await longPress(button(el, '❤️'));
    await settleUntil(() => sheet() !== null);
    act(() => sheet()!.querySelector<HTMLButtonElement>('button[aria-label="🎉"]')!.click());
    act(() => {
      button(el, '😂').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
      button(el, '😂').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
      button(el, '😂').click();
    });
    expect(sent).toEqual(['🎉', '😂']);
  });

  test('au clavier et au lecteur d’écran : Maj+F10 ouvre la palette, l’emoji annonce le geste', async () => {
    const el = mount();
    const target = button(el, '😂');
    expect(target.getAttribute('aria-keyshortcuts')).toBe('Shift+F10');
    expect(target.getAttribute('aria-description')).toBe('Appui long ou Maj+F10 : choisir un autre emoji');
    expect(target.getAttribute('aria-haspopup')).toBe('dialog');
    act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    });
    await settleUntil(() => sheet() !== null);
    expect(sheet()).not.toBeNull();
  });

  test('après une palette ouverte au clavier puis refermée, l’emoji focalisé s’envoie au premier appui', async () => {
    const sent: string[] = [];
    const el = mount((payload) => sent.push(payload.text));
    const target = button(el, '😂');
    act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }));
    });
    await settleUntil(() => sheet() !== null);
    act(() => sheet()!.querySelector<HTMLButtonElement>('button[aria-label="Fermer"]')!.click());
    await settleUntil(() => sheet() === null);
    act(() => button(el, '😂').click());
    expect(sent).toEqual(['😂']);
  });

  test('le clic droit (menu contextuel) ouvre la même palette', async () => {
    const el = mount();
    act(() => {
      button(el, '👍').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await settleUntil(() => sheet() !== null);
    expect(sheet()).not.toBeNull();
  });

  test('fermer la palette n’envoie rien', async () => {
    const sent: string[] = [];
    const el = mount((payload) => sent.push(payload.text));
    act(() => {
      button(el, '👍').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await settleUntil(() => sheet() !== null);
    act(() => sheet()!.querySelector<HTMLButtonElement>('button[aria-label="Fermer"]')!.click());
    await settleUntil(() => sheet() === null);
    expect(sheet()).toBeNull();
    expect(sent).toEqual([]);
  });
});

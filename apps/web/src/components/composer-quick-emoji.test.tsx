import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { QUICK_REACTIONS } from '@/lib/view/message-actions';
import { Composer } from './composer';
import { QUICK_EMOJI_ARRIVAL_MS } from './composer-quick-emoji';

/**
 * LES EMOJIS RAPIDES DU COMPOSEUR (#7980, jumelle web de #7961 et #7966).
 *
 * Puis #7985 (directive porteur 2026-09-25) : TROIS emojis EN PERMANENCE —
 * les trois premiers de la liste unique (`QUICK_REACTIONS`), sur une rangée,
 * à la hauteur de la ligne de saisie, focus ou non. La barre d'outils garde
 * toute sa largeur. La forme « cinq en 3 + 2 sur tout le côté droit » est
 * retirée.
 */
describe('Composer — le cadre des emojis rapides', () => {
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

  const mount = (onSend: (payload: { text: string }) => void = () => {}) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Composer onSend={onSend} preferred={['fr']} />);
    });
    return container;
  };

  const frameOf = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-composer-quick-emoji]');
  const rowsOf = (el: HTMLElement) =>
    [...el.querySelectorAll<HTMLElement>('[data-composer-quick-emoji]')].map((row) =>
      [...row.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
    );
  const fieldOf = (el: HTMLElement) => el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
  const label = (emoji: string) => `Envoyer directement ${emoji}`;

  test('champ vide, hors focus : les TROIS premiers de QUICK_REACTIONS, sur UNE rangée', () => {
    const el = mount();
    expect(rowsOf(el)).toEqual([QUICK_REACTIONS.slice(0, 3).map(label)]);
  });

  test('au focus : la MÊME rangée de trois — le focus ne change rien au cadre', () => {
    const el = mount();
    const before = frameOf(el);
    act(() => fieldOf(el).focus());
    expect(rowsOf(el)).toEqual([QUICK_REACTIONS.slice(0, 3).map(label)]);
    expect(frameOf(el)).toBe(before);
    act(() => fieldOf(el).blur());
    expect(rowsOf(el)).toEqual([QUICK_REACTIONS.slice(0, 3).map(label)]);
  });

  test('le cadre tient dans la ligne de saisie (44 px), jamais posé sur la barre d’outils', () => {
    const el = mount();
    const frame = frameOf(el)!;
    expect(frame.style.height).toBe('44px');
    expect(frame.style.position).toBe('');
    expect(frame.className).not.toContain('absolute');
    expect(frame.hasAttribute('data-covers-toolbar')).toBe(false);
  });

  test('la barre d’outils garde TOUTE sa largeur, focus ou non : aucune réserve, tonalité présente', () => {
    const el = mount();
    const toolbar = el.querySelector<HTMLElement>('[data-composer-toolbar]')!;
    expect(toolbar.style.paddingInlineEnd).toBe('');
    expect(toolbar.querySelector('[role="img"][aria-label^="Tonalité"]')).not.toBeNull();
  });

  test('du texte dans le champ : le cadre cède la place au bouton d’envoi', () => {
    const el = mount();
    act(() => {
      const field = fieldOf(el);
      field.value = 'bonjour';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(frameOf(el)).toBeNull();
    expect(el.querySelector('[aria-label="Envoyer"]')).not.toBeNull();
  });

  test('toucher un emoji l’ENVOIE seul, directement', () => {
    const sent: string[] = [];
    const el = mount((p) => sent.push(p.text));
    act(() => {
      el.querySelector<HTMLButtonElement>(`[aria-label="${label(QUICK_REACTIONS[2])}"]`)!.click();
    });
    expect(sent).toEqual([QUICK_REACTIONS[2]]);
  });

  /** EN SÉRIE (#7985) — 😂 😂 😂 sont trois messages, jamais un seul. */
  test('deux taps sur le MÊME emoji ⇒ DEUX envois', () => {
    const sent: string[] = [];
    const el = mount((p) => sent.push(p.text));
    const tap = () =>
      act(() => {
        el.querySelector<HTMLButtonElement>(`[aria-label="${label(QUICK_REACTIONS[0])}"]`)!.click();
      });
    tap();
    tap();
    expect(sent).toEqual([QUICK_REACTIONS[0], QUICK_REACTIONS[0]]);
  });

  /** LE DOUBLE-CLIC SUR « ENVOYER » (#7985) — le dédoublonnage par contenu
   * est retiré ; ce qui protège le double-clic est le champ VIDÉ à l'instant
   * de l'envoi : le second clic, même servi avant tout nouveau rendu, ne
   * trouve plus rien à envoyer. */
  test('double clic sur Envoyer avec du texte ⇒ UN seul envoi', () => {
    const sent: string[] = [];
    const el = mount((p) => sent.push(p.text));
    act(() => {
      const field = fieldOf(el);
      field.value = 'bonjour';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      const button = el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!;
      button.click();
      button.click();
    });
    expect(sent).toEqual(['bonjour']);
  });

  /** LE SECOND CLIC D'UN DOUBLE CLIC TOMBE SUR UN EMOJI (#7985, mesuré au
   * navigateur) — le bouton d'envoi part, le cadre revient À LA MÊME PLACE,
   * et le second clic envoyait l'emoji sous le pointeur. Le cadre qui revient
   * n'est vivant qu'après le temps d'un double clic. */
  test('le cadre qui revient après un envoi ignore le second clic du double clic, puis redevient vivant', async () => {
    const sent: string[] = [];
    const el = mount((p) => sent.push(p.text));
    act(() => {
      const field = fieldOf(el);
      field.value = 'bonjour';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click());
    const emoji = () => el.querySelector<HTMLButtonElement>(`[aria-label="${label(QUICK_REACTIONS[2])}"]`)!;
    act(() => emoji().click());
    expect(sent).toEqual(['bonjour']);
    await act(async () => new Promise((resolve) => setTimeout(resolve, QUICK_EMOJI_ARRIVAL_MS + 30)));
    act(() => emoji().click());
    expect(sent).toEqual(['bonjour', QUICK_REACTIONS[2]]);
  });

  test('chaque emoji est un vrai bouton, atteignable au clavier', () => {
    const el = mount();
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('[data-composer-quick-emoji] button')];
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
      expect(button.tabIndex).not.toBe(-1);
    }
  });
});

/**
 * LE RETOUR APRÈS ENVOI, ADOUCI (#7985) — iOS fait revenir les emojis (et
 * partir le bouton d'envoi) par un « tourbillon » ; la directive porteur le
 * veut nettement moins accentué : environ ±40° et une échelle de départ de
 * 0,6 (au lieu de ±250° et 0,05), un ressort presque sans rebond. Le web
 * n'avait AUCUNE transition — une bascule sèche : il reçoit la forme douce.
 */
describe('Composer — le retour après envoi', () => {
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

  const mountComposer = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<Composer onSend={() => {}} preferred={['fr']} />);
    });
    return {
      el: container,
      dispose: () => {
        act(() => root.unmount());
        container.remove();
      },
    };
  };

  test('à l’ouverture, les emojis sont LÀ, sans entrée animée', () => {
    const { el, dispose } = mountComposer();
    expect(el.querySelector('[data-composer-quick-emoji]')?.classList.contains('composer-slot-in')).toBe(false);
    dispose();
  });

  test('après un envoi, les emojis REVIENNENT par l’entrée douce ; le bouton d’envoi arrive de même', () => {
    const { el, dispose } = mountComposer();
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    act(() => {
      field.value = 'bonjour';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(el.querySelector('[aria-label="Envoyer"]')?.classList.contains('composer-slot-in')).toBe(true);
    act(() => el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click());
    expect(el.querySelector('[data-composer-quick-emoji]')?.classList.contains('composer-slot-in')).toBe(true);
    dispose();
  });

  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'app.css'), 'utf8');
  const keyframes = css.slice(css.indexOf('@keyframes composerSlotIn'));
  const from = keyframes.slice(0, keyframes.indexOf('}'));

  test('l’entrée tourne d’au plus 40° et part d’au moins 0,6', () => {
    const rotation = Math.abs(Number.parseFloat(/rotate\((-?[\d.]+)deg\)/.exec(from)?.[1] ?? 'NaN'));
    const scale = Number.parseFloat(/scale\(([\d.]+)\)/.exec(from)?.[1] ?? 'NaN');
    expect(rotation).toBeGreaterThan(0);
    expect(rotation).toBeLessThanOrEqual(40);
    expect(scale).toBeGreaterThanOrEqual(0.6);
  });

  test('prefers-reduced-motion coupe l’entrée', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.composer-slot-in\s*\{\s*animation: none;/);
  });
});

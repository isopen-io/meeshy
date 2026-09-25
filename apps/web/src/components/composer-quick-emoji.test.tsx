import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { QUICK_REACTIONS } from '@/lib/view/message-actions';
import { Composer } from './composer';

/**
 * LES EMOJIS RAPIDES DU COMPOSEUR (#7980, jumelle web de #7961 et #7966).
 *
 * Champ vide et NON focalisé : les CINQ premiers de la liste unique
 * (`QUICK_REACTIONS`) dans un cadre de verre qui prend TOUT le côté droit —
 * du haut de la barre d'outils au bas de la ligne de saisie — en 3 + 2, la
 * barre d'outils réservant sa droite au cadre.
 *
 * Au FOCUS : le cadre se replie à la hauteur de la ligne, les TROIS premiers
 * sur une rangée, et la barre d'outils retrouve toute sa largeur.
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
    [...el.querySelectorAll<HTMLElement>('[data-composer-quick-emoji] [data-quick-emoji-row]')].map((row) =>
      [...row.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
    );
  const fieldOf = (el: HTMLElement) => el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
  const label = (emoji: string) => `Envoyer directement ${emoji}`;

  test('champ vide, hors focus : les CINQ premiers de QUICK_REACTIONS, en 3 + 2', () => {
    const el = mount();
    expect(rowsOf(el)).toEqual([
      QUICK_REACTIONS.slice(0, 3).map(label),
      QUICK_REACTIONS.slice(3, 5).map(label),
    ]);
  });

  test('hors focus, le cadre couvre la droite de la barre d’outils, qui la lui RÉSERVE', () => {
    const el = mount();
    expect(frameOf(el)?.getAttribute('data-covers-toolbar')).toBe('true');
    const toolbar = el.querySelector<HTMLElement>('[data-composer-toolbar]')!;
    expect(Number.parseFloat(toolbar.style.paddingInlineEnd)).toBeGreaterThan(0);
  });

  test('au focus : trois emojis sur UNE rangée, et la barre d’outils retrouve toute sa largeur', () => {
    const el = mount();
    act(() => fieldOf(el).focus());
    expect(rowsOf(el)).toEqual([QUICK_REACTIONS.slice(0, 3).map(label)]);
    expect(frameOf(el)?.getAttribute('data-covers-toolbar')).toBe('false');
    const toolbar = el.querySelector<HTMLElement>('[data-composer-toolbar]')!;
    expect(toolbar.style.paddingInlineEnd === '' || Number.parseFloat(toolbar.style.paddingInlineEnd) === 0).toBe(true);
  });

  test('le focus perdu rend les cinq emojis', () => {
    const el = mount();
    act(() => fieldOf(el).focus());
    act(() => fieldOf(el).blur());
    expect(rowsOf(el).flat()).toHaveLength(5);
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
      el.querySelector<HTMLButtonElement>(`[aria-label="${label(QUICK_REACTIONS[4])}"]`)!.click();
    });
    expect(sent).toEqual([QUICK_REACTIONS[4]]);
  });

  test('chaque emoji est un vrai bouton, atteignable au clavier', () => {
    const el = mount();
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('[data-composer-quick-emoji] button')];
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
      expect(button.tabIndex).not.toBe(-1);
    }
  });
});

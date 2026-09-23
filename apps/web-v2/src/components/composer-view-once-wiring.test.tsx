import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { Composer } from './composer';

/**
 * LA BASCULE « VUE UNIQUE » DE `Composer` (#7354, puis #7597).
 *
 * #7597 (retour porteur 2026-09-23) : « le composer bar n'a pas la vue
 * unique ». Elle était câblée mais GATÉE sur une pièce jointe IMAGE en
 * attente (#7354) : dans l'état par défaut du composeur, elle n'existait
 * pas. #7498 a tranché depuis que la vue unique vaut pour TOUT ce qu'on
 * envoie (texte, image, audio, vidéo, document, sticker), et iOS (#7472)
 * pose la capsule d'un TAP, À CÔTÉ du flou, avec le « 1 » cerclé
 * (`1.circle` / `1.circle.fill`, `UniversalComposerBar+Protections.swift`).
 *
 * Ces témoins montent le composeur RÉEL dans son état par défaut.
 */
describe('Composer — la bascule « vue unique » (#7354)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(async () => {
    ensureHappyDomRegistered();
    await loadInterfaceCatalog('fr');
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

  const mount = (onSend: (payload: { text: string; attachments: readonly unknown[]; language: string; protection: unknown }) => void) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Composer onSend={onSend} preferred={['fr']} />);
    });
    return container;
  };

  const ATTENTE_MAX_MS = 2000;
  const flush = async (condition?: () => boolean): Promise<void> => {
    const limite = Date.now() + ATTENTE_MAX_MS;
    for (;;) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        for (let i = 0; i < 5; i += 1) await Promise.resolve();
      });
      if (condition === undefined || condition() || Date.now() >= limite) return;
    }
  };

  const tiroirMonte = (el: HTMLElement) => (): boolean =>
    el.querySelector('[role="group"][aria-label="Types de pièces jointes"]') !== null;

  const attachImage = async (el: HTMLElement, name = 'plage.jpg'): Promise<void> => {
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Ouvrir le menu des pièces jointes"]')!.click();
    });
    await flush(tiroirMonte(el));
    const input = el.querySelector<HTMLInputElement>('[aria-label="Choisir des photos"]')!;
    const file = new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    act(() => {
      Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
  };

  const toggleOf = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-composer-view-once]');

  const typeText = (el: HTMLElement, value: string) => {
    const field = el.querySelector<HTMLTextAreaElement>('textarea')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  test('état par défaut, sans rien en attente : la capsule « vue unique » EST là, désarmée', () => {
    const el = mount(() => {});
    const toggle = toggleOf(el);
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    expect(toggle?.getAttribute('aria-label')).toBe('Activer le mode vue unique');
  });

  test('elle se tient JUSTE APRÈS le flou, avec le « 1 » cerclé (contour désarmé, plein armé)', () => {
    const el = mount(() => {});
    const blur = el.querySelector('[data-composer-blur]');
    expect(blur?.nextElementSibling).toBe(toggleOf(el));
    expect(toggleOf(el)?.getAttribute('data-glyph')).toBe('numberCircleOne');
    act(() => {
      toggleOf(el)!.click();
    });
    expect(toggleOf(el)?.getAttribute('data-glyph')).toBe('numberCircleOneFill');
  });

  test('un seul tap arme la bascule (aria-pressed + libellé « Vue unique » visibles)', () => {
    const el = mount(() => {});
    act(() => {
      toggleOf(el)!.click();
    });
    expect(toggleOf(el)?.getAttribute('aria-pressed')).toBe('true');
    expect(toggleOf(el)?.textContent).toContain('Vue unique');
  });

  test('un TEXTE seul, armé puis envoyé : onSend porte protection.viewOnce === true', () => {
    let sent: { text: string; protection: { viewOnce?: boolean } } | null = null;
    const el = mount((p) => {
      sent = p as { text: string; protection: { viewOnce?: boolean } };
    });
    typeText(el, 'secret');
    act(() => {
      toggleOf(el)!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect(sent).not.toBeNull();
    expect(sent!.text).toBe('secret');
    expect(sent!.protection.viewOnce).toBe(true);
  });

  test('une IMAGE, armée puis envoyée : onSend porte protection.viewOnce === true', async () => {
    let sent: { protection: { viewOnce?: boolean } } | null = null;
    const el = mount((p) => {
      sent = p as { protection: { viewOnce?: boolean } };
    });
    await attachImage(el);
    act(() => {
      toggleOf(el)!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect(sent!.protection.viewOnce).toBe(true);
  });

  test('après un envoi, la bascule redescend — le message suivant part sans elle', () => {
    const sent: { protection: { viewOnce?: boolean } }[] = [];
    const el = mount((p) => {
      sent.push(p as { protection: { viewOnce?: boolean } });
    });
    typeText(el, 'un');
    act(() => {
      toggleOf(el)!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect(toggleOf(el)?.getAttribute('aria-pressed')).toBe('false');
    typeText(el, 'deux');
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect(sent[0]?.protection.viewOnce).toBe(true);
    expect(sent[1]?.protection.viewOnce).toBeUndefined();
  });

  test('retirer la dernière image ne DÉSARME plus la bascule : elle vaut pour tout ce qui part', async () => {
    const el = mount(() => {});
    await attachImage(el, 'seule.jpg');
    act(() => {
      toggleOf(el)!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Supprimer seule.jpg"]')!.click();
    });
    await flush();
    expect(toggleOf(el)?.getAttribute('aria-pressed')).toBe('true');
  });
});

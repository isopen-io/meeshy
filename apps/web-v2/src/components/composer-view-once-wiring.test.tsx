import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { Composer } from './composer';

/**
 * LA BASCULE « VUE UNIQUE » DE `Composer` (#7354, V6) — EXTRAIT, motif
 * `composer-top-row-wiring.test.tsx` (`composer.test.tsx` porte déjà 925
 * lignes pour un budget de 1000-1200, CLAUDE.md racine ; un fichier NEUF par
 * responsabilité plutôt qu'un ajout au plus proche du plafond).
 *
 * Décision antérieure RENVERSÉE par #7354 : `compose-protection.ts:11-19` et
 * `composer.tsx` documentaient jusqu'ici « `viewOnce` n'a AUCUN contrôle
 * dans la rangée haute d'une conversation standard » (aligné sur iOS
 * `showViewOnce: previewMode`). Le critère de fin de #7354 exige le
 * contrôle EN CONVERSATION STANDARD — même GESTE qu'iOS (capsule togglée,
 * icône + libellé conditionnel, `+Protections.swift:161-238`), pas le même
 * EMPLACEMENT (réservé côté iOS au composeur de prévisualisation de
 * notification).
 *
 * GATE PRODUIT : la capsule n'existe QUE si une pièce jointe IMAGE est en
 * attente — « envoie une IMAGE à vue unique » (#7354), et un texte seul
 * marqué vue-unique n'a aucun rendu qui le dise (loi 4 : un contrôle sans
 * objet ne se rend pas).
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

  test('sans pièce jointe image, la capsule « vue unique » est ABSENTE', () => {
    const el = mount(() => {});
    expect(el.querySelector('[data-composer-view-once]')).toBeNull();
  });

  test('une image en attente fait apparaître la capsule, désarmée', async () => {
    const el = mount(() => {});
    await attachImage(el);
    const toggle = el.querySelector<HTMLButtonElement>('[data-composer-view-once]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
  });

  test('un tap arme la bascule (aria-pressed + libellé « Vue unique » visibles)', async () => {
    const el = mount(() => {});
    await attachImage(el);
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-view-once]')!.click();
    });
    const toggle = el.querySelector('[data-composer-view-once]');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(toggle?.textContent).toContain('Vue unique');
  });

  test('armée puis envoyée : onSend porte protection.viewOnce === true', async () => {
    let sent: { protection: unknown } | null = null;
    const el = mount((p) => {
      sent = p;
    });
    await attachImage(el);
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-view-once]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect(sent).not.toBeNull();
    expect((sent as unknown as { protection: { viewOnce?: boolean } }).protection.viewOnce).toBe(true);
  });

  test('après un envoi, la bascule redescend — un second envoi (avec une nouvelle image) part sans elle', async () => {
    const sent: { protection: { viewOnce?: boolean } }[] = [];
    const el = mount((p) => {
      sent.push(p as { protection: { viewOnce?: boolean } });
    });
    await attachImage(el, 'un.jpg');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-view-once]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    await attachImage(el, 'deux.jpg');
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect(sent[0]?.protection.viewOnce).toBe(true);
    expect(sent[1]?.protection.viewOnce).toBeUndefined();
  });

  test('retirer la DERNIÈRE image pendant que la bascule est armée la redescend — pas de fuite sans objet visible', async () => {
    const el = mount(() => {});
    await attachImage(el, 'seule.jpg');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-view-once]')!.click();
    });
    expect(el.querySelector('[data-composer-view-once]')?.getAttribute('aria-pressed')).toBe('true');

    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Supprimer seule.jpg"]')!.click();
    });
    await flush(() => el.querySelector('[data-composer-view-once]') === null);

    expect(el.querySelector('[data-composer-view-once]')).toBeNull();
  });
});

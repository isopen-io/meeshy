import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { Composer } from './composer';

/**
 * L'ACCENT SUBSTITUÉ DE `Composer`, CÂBLÉ (#6175, revue-correction défaut
 * majeur 2 puis 3) — EXTRAIT de `composer.test.tsx` (le fichier franchissait
 * le plafond dur de 1200 lignes du CLAUDE.md racine). Responsabilité
 * DISTINCTE du câblage de la rangée haute (`composer-top-row-wiring.test.tsx`) :
 * ici l'effet mesuré est un JETON CSS (`--accent` sur `[data-composer]`),
 * jamais un bit de la charge envoyée.
 *
 * Au repos, `[data-composer]` n'écrit RIEN sur `--accent` (l'élément hérite
 * l'accent de la conversation, posé par `withAccent` au niveau de l'écran) ;
 * dès qu'une protection s'arme, il la SUBSTITUE localement, sans toucher au
 * reste de l'écran. La LOI PURE (`composerAccentOf`, l'ordre iOS
 * éphémère > flou > effets > conversation) est testée séparément par
 * `lib/send/composer-accent.test.ts` — ce fichier-ci ne mesure QUE le
 * câblage entre cette loi et le DOM réel de `Composer`.
 */
describe('Composer — l’accent substitué de la rangée haute est CÂBLÉ (#6175)', () => {
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

  const mount = (onSend: (payload: { text: string; attachments: readonly unknown[]; language: string; protection: unknown }) => void) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Composer onSend={onSend} preferred={['fr']} />);
    });
    return container;
  };

  const type = (field: HTMLTextAreaElement, value: string) => {
    act(() => {
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  test('au repos, aucune substitution : `--accent` n’est pas écrit sur la racine', () => {
    const el = mount(() => {});
    const root = el.querySelector<HTMLElement>('[data-composer]')!;
    expect(root.style.getPropertyValue('--accent')).toBe('');
  });

  test('flou armé ⇒ `--accent` de la racine devient `var(--color-i600)`', () => {
    const el = mount(() => {});
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-blur]')!.click();
    });
    const root = el.querySelector<HTMLElement>('[data-composer]')!;
    expect(root.style.getPropertyValue('--accent')).toBe('var(--color-i600)');
  });

  test('éphémère armé ⇒ `--accent` de la racine devient `var(--color-error)`, et REVIENT à rien une fois désarmé', () => {
    const el = mount(() => {});
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral]')!.click();
    });
    act(() => {
      const buttons = [...el.querySelectorAll<HTMLButtonElement>('[data-composer-ephemeral-picker] button')];
      buttons[1]!.click(); // « 30s »
    });
    const root = el.querySelector<HTMLElement>('[data-composer]')!;
    expect(root.style.getPropertyValue('--accent')).toBe('var(--color-error)');

    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral]')!.click(); // désarme.
    });
    expect(root.style.getPropertyValue('--accent')).toBe('');
  });

  test('flou ET éphémère : l’éphémère GAGNE (ordre iOS, `composerAccentOf`)', () => {
    const el = mount(() => {});
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-blur]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral]')!.click();
    });
    act(() => {
      const buttons = [...el.querySelectorAll<HTMLButtonElement>('[data-composer-ephemeral-picker] button')];
      buttons[1]!.click();
    });
    const root = el.querySelector<HTMLElement>('[data-composer]')!;
    expect(root.style.getPropertyValue('--accent')).toBe('var(--color-error)');
  });

  test('après un envoi, la substitution retombe — la protection est remise à zéro', () => {
    const el = mount(() => {});
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    type(field, 'texte');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-blur]')!.click();
    });
    const root = el.querySelector<HTMLElement>('[data-composer]')!;
    expect(root.style.getPropertyValue('--accent')).toBe('var(--color-i600)');
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect(root.style.getPropertyValue('--accent')).toBe('');
  });
});

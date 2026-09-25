import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { Composer } from './composer';

/**
 * LA RANGÉE HAUTE DE `Composer`, CÂBLÉE (#6175) — EXTRAIT de
 * `composer.test.tsx` (revue-correction #6175, défaut majeur 3 : le fichier
 * franchissait le plafond dur de 1200 lignes du CLAUDE.md racine). Le
 * COMPOSANT `composer-top-row.tsx` existe déjà séparément ; ce fichier
 * mesure son CÂBLAGE dans `Composer` — l'effet se PROUVE sur la charge
 * envoyée (`onSend`), jamais sur un simple changement de classe CSS (loi 4).
 *
 * La substitution d'ACCENT que ces mêmes protections déclenchent vit dans
 * `composer-accent-wiring.test.tsx` (responsabilité distincte : un jeton
 * CSS, pas un bit de la charge envoyée) ; la loi PURE `composerAccentOf`
 * elle-même est testée par `lib/send/composer-accent.test.ts`.
 */
describe('Composer — les quatre contrôles à effet de la rangée haute (#6175)', () => {
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

  test('flou armé ⇒ onSend porte protection.blurred === true', () => {
    let sent: { protection: unknown } | null = null;
    const el = mount((p) => {
      sent = p;
    });
    type(el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!, 'secret');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-blur]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect(sent).not.toBeNull();
    expect((sent as unknown as { protection: { blurred?: boolean } }).protection.blurred).toBe(true);
  });

  test('éphémère : tap ouvre le sélecteur, choisir 1 minute ⇒ onSend porte protection.ephemeralSeconds === 60', () => {
    let sent: { protection: unknown } | null = null;
    const el = mount((p) => {
      sent = p;
    });
    type(el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!, 'ça brûle');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral]')!.click();
    });
    expect(el.querySelector('[data-composer-ephemeral-picker]')).not.toBeNull();
    act(() => {
      // Ordre du sélecteur : Désactivé, 30s, 1min, 5min, 1h, 24h (index 2 = « 1min »).
      const buttons = [...el.querySelectorAll<HTMLButtonElement>('[data-composer-ephemeral-picker] button')];
      buttons[2]!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect((sent as unknown as { protection: { ephemeralSeconds?: number } } | null)?.protection.ephemeralSeconds).toBe(60);
  });

  test('tap sur éphémère ARMÉ le désarme (miroir +Protections.swift:26-34)', () => {
    let sent: { protection: unknown } | null = null;
    const el = mount((p) => {
      sent = p;
    });
    type(el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!, 'texte');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral]')!.click();
    });
    act(() => {
      const buttons = [...el.querySelectorAll<HTMLButtonElement>('[data-composer-ephemeral-picker] button')];
      buttons[1]!.click(); // « 30s »
    });
    expect(el.querySelector('[data-composer-ephemeral]')?.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral]')!.click(); // désarme.
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect((sent as unknown as { protection: { ephemeralSeconds?: number } } | null)?.protection.ephemeralSeconds).toBeUndefined();
  });

  test('après un envoi, la protection est remise à zéro — un second envoi part sans elle', () => {
    const sent: { protection: { blurred?: boolean } }[] = [];
    const el = mount((p) => {
      sent.push(p as { protection: { blurred?: boolean } });
    });
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    type(field, 'un');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-blur]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    type(field, 'deux');
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect(sent[0]?.protection.blurred).toBe(true);
    expect(sent[1]?.protection.blurred).toBeUndefined();
  });

  /**
   * LA CHAÎNE ENTIÈRE DES EFFETS (revue-correction #6175, puis #7980) — la
   * baguette ne présente plus de feuille : elle bascule un PANNEAU inline
   * au-dessus de la barre d'outils (jumelle de #7967). On l'ouvre, on coche,
   * on envoie, on lit la charge.
   */
  const openEffects = async (el: HTMLElement) => {
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-effects]')!.click();
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));
  };

  test('champ vide hors focus : la tonalité (toujours « neutre ») cède sa place au cadre des emojis', () => {
    const el = mount(() => {});
    expect(el.querySelector('[data-composer-toolbar] [role="img"][aria-label^="Tonalité"]')).toBeNull();
    act(() => el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!.focus());
    expect(el.querySelector('[data-composer-toolbar] [role="img"][aria-label^="Tonalité"]')).not.toBeNull();
  });

  test('la baguette ouvre le PANNEAU inline (aucune feuille), cocher « Confettis » ⇒ onSend porte SON bit', async () => {
    let sent: { protection: unknown } | null = null;
    const el = mount((p) => {
      sent = p;
    });
    type(el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!, 'boum');
    await openEffects(el);

    expect(el.querySelector('dialog')).toBeNull();
    const panel = el.querySelector<HTMLElement>('[data-composer-effects-panel]');
    expect(panel).not.toBeNull();
    expect(el.querySelector('[data-composer-effects]')?.getAttribute('aria-expanded')).toBe('true');
    act(() => {
      panel!.querySelector<HTMLButtonElement>('[aria-label="Confettis, inactif"]')!.click();
    });

    expect(el.querySelector('[data-composer-effects]')?.getAttribute('aria-label')).toBe('1 effet(s) actif(s)');

    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect((sent as unknown as { protection: { effectFlags?: number } } | null)?.protection.effectFlags).toBe(
      MESSAGE_EFFECT_FLAGS.CONFETTI,
    );
  });

  test('un second tap sur la baguette REFERME le panneau', async () => {
    const el = mount(() => {});
    await openEffects(el);
    await openEffects(el);
    expect(el.querySelector('[data-composer-effects-panel]')).toBeNull();
    expect(el.querySelector('[data-composer-effects]')?.getAttribute('aria-expanded')).toBe('false');
  });

  test('le panneau des effets et le rail éphémère s’EXCLUENT', async () => {
    const el = mount(() => {});
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral]')!.click();
    });
    expect(el.querySelector('[data-composer-ephemeral-picker]')).not.toBeNull();
    await openEffects(el);
    expect(el.querySelector('[data-composer-effects-panel]')).not.toBeNull();
    expect(el.querySelector('[data-composer-ephemeral-picker]')).toBeNull();
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral]')!.click();
    });
    expect(el.querySelector('[data-composer-ephemeral-picker]')).not.toBeNull();
    expect(el.querySelector('[data-composer-effects-panel]')).toBeNull();
  });

  test('« Tout effacer » retire les effets et laisse le flou armé', async () => {
    let sent: { protection: unknown } | null = null;
    const el = mount((p) => {
      sent = p;
    });
    type(el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!, 'calme');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-blur]')!.click();
    });
    await openEffects(el);
    const panel = () => el.querySelector<HTMLElement>('[data-composer-effects-panel]')!;
    act(() => {
      panel().querySelector<HTMLButtonElement>('[aria-label="Lueur, inactif"]')!.click();
    });
    act(() => {
      panel().querySelector<HTMLButtonElement>('[aria-label="Zoom, inactif"]')!.click();
    });
    const clear = [...panel().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Tout effacer');
    act(() => {
      clear!.click();
    });
    expect(el.querySelector('[data-composer-effects]')?.getAttribute('aria-label')).toBe('Ajouter des effets au message');
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    const protection = (sent as unknown as { protection: { blurred?: boolean; effectFlags?: number } }).protection;
    expect(protection.blurred).toBe(true);
    expect(protection.effectFlags).toBeUndefined();
  });

  test('la tonalité est un indicateur PASSIF — aucun `<button>`, un `role="img"` labellisé', () => {
    const el = mount(() => {});
    type(el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!, 'bonjour');
    const el2 = el.querySelector<HTMLElement>('[data-composer-toolbar] [role="img"][aria-label^="Tonalité"]');
    expect(el2).not.toBeNull();
    expect(el2?.tagName).not.toBe('BUTTON');
  });

  test('les cibles éphémère/flou/effets/langue portent le plancher 44 px sur les DEUX dimensions', () => {
    const el = mount(() => {});
    for (const selector of ['[data-composer-ephemeral]', '[data-composer-blur]', '[data-composer-effects]', '[data-composer-language]']) {
      const button = el.querySelector<HTMLElement>(selector)!;
      expect(button).not.toBeNull();
      /* happy-dom ne peint pas de layout réel (`getBoundingClientRect` rend 0)
         — le plancher vit dans les classes utilitaires (`min-h-11`/`min-w-11`
         = 44px, `size-11` = 44×44), vérifiées ici sur le MARQUAGE.

         LES DEUX DIMENSIONS, revue-correction : la première forme de ce
         témoin n'exigeait que `min-h-11`, et les trois bascules mesuraient
         32×44 au navigateur — un témoin vert sur la dimension voisine. La
         MESURE réelle (largeur ET hauteur, dans les deux schémas) est faite
         par `check-thread-chrome.mjs § 7`, ce marquage n'en est que le
         rappel unitaire. */
      expect(button.className).toMatch(/size-11|min-h-11/);
      expect(button.className).toMatch(/size-11|min-w-11/);
    }
  });

  test('la bascule éphémère annonce le sélecteur qu’elle ouvre (aria-expanded)', () => {
    const el = mount(() => {});
    const toggle = el.querySelector<HTMLElement>('[data-composer-ephemeral]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    act(() => {
      (toggle as HTMLButtonElement).click();
    });
    expect(el.querySelector('[data-composer-ephemeral]')?.getAttribute('aria-expanded')).toBe('true');
  });
});

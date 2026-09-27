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
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral-picker] [aria-label="1 minute"]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect((sent as unknown as { protection: { ephemeralSeconds?: number } } | null)?.protection.ephemeralSeconds).toBe(60);
  });

  /**
   * LA FLAMME-ŒIL ET 15 s (#8304) — l'ordre du rail est celui d'iOS :
   * Désactivé, flamme-œil, 15 s, puis les durées existantes. La flamme-œil
   * part SANS durée (`EPHEMERAL_AFTER_READ_SECONDS`) et se dit par son
   * pictogramme, jamais par un chiffre.
   */
  test('le rail range la flamme-œil puis 15 s AVANT les durées existantes', () => {
    const el = mount(() => {});
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral]')!.click();
    });
    const labels = [...el.querySelectorAll<HTMLButtonElement>('[data-composer-ephemeral-picker] button')].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent,
    );
    expect(labels).toEqual([
      'Désactivé',
      'Disparaît après lecture',
      '15 secondes',
      '30 secondes',
      '1 minute',
      '5 minutes',
      '1 heure',
      '24 heures',
    ]);
  });

  test('choisir la flamme-œil ⇒ onSend porte ephemeralSeconds 0, la bascule montre le pictogramme sans chiffre', () => {
    let sent: { protection: unknown } | null = null;
    const el = mount((p) => {
      sent = p;
    });
    type(el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!, 'lu puis parti');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-ephemeral-after-read]')!.click();
    });
    const toggle = el.querySelector<HTMLButtonElement>('[data-composer-ephemeral]')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Mode éphémère actif : Disparaît après lecture');
    expect(toggle.querySelector('[data-glyph="flameEye"]')).not.toBeNull();
    expect(toggle.textContent?.trim()).toBe('');
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect((sent as unknown as { protection: { ephemeralSeconds?: number } } | null)?.protection.ephemeralSeconds).toBe(0);
  });

  test('choisir 15 s ⇒ onSend porte ephemeralSeconds 15, la bascule affiche « 15s »', () => {
    let sent: { protection: unknown } | null = null;
    const el = mount((p) => {
      sent = p;
    });
    type(el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!, 'vite');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral-picker] [aria-label="15 secondes"]')!.click();
    });
    expect(el.querySelector('[data-composer-ephemeral]')?.textContent).toContain('15s');
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect((sent as unknown as { protection: { ephemeralSeconds?: number } } | null)?.protection.ephemeralSeconds).toBe(15);
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
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral-picker] [aria-label="30 secondes"]')!.click();
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

  /**
   * UNE PROTECTION ARMÉE RESTE ARMÉE (#8306, directive porteur 2026-09-27) —
   * le flou, la vue unique et l'éphémère survivent à l'envoi ; les effets
   * DÉCORATIFS, eux, restent à usage unique. Ce témoin disait l'inverse
   * (#6175 : « la protection est remise à zéro après l'envoi »).
   */
  test('après un envoi, flou et éphémère RESTENT armés — le second envoi les porte aussi', () => {
    const sent: { protection: { blurred?: boolean; ephemeralSeconds?: number } }[] = [];
    const el = mount((p) => {
      sent.push(p as { protection: { blurred?: boolean; ephemeralSeconds?: number } });
    });
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    type(field, 'un');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-blur]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-ephemeral-picker] [aria-label="15 secondes"]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    type(field, 'deux');
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect(sent[0]?.protection).toEqual({ ephemeralSeconds: 15, blurred: true });
    expect(sent[1]?.protection).toEqual({ ephemeralSeconds: 15, blurred: true });
    expect(el.querySelector('[data-composer-blur]')?.getAttribute('aria-pressed')).toBe('true');
  });

  test('après un envoi, la vue unique reste armée', () => {
    const sent: { protection: { viewOnce?: boolean } }[] = [];
    const el = mount((p) => {
      sent.push(p as { protection: { viewOnce?: boolean } });
    });
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    type(field, 'un');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-view-once]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    type(field, 'deux');
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect(sent[1]?.protection.viewOnce).toBe(true);
  });

  test('la préférence de la conversation ARME le composeur à l’ouverture (sans brouillon)', () => {
    let sent: { protection: unknown } | null = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <Composer
          onSend={(p) => {
            sent = p;
          }}
          preferred={['fr']}
          stickyProtection={{ ephemeralSeconds: 0, viewOnce: true }}
        />,
      );
    });
    expect(container.querySelector('[data-composer-view-once]')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-composer-ephemeral] [data-glyph="flameEye"]')).not.toBeNull();
    type(container.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!, 'x');
    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect((sent as unknown as { protection: unknown } | null)?.protection).toEqual({ ephemeralSeconds: 0, viewOnce: true });
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

  test('les effets DÉCORATIFS restent à usage unique : le message suivant part sans eux (#8306)', async () => {
    const sent: { protection: { effectFlags?: number; blurred?: boolean } }[] = [];
    const el = mount((p) => {
      sent.push(p as { protection: { effectFlags?: number; blurred?: boolean } });
    });
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    type(field, 'boum');
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-composer-blur]')!.click();
    });
    await openEffects(el);
    act(() => {
      el.querySelector<HTMLElement>('[data-composer-effects-panel]')!.querySelector<HTMLButtonElement>('[aria-label="Confettis, inactif"]')!.click();
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    type(field, 'calme');
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!.click();
    });
    expect(sent[0]?.protection.effectFlags).toBe(MESSAGE_EFFECT_FLAGS.CONFETTI);
    expect(sent[1]?.protection.effectFlags).toBeUndefined();
    expect(sent[1]?.protection.blurred).toBe(true);
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

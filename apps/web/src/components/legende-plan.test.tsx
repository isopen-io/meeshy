import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { PendingAttachment } from '@/lib/send/attachments';
import type { IntentionEnvoi } from '@/lib/send/legendes';
import { LegendePlan } from './legende-plan';

/**
 * **LE PLAN DE LÉGENDAGE, MESURÉ AU DOM** (#6956).
 *
 * Ce que `legendes.test.ts` ne peut PAS voir : que le champ de saisie
 * appartienne à la page COURANTE et pas à toutes. Un champ partagé rendrait
 * douze constats verts sur la loi pure — elle reçoit des saisies déjà
 * séparées — pendant que l'écran recopierait la même légende sur chaque image.
 * C'est le défaut que ce fichier existe pour attraper.
 */

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

let root: Root | null = null;
let hote: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  hote?.remove();
  root = null;
  hote = null;
});

function piece(localId: string, name: string): PendingAttachment {
  return {
    localId,
    file: new File([new Uint8Array([1])], name, { type: 'image/jpeg' }),
    kind: 'image',
    name,
    size: 1,
  };
}

const TROIS = [piece('a', 'un.jpg'), piece('b', 'deux.jpg'), piece('c', 'trois.jpg')] as const;

function monter(props: Partial<Parameters<typeof LegendePlan>[0]> = {}) {
  const envois: IntentionEnvoi[][] = [];
  const retires: string[] = [];
  let annule = 0;

  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);

  act(() => {
    root?.render(
      <LegendePlan
        pending={TROIS}
        langueParDefaut="fr"
        protection={{}}
        onAnnuler={() => {
          annule += 1;
        }}
        onRetirer={(id) => retires.push(id)}
        onEnvoyer={(e) => envois.push([...e])}
        {...props}
      />,
    );
  });

  const q = <T extends Element>(sel: string) => hote?.querySelector<T>(sel) ?? null;
  const qa = <T extends Element>(sel: string) => Array.from(hote?.querySelectorAll<T>(sel) ?? []);

  return {
    envois,
    retires,
    annules: () => annule,
    champ: () => q<HTMLTextAreaElement>('[data-legende-champ]'),
    image: () => q<HTMLImageElement>('[data-legende-image]'),
    compteur: () => q('[data-legende-compteur]')?.textContent ?? '',
    vignettes: () => qa<HTMLButtonElement>('[data-legende-vignette]'),
    envoyer: () => q<HTMLButtonElement>('[data-legende-envoyer]'),
    taper: (valeur: string) => {
      const champ = q<HTMLTextAreaElement>('[data-legende-champ]');
      act(() => {
        if (champ !== null) {
          champ.value = valeur;
          // Sous happy-dom, `onChange` d'un champ ne reçoit JAMAIS un `input`
          // dispatché — seul `onInput` se déclenche.
          champ.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    },
    allerA: (i: number) => {
      const vignette = qa<HTMLButtonElement>('[data-legende-vignette]')[i];
      act(() => {
        vignette?.click();
      });
    },
  };
}

describe('le plan de légendage (#6956)', () => {
  test('il ouvre sur la PREMIÈRE image de la sélection', () => {
    const plan = monter();
    expect(plan.compteur()).toBe('1 / 3');
    expect(plan.image()?.getAttribute('alt')).toBe('un.jpg');
  });

  test('la pellicule liste les images dans l’ordre de SÉLECTION', () => {
    const plan = monter();
    expect(plan.vignettes()).toHaveLength(3);
    expect(plan.vignettes().map((v) => v.getAttribute('aria-label'))).toEqual([
      'Image 1 sur 3 : un.jpg',
      'Image 2 sur 3 : deux.jpg',
      'Image 3 sur 3 : trois.jpg',
    ]);
  });

  test('toucher une vignette CHANGE l’image montrée (le geste a un effet, loi 4)', () => {
    const plan = monter();
    plan.allerA(2);
    expect(plan.compteur()).toBe('3 / 3');
    expect(plan.image()?.getAttribute('alt')).toBe('trois.jpg');
  });

  test('la vignette courante est la SEULE marquée pour un lecteur d’écran', () => {
    const plan = monter();
    plan.allerA(1);
    expect(plan.vignettes().map((v) => v.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
  });

  test('LE CHAMP APPARTIENT À SA PAGE — légender la deuxième ne légende pas la première', () => {
    const plan = monter();
    plan.allerA(1);
    plan.taper('le chat dort');

    expect(plan.champ()?.value).toBe('le chat dort');

    plan.allerA(0);
    expect(plan.champ()?.value).toBe('');

    plan.allerA(1);
    expect(plan.champ()?.value).toBe('le chat dort');
  });

  test('le champ NOMME son image pour un lecteur d’écran', () => {
    const plan = monter();
    plan.allerA(2);
    expect(plan.champ()?.getAttribute('aria-label')).toBe('Légende de trois.jpg');
  });

  test('envoyer rend UNE intention par image, dans l’ordre, chacune avec SA légende', () => {
    const plan = monter();
    plan.allerA(0);
    plan.taper('la première');
    plan.allerA(2);
    plan.taper('la troisième');

    act(() => {
      plan.envoyer()?.click();
    });

    expect(plan.envois).toHaveLength(1);
    const envois = plan.envois[0] ?? [];
    expect(envois.map((e) => e.text)).toEqual(['la première', '', 'la troisième']);
    expect(envois.map((e) => e.attachments[0]?.localId)).toEqual(['a', 'b', 'c']);
  });

  test('envoyer sans avoir rien tapé reste possible — la légende est FACULTATIVE', () => {
    const plan = monter();
    act(() => {
      plan.envoyer()?.click();
    });

    const envois = plan.envois[0] ?? [];
    expect(envois).toHaveLength(3);
    expect(envois.every((e) => e.text === '')).toBe(true);
  });

  test('retirer désigne l’image COURANTE, pas la première', () => {
    const plan = monter();
    plan.allerA(1);
    act(() => {
      hote?.querySelector<HTMLButtonElement>('[aria-label="Retirer deux.jpg de l’envoi"]')?.click();
    });
    expect(plan.retires).toEqual(['b']);
  });

  test('revenir au composeur n’envoie rien', () => {
    const plan = monter();
    act(() => {
      hote?.querySelector<HTMLButtonElement>('[aria-label="Revenir au composeur sans envoyer"]')?.click();
    });
    expect(plan.annules()).toBe(1);
    expect(plan.envois).toHaveLength(0);
  });

  test('une sélection VIDE ne peint aucun plan', () => {
    const plan = monter({ pending: [] });
    expect(plan.champ()).toBeNull();
    expect(plan.vignettes()).toHaveLength(0);
  });

  /**
   * LA TAILLE DES CIBLES N'EST PAS MESURABLE ICI, et le prétendre serait pire
   * que de ne rien mesurer : happy-dom ne met pas en page, donc tout
   * `getBoundingClientRect` y rend 0. Une première forme de ce fichier
   * inspectait les CLASSES (`size-11`) — un proxy qui rougissait sur
   * `ComposerLanguagePill`, composant que ce plan ne possède pas et dont la
   * cible de 44 px est déjà tenue en pixels RÉELS par
   * `scripts/check-thread-chrome.mjs:538-624`. Le seuil de 44 px appartient au
   * gate navigateur ; ce qui appartient au DOM, c'est que chaque bouton soit
   * NOMMÉ — sans quoi aucun lecteur d'écran, et aucun gate, ne peut le
   * désigner.
   */
  test('chaque bouton du plan porte un nom accessible', () => {
    monter();
    const boutons = Array.from(hote?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    expect(boutons.length).toBeGreaterThan(0);
    const anonymes = boutons.filter(
      (b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === '',
    );
    expect(anonymes).toHaveLength(0);
  });
});

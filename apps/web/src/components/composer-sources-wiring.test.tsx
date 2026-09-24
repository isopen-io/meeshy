import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Composer } from './composer';

/**
 * **LES TUILES BRANCHÉES SUR LE COMPOSEUR (#7280)** — `composer-sources.test`
 * mesure que chaque tuile appelle son gestionnaire ; celui-ci mesure ce que
 * le COMPOSEUR en fait. Les deux sont nécessaires : un panneau parfait dont
 * l'hôte jette le rappel est encore un contrôle qui ment.
 *
 * Le moteur de position n'est PAS injecté ici : le témoin pose un vrai
 * `navigator.geolocation` bouchonné, si bien que
 * `createBrowserLocationEngine` — le chemin qu'aucun témoin unitaire
 * n'emprunte (même discipline que `createBrowserRecorderEngine`) — est
 * exercé jusqu'à son `getCurrentPosition`.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

type GeoOutcome =
  | { readonly ok: true; readonly latitude: number; readonly longitude: number }
  | { readonly ok: false };

function stubGeolocation(outcome: GeoOutcome): void {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (
        onOk: (position: { coords: { latitude: number; longitude: number } }) => void,
        onError: (error: { code: number; PERMISSION_DENIED: number }) => void,
      ) => {
        if (outcome.ok) onOk({ coords: { latitude: outcome.latitude, longitude: outcome.longitude } });
        else onError({ code: 1, PERMISSION_DENIED: 1 });
      },
    },
  });
}

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  /* LES DEUX `lazy()` SONT PRÉ-RÉSOLUS ICI — sans cela, chaque cas attendait
     un `import()` dont le temps dépend de ce que le processus de test a déjà
     chargé : vert seul, rouge en suite complète. C'est une COURSE, pas un
     flake (`tasks/lessons.md`), et on la ferme à la source plutôt qu'en
     allongeant l'attente. */
  await Promise.all([import('./composer-tray'), import('./composer-emoji-sheet')]);
});

afterAll(async () => {
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

type Sent = { text: string; place: unknown };

async function mountComposer(onSend: (payload: Sent) => void = () => {}): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Composer onSend={(payload) => onSend(payload as unknown as Sent)} />);
  });
  return container;
}

/**
 * Ouvre le tiroir — `ComposerTray` est chargé par `lazy()`, donc le panneau
 * n'existe qu'après la résolution de son `import()`. Le PREMIER montage du
 * fichier de témoins paie ce chargement ; les suivants lisent le cache de
 * modules. D'où l'attente de la tuile plutôt qu'un `act` compté : un témoin
 * qui suppose un nombre de tours mesure le cache, pas le composeur.
 */
async function openPanel(el: HTMLElement): Promise<void> {
  const plus = el.querySelector<HTMLButtonElement>('button[aria-label="Ouvrir le menu des pièces jointes"]');
  if (plus === null) throw new Error('Aucun « + » dans le composeur');
  await act(async () => {
    plus.click();
  });
  await settleUntil(() => el.querySelector('[data-composer-source]') !== null);
}

/** Rend la main quand `ready()` est vrai — chaque tour laisse React vider sa
 * file et les `import()` de `lazy()` se résoudre. */
async function settleUntil(ready: () => boolean): Promise<void> {
  for (let turn = 0; turn < 50 && !ready(); turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const tile = (el: HTMLElement, id: string): HTMLElement => {
  const found = el.querySelector<HTMLElement>(`[data-composer-source="${id}"]`);
  if (found === null) throw new Error(`Aucune tuile « ${id} »`);
  return found;
};

const fieldOf = (el: HTMLElement): HTMLTextAreaElement => {
  const field = el.querySelector('textarea');
  if (field === null) throw new Error('Aucun champ');
  return field;
};

describe('Emoji — la tuile INSÈRE dans le texte en cours (#7280)', () => {
  test('choisir un emoji change ce que le champ porte', async () => {
    const el = await mountComposer();
    await openPanel(el);
    await act(async () => {
      tile(el, 'emoji').click();
    });
    await settleUntil(() => el.querySelector('button[aria-label="🔥"]') !== null);
    const emoji = el.querySelector<HTMLButtonElement>('button[aria-label="🔥"]');
    expect(emoji).not.toBeNull();
    await act(async () => {
      emoji?.click();
    });
    expect(fieldOf(el).value).toBe('🔥');
  });

  test('la palette se referme après le choix — jamais deux surfaces empilées', async () => {
    const el = await mountComposer();
    await openPanel(el);
    await act(async () => {
      tile(el, 'emoji').click();
    });
    await settleUntil(() => el.querySelector('button[aria-label="🔥"]') !== null);
    await act(async () => {
      el.querySelector<HTMLButtonElement>('button[aria-label="🔥"]')?.click();
    });
    expect(el.querySelector('button[aria-label="🔥"]')).toBeNull();
  });
});

describe('Position — le lieu obtenu est VISIBLE et PART (#7280)', () => {
  test('une position obtenue se montre, et l’envoi la porte', async () => {
    stubGeolocation({ ok: true, latitude: 48.8566, longitude: 2.3522 });
    const sent: Sent[] = [];
    const el = await mountComposer((payload) => sent.push(payload));
    await openPanel(el);
    await act(async () => {
      tile(el, 'location').click();
    });

    /* LA PUCE EST L'EFFET VISIBLE — sans elle, toucher « Position » ne
       changerait rien à l'écran et le geste aurait l'air d'avoir échoué. */
    expect(el.querySelector('[data-composer-place]')).not.toBeNull();

    await act(async () => {
      el.querySelector<HTMLButtonElement>('button[aria-label="Envoyer"]')?.click();
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.place).toEqual({ latitude: 48.8566, longitude: 2.3522 });
  });

  test('retirer le lieu le retire AUSSI de ce qui part', async () => {
    stubGeolocation({ ok: true, latitude: 10, longitude: 20 });
    const sent: Sent[] = [];
    const el = await mountComposer((payload) => sent.push(payload));
    await openPanel(el);
    await act(async () => {
      tile(el, 'location').click();
    });
    await act(async () => {
      el.querySelector<HTMLButtonElement>('button[aria-label="Retirer la position"]')?.click();
    });
    expect(el.querySelector('[data-composer-place]')).toBeNull();

    /* Sans lieu ET sans texte il n'y a rien à envoyer : on tape un mot pour
       que le bouton d'envoi existe, et on mesure que `place` est `null`. */
    const field = fieldOf(el);
    await act(async () => {
      field.value = 'bonjour';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      el.querySelector<HTMLButtonElement>('button[aria-label="Envoyer"]')?.click();
    });
    expect(sent[0]?.place).toBeNull();
  });

  /**
   * LE REFUS EST DESSINÉ, AVEC SA SORTIE — critère de fin de #7280. Le
   * témoin lit le TEXTE servi par le catalogue : une bande vide, ou une bande
   * sans « Réessayer », est précisément le silence que l'issue interdit.
   */
  test('un refus de permission se dit, et propose de réessayer', async () => {
    stubGeolocation({ ok: false });
    const el = await mountComposer();
    await openPanel(el);
    await act(async () => {
      tile(el, 'location').click();
    });
    const notice = el.querySelector('[role="status"]');
    expect(notice?.textContent).toContain('Position refusée');
    expect(notice?.textContent).toContain('Réessayer');
  });

  test('un lieu SEUL suffit à envoyer — le bouton d’envoi existe sans texte', async () => {
    stubGeolocation({ ok: true, latitude: 1, longitude: 2 });
    const el = await mountComposer();
    await openPanel(el);
    await act(async () => {
      tile(el, 'location').click();
    });
    expect(el.querySelector('button[aria-label="Envoyer"]')).not.toBeNull();
  });
});

describe('Caméra — la prise revient dans les pièces jointes (#7280)', () => {
  test('un cliché devient une pièce en attente, visible avant l’envoi', async () => {
    const el = await mountComposer();
    await openPanel(el);
    const input = tile(el, 'camera').querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) throw new Error('La tuile caméra ne porte aucun champ');
    const file = new File([new Uint8Array([1, 2, 3])], 'cliche.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(el.querySelector('button[aria-label="Supprimer cliche.jpg"]')).not.toBeNull();
  });
});

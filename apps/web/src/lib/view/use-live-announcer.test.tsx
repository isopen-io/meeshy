import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { ANNOUNCEMENT_DURATION_MS, useLiveAnnouncer } from './use-live-announcer';

/**
 * TÉMOIN (revue #5814, défaut majeur 9) — patron `message-menu.test.tsx`
 * (happy-dom + `createRoot` + `act`). Reproduit le scénario de la régression
 * mesurée dans `recette6.mjs` : une annonce posée par une source A (l'envoi),
 * puis par une source B (le menu) — c'est LA DERNIÈRE qui doit rester lisible,
 * jamais la première parce qu'elle est arrivée en premier.
 *
 * POURQUOI CE FICHIER N'ATTEND PLUS 1,5 s D'HORLOGE RÉELLE (#5888). Il le
 * faisait, et il a été le seul rouge INTERMITTENT de la CI. La chaîne :
 * le dernier témoin réarmait l'annonce à t≈1000 ms — donc un minuteur à
 * t≈2500 ms — puis s'arrêtait d'assertionner à t≈1700 ms. Entre cette dernière
 * assertion et le démontage de `afterEach`, il reste 800 ms de marge. Sur une
 * machine au repos, le démontage arrive largement avant et annule le minuteur ;
 * **sous charge, il arrive après** : le `setText('')` d'expiration s'exécute
 * alors hors de tout `act()` (React le dit : « An update to Harness inside a
 * test was not wrapped in act(...) »), et le travail de rendu qu'il planifie
 * retombe en macrotâche APRÈS `releaseHappyDomIfRegistered()` — sur un global
 * sans `window`, d'où `TypeError: undefined is not an object (evaluating
 * 'window.event')` dans `performWorkOnRootViaSchedulerTask`. Bun compte cette
 * exception en `error` sans l'attribuer à un test : RC=1 avec « 0 fail », la
 * combinaison qui rendait le défaut illisible.
 *
 * Mesuré : 0 rouge sur 18 exécutions au repos, 7 sur 22 sous charge CPU.
 * **Un flake de course ne se mesure pas sur une machine au repos** — le vert y
 * mesure la machine, pas le code.
 *
 * LA PARADE : la durée est INJECTÉE (`SHORT_MS`), et chaque témoin qui pose une
 * annonce attend son expiration AVANT de rendre la main. Aucun minuteur ne
 * survit à son témoin, donc plus aucune fenêtre où React travaille hors `act`.
 * La valeur de PRODUCTION reste épinglée, mais par une lecture de la constante
 * — jamais en la laissant s'écouler.
 */

/** Assez court pour qu'un témoin l'attende entièrement, assez long pour que la
 * distinction « réarmé / pas réarmé » reste mesurable sur une machine chargée. */
const SHORT_MS = 60;

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  /* DRAINER AVANT DE DÉMONTER LE DOM. Le scheduler React travaille en
     macrotâche ; s'il en reste une en file quand happy-dom retire `window`,
     elle s'exécute sur un global vide. Les témoins ci-dessous ne laissent plus
     rien en vol — ce tour de boucle est la ceinture par-dessus les bretelles,
     et il coûte une milliseconde. */
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
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

function Harness({ onReady }: { onReady: (announce: (message: string) => void) => void }) {
  const { text, announce } = useLiveAnnouncer(SHORT_MS);
  onReady(announce);
  return <div role="status" data-live>{text}</div>;
}

function mount(onReady: (announce: (message: string) => void) => void): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness onReady={onReady} />);
  });
  return container;
}

/** Laisse s'écouler `ms` DANS `act` — tout rendu que le minuteur déclenche est
 * donc couvert, et rien ne reste en file quand le témoin rend la main. */
const laisserPasser = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

const liveOf = (el: HTMLDivElement): string => el.querySelector('[data-live]')!.textContent ?? '';

function monter(): { el: HTMLDivElement; announce: (message: string) => void } {
  let announce: (message: string) => void = () => {};
  const el = mount((fn) => {
    announce = fn;
  });
  return { el, announce: (m: string) => announce(m) };
}

describe('useLiveAnnouncer — une région, la dernière annonce gagne (#5814, défaut majeur 9)', () => {
  test('une annonce se lit', async () => {
    const { el, announce } = monter();
    act(() => {
      announce('Message envoyé');
    });
    expect(liveOf(el)).toBe('Message envoyé');
    await laisserPasser(SHORT_MS + 40);
  });

  test('une SECONDE annonce, arrivée pendant que la première est encore visible, REMPLACE la première — jamais masquée par elle', async () => {
    const { el, announce } = monter();
    act(() => {
      announce('Message envoyé'); // source A — useSend, l'ancien bug la gardait pour le reste de la session
    });
    expect(liveOf(el)).toBe('Message envoyé');
    act(() => {
      announce('Message copié'); // source B — useMessageMenu, arrivée juste après
    });
    expect(liveOf(el)).toBe('Message copié');
    await laisserPasser(SHORT_MS + 40);
  });

  test('une annonce s’efface au bout de sa durée, comme l’ancien actionNotice', async () => {
    const { el, announce } = monter();
    act(() => {
      announce('Message copié');
    });
    expect(liveOf(el)).toBe('Message copié');
    await laisserPasser(SHORT_MS + 40);
    expect(liveOf(el)).toBe('');
  });

  test('une SECONDE annonce réarme le minuteur — elle ne s’efface pas au moment où la PREMIÈRE aurait dû s’effacer', async () => {
    const { el, announce } = monter();

    /* Horloge simulée (#6668) — deux `laisserPasser` proportionnels à
       SHORT_MS dérivent l'un par rapport à l'autre sous charge machine, et
       l'assertion intermédiaire tombe alors que le produit est correct
       (mesuré : 3887 pass / 1 fail sur la suite complète chargée, 0 fail au
       repos). Le réarmement se prouve donc par son EFFET — le minuteur
       PROGRAMMÉ — jamais par l'écoulement d'un temps, réel ou proportionnel :
       `setTimeout`/`clearTimeout` sont remplacés par un registre en mémoire
       que le témoin déclenche lui-même, à l'échéance qu'il choisit.
       Remplacement DIRECT plutôt que `spyOn` : le shim réduit de `bun:test`
       (`src/bun-test.d.ts`) ne déclare ni `spyOn` ni `toHaveBeenCalledWith`,
       et le seul autre témoin qui s'en sert (`router.test.tsx`) n'est en
       réalité jamais type-checké — collision `.ts`/`.tsx` sur le même nom de
       module, hors scope de ce correctif. */
    const pending = new Map<number, () => void>();
    const cleared: number[] = [];
    let nextId = 0;
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = ((cb: () => void) => {
      nextId += 1;
      pending.set(nextId, cb);
      return nextId;
      // La signature réelle de `setTimeout` est surchargée (DOM et Node) ;
      // le registre ci-dessus n'a besoin que d'un identifiant opaque.
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((id?: number) => {
      if (id === undefined) return;
      cleared.push(id);
      pending.delete(id);
    }) as unknown as typeof clearTimeout;

    try {
      act(() => {
        announce('Message envoyé');
      });
      expect(pending.size).toBe(1);
      const firstArmed = pending.keys().next();
      if (firstArmed.done) throw new Error('aucun minuteur programmé après la première annonce');
      const firstId = firstArmed.value;

      act(() => {
        announce('Message copié'); // réarmé — aucun temps ne s'écoule, ni réel ni simulé
      });

      // Le réarmement se lit dans le minuteur programmé : la PREMIÈRE
      // échéance a été annulée et une SECONDE a pris sa place — jamais dans
      // un texte qu'un minuteur en vol pourrait encore effacer par hasard.
      expect(cleared).toContain(firstId);
      expect(pending.has(firstId)).toBe(false);
      expect(pending.size).toBe(1);
      expect(liveOf(el)).toBe('Message copié');

      const secondArmed = pending.entries().next();
      if (secondArmed.done) throw new Error('aucun minuteur programmé après le réarmement');
      const [secondId, secondCb] = secondArmed.value;
      expect(secondId).not.toBe(firstId);

      // Déclencher SON échéance — jamais celle de la première, déjà
      // annulée — efface bien la région : le même effet qu'une horloge
      // réelle aurait produit, obtenu sans dépendre d'aucune durée.
      await act(async () => {
        secondCb();
      });
      expect(liveOf(el)).toBe('');
    } finally {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    }
  });

  test('la durée SERVIE en production est 1,5 s — épinglée, jamais attendue', () => {
    expect(ANNOUNCEMENT_DURATION_MS).toBe(1500);
  });
});

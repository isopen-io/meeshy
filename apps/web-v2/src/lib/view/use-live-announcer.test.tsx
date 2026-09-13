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
    act(() => {
      announce('Message envoyé');
    });
    await laisserPasser(Math.round(SHORT_MS * 0.6));
    act(() => {
      announce('Message copié'); // réarmé AVANT que la première n'expire
    });
    /* On dépasse l'échéance de la PREMIÈRE (0,6 + 0,6 = 1,2 durée) sans
       atteindre celle de la SECONDE : si le réarmement n'avait pas eu lieu,
       la région serait déjà vide. */
    await laisserPasser(Math.round(SHORT_MS * 0.6));
    expect(liveOf(el)).toBe('Message copié');
    /* Et on laisse la seconde expirer AVANT de rendre la main : c'est
       exactement ce que l'ancienne version ne faisait pas. */
    await laisserPasser(SHORT_MS + 40);
    expect(liveOf(el)).toBe('');
  });

  test('la durée SERVIE en production est 1,5 s — épinglée, jamais attendue', () => {
    expect(ANNOUNCEMENT_DURATION_MS).toBe(1500);
  });
});

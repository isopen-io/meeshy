import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { useBackDismiss } from './use-back-dismiss';

/**
 * TÉMOIN (revue #5814, défaut majeur 6) — patron `message-menu.test.tsx`.
 * Reproduit le scénario mesuré sur `Meeshy_Poc_Web-v31` : une couche
 * modale montée, puis un retour matériel (`popstate`, ce que le back button
 * Capacitor déclenche sur la WebView) — la couche doit se fermer SANS que
 * l'écran change, jamais l'inverse.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
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

/** Portail conditionnel, motif `MessageMenu` (monté seulement quand
 * `menuTarget !== null`, `routes/thread.tsx`) : le hook vit dans un
 * composant qui DÉMONTE réellement, jamais dans une branche `if` au sein
 * d'un composant qui reste monté (ce qui violerait les règles des Hooks et
 * ne déclencherait jamais le nettoyage de l'effet à tester). */
function Modal({ onClose }: { onClose: () => void }) {
  useBackDismiss(onClose);
  return <div data-open="true" />;
}

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <Modal onClose={onClose} /> : <div data-open="false" />;
}

function mount(open: boolean, onClose: () => void): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness open={open} onClose={onClose} />);
  });
  return container;
}

describe('useBackDismiss — le retour matériel ferme la COUCHE, pas l’écran (#5814, défaut majeur 6)', () => {
  test('monté ⇒ pose UNE entrée d’historique', () => {
    const before = window.history.length;
    mount(true, () => {});
    expect(window.history.length).toBe(before + 1);
  });

  /**
   * LA COUCHE VISIBLE A DÉJÀ POSÉ SON ENTRÉE (#6319) — un effet PASSIF pose
   * l'entrée APRÈS la peinture (Preact : un `requestAnimationFrame` puis un
   * `setTimeout`). Entre l'image qui montre la couche et cet effet, un retour
   * n'avait aucune entrée à consommer : il quittait le FIL (mesuré en CI,
   * `URL blank`, trois têtes de dev sur neuf). L'observateur de mutations
   * s'exécute juste après le commit qui insère la couche — ce qu'il lit est
   * l'historique que le premier retour possible trouverait.
   */
  test('la couche est insérée AVEC son entrée d’historique — un retour dès la première image lui appartient (#6319)', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.history.replaceState(null, '', window.location.href);
    globals.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      const stateWhenInserted = await new Promise<unknown>((resolve) => {
        const observer = new MutationObserver(() => {
          if (container.querySelector('[data-open="true"]') === null) return;
          observer.disconnect();
          resolve(window.history.state);
        });
        observer.observe(container, { childList: true, subtree: true });
        root.render(<Harness open onClose={() => {}} />);
      });
      await act(async () => {});
      const marker =
        typeof stateWhenInserted === 'object' && stateWhenInserted !== null && 'backDismiss' in stateWhenInserted
          ? stateWhenInserted.backDismiss
          : null;
      expect(typeof marker === 'string' && /^back-dismiss-\d+$/.test(marker) ? 'posée' : `absente (${String(marker)})`).toBe(
        'posée',
      );
    } finally {
      globals.IS_REACT_ACT_ENVIRONMENT = true;
    }
  });

  test('popstate (retour matériel) ⇒ ferme SANS naviguer davantage', () => {
    let closed = false;
    mount(true, () => {
      closed = true;
    });
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(closed).toBe(true);
  });

  test('fermée AUTREMENT (pas par le retour) ⇒ rend son entrée d’historique — un retour ULTÉRIEUR n’est pas avalé', async () => {
    let backCalls = 0;
    const originalBack = window.history.back.bind(window.history);
    window.history.back = () => {
      backCalls += 1;
    };
    try {
      mount(true, () => {});
      act(() => {
        root.render(<Harness open={false} onClose={() => {}} />);
      });
      /* Le recul part au tour de micro-tâche qui suit le commit (#7415) : c'est
         la fenêtre où une couche ouverte PAR LE MÊME GESTE peut adopter
         l'entrée au lieu de la voir reculer sous elle. */
      await Promise.resolve();
      expect(backCalls).toBe(1);
    } finally {
      window.history.back = originalBack;
    }
  });

  /**
   * LE BARREAU QUI NAVIGUE — mesuré sur l'échelle flottante (#6288) : le lien
   * pousse sa destination PUIS ferme la couche. Rendre « son » entrée à ce
   * moment-là reculerait d'UNE entrée — celle de la destination — et
   * défaisait la navigation : `/notifications` poussée, `/` rendue.
   */
  test('une navigation survenue pendant que la couche est ouverte n’est PAS défaite à sa fermeture', () => {
    let backCalls = 0;
    const originalBack = window.history.back.bind(window.history);
    window.history.back = () => {
      backCalls += 1;
    };
    try {
      mount(true, () => {});
      window.history.pushState(null, '', '/destination');
      act(() => {
        root.render(<Harness open={false} onClose={() => {}} />);
      });
      expect(backCalls).toBe(0);
    } finally {
      window.history.back = originalBack;
      window.history.replaceState(null, '', '/');
    }
  });

  test('fermée PAR LE RETOUR (popstate) ⇒ ne rend PAS une seconde entrée (l’entrée est déjà consommée)', () => {
    let backCalls = 0;
    const originalBack = window.history.back.bind(window.history);
    window.history.back = () => {
      backCalls += 1;
    };
    try {
      mount(true, () => {});
      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      act(() => {
        root.render(<Harness open={false} onClose={() => {}} />);
      });
      expect(backCalls).toBe(0);
    } finally {
      window.history.back = originalBack;
    }
  });

  /**
   * **UNE COUCHE QUI S'OUVRE DANS LE GESTE QUI EN FERME UNE AUTRE RESTE
   * OUVERTE** (#7415) — « Plus… » dans le menu d'un message : le menu se ferme
   * et la feuille s'ouvre dans le MÊME commit. L'ancien nettoyage du menu
   * appelait `history.back()`, dont le `popstate` arrive APRÈS que la feuille a
   * posé son entrée : la feuille le prenait pour un retour matériel et se
   * refermait (mesuré dans Chromium : `dialog added`, puis `dialog removed` une
   * milliseconde plus tard). Happy-dom n'émet pas ce `popstate` : le témoin
   * rejoue le recul ASYNCHRONE du navigateur.
   */
  test('la couche ouverte par le geste qui ferme la précédente ADOPTE son entrée, et ne se referme pas (#7415)', async () => {
    const originalBack = window.history.back.bind(window.history);
    let backCalls = 0;
    window.history.back = () => {
      backCalls += 1;
      setTimeout(() => window.dispatchEvent(new PopStateEvent('popstate')), 0);
    };
    const closed: string[] = [];
    function Swap({ which }: { which: 'menu' | 'feuille' }) {
      return which === 'menu' ? (
        <Modal key="menu" onClose={() => closed.push('menu')} />
      ) : (
        <Modal key="feuille" onClose={() => closed.push('feuille')} />
      );
    }
    try {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => {
        root.render(<Swap which="menu" />);
      });
      const lengthWithMenu = window.history.length;
      act(() => {
        root.render(<Swap which="feuille" />);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(closed).toEqual([]);
      expect(backCalls).toBe(0);
      expect(window.history.length).toBe(lengthWithMenu);
      const state = window.history.state as { readonly backDismiss?: unknown } | null;
      expect(typeof state?.backDismiss === 'string' ? 'marquée' : 'sans marque').toBe('marquée');

      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      expect(closed).toEqual(['feuille']);
      expect(backCalls).toBe(0);
    } finally {
      window.history.back = originalBack;
    }
  });
});

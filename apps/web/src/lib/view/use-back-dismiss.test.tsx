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

  /** L'entrée est désormais LAISSÉE puis rendue à la micro-tâche suivante
   * (#7527, adoption par la couche successeur) : la propriété est la même —
   * une couche fermée autrement rend son entrée — seul son instant change,
   * d'où l'attente ci-dessous. */
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
      await act(async () => {});
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
  test('une navigation survenue pendant que la couche est ouverte n’est PAS défaite à sa fermeture', async () => {
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
      await act(async () => {});
      expect(backCalls).toBe(0);
    } finally {
      window.history.back = originalBack;
      window.history.replaceState(null, '', '/');
    }
  });

  test('fermée PAR LE RETOUR (popstate) ⇒ ne rend PAS une seconde entrée (l’entrée est déjà consommée)', async () => {
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
      await act(async () => {});
      expect(backCalls).toBe(0);
    } finally {
      window.history.back = originalBack;
    }
  });
});

/**
 * LA PASSATION D'UNE COUCHE A L'AUTRE (#7527) - mesure sur staging : appui
 * long sur une bulle, clic sur « Plus... », et la feuille « Infos du
 * message » ne s'ouvrait PAS, le menu se refermant seul. Le menu et la
 * feuille sont DEUX couches : le clic les echange dans un SEUL commit
 * React, donc le nettoyage du menu rend son entree (`history.back()`) juste
 * AVANT que la feuille ne pose la sienne. Le `popstate` que ce retour
 * produit arrive apres - et c'est la FEUILLE qui l'ecoute : elle se
 * refermait sur le retour d'une couche qui n'existe plus.
 *
 * POURQUOI LE RETOUR EST SIMULE ICI. Le navigateur ne dispatche PAS
 * `popstate` pendant l'appel a `history.back()` : il le poste en tache
 * (HTML § « traverse the history by a delta »). happy-dom, lui, le
 * dispatche SYNCHRONEMENT - ce qui fait disparaitre la fenetre pendant
 * laquelle la couche suivante s'enregistre, et donc le defaut avec elle. Le
 * temoin retablit le contrat du navigateur (un `popstate` a la tache
 * suivante) : sans cela il verdit sur le defaut, ce que le depot interdit.
 */
function SheetLayer({ onClose }: { onClose: () => void }) {
  useBackDismiss(onClose);
  return <div data-sheet="true" />;
}

function Handoff({ layer, onCloseA, onCloseB }: { layer: 'a' | 'b' | null; onCloseA: () => void; onCloseB: () => void }) {
  return (
    <>
      {layer === 'a' ? <Modal onClose={onCloseA} /> : null}
      {layer === 'b' ? <SheetLayer onClose={onCloseB} /> : null}
    </>
  );
}

/** Le `history.back()` du NAVIGATEUR : il recule, puis poste `popstate`. */
function withDeferredBack<T>(run: () => T): T {
  const original = window.history.back.bind(window.history);
  window.history.back = () => {
    original();
    setTimeout(() => window.dispatchEvent(new PopStateEvent('popstate')), 0);
  };
  try {
    return run();
  } finally {
    window.history.back = original;
  }
}

describe('useBackDismiss - une couche qui en REMPLACE une autre ADOPTE son entree (#7527)', () => {
  test('menu ferme + feuille ouverte dans le MEME commit ⇒ le retour du menu ne ferme PAS la feuille', async () => {
    let closedB = 0;
    await withDeferredBack(async () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => {
        root.render(<Handoff layer="a" onCloseA={() => {}} onCloseB={() => { closedB += 1; }} />);
      });
      act(() => {
        root.render(<Handoff layer="b" onCloseA={() => {}} onCloseB={() => { closedB += 1; }} />);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    });
    expect(closedB).toBe(0);
  });

  test('la feuille reste PROPRIETAIRE d une entree : un retour materiel la ferme', async () => {
    let closedB = 0;
    await withDeferredBack(async () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => {
        root.render(<Handoff layer="a" onCloseA={() => {}} onCloseB={() => { closedB += 1; }} />);
      });
      act(() => {
        root.render(<Handoff layer="b" onCloseA={() => {}} onCloseB={() => { closedB += 1; }} />);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
    });
    expect(closedB).toBe(1);
  });
});

/**
 * DEUX COUCHES EMPILÉES (#8078) — la fiche d'un membre (`ProfilePeekSheet`)
 * s'ouvre PAR-DESSUS les détails de la conversation, qui restent montés.
 * Chaque couche écoutait TOUS les `popstate` : le retour Android fermait les
 * deux feuilles et laissait l'entrée de la première orpheline (le retour
 * suivant ne faisait plus rien) ; et fermer la fiche par son bouton rendait
 * son entrée par un `history.back()` que les détails prenaient pour le leur.
 * Seule la couche du DESSUS répond au retour. `history.back()` est ici le
 * vrai (happy-dom dépile l'entrée puis dispatche `popstate`).
 */
function Stacked({ top, onCloseA, onCloseB }: { top: boolean; onCloseA: () => void; onCloseB: () => void }) {
  return (
    <>
      <Modal onClose={onCloseA} />
      {top ? <SheetLayer onClose={onCloseB} /> : null}
    </>
  );
}

function mountStacked(onCloseA: () => void, onCloseB: () => void): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Stacked top={false} onCloseA={onCloseA} onCloseB={onCloseB} />);
  });
  act(() => {
    root.render(<Stacked top onCloseA={onCloseA} onCloseB={onCloseB} />);
  });
}

describe('useBackDismiss — deux couches EMPILÉES : le retour ferme celle du DESSUS (#8078)', () => {
  test('le retour matériel ferme la couche du dessus, et celle du dessous reste ouverte', async () => {
    const closed: string[] = [];
    mountStacked(() => closed.push('dessous'), () => closed.push('dessus'));
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(closed).toEqual(['dessus']);
  });

  test('fermer la couche du dessus AUTREMENT (son bouton) ne ferme pas celle du dessous', async () => {
    const closed: string[] = [];
    mountStacked(() => closed.push('dessous'), () => closed.push('dessus'));
    await act(async () => {
      root.render(<Stacked top={false} onCloseA={() => closed.push('dessous')} onCloseB={() => closed.push('dessus')} />);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(closed).toEqual([]);
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRef, useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createScrollerGestureSubscriber, useThreadChrome, type GestureListener } from './use-thread-chrome';

/** Patron `use-audio-playback.test.tsx` (happy-dom + `createRoot` + `act`). */
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
let mounted = false;

afterEach(() => {
  if (mounted) {
    act(() => {
      root.unmount();
    });
    mounted = false;
  }
  container.remove();
});

function mount(params: {
  readonly mode: 'focal' | 'script' | 'bubbles' | 'summary';
  readonly searchOpen: boolean;
  readonly composerEngaged: boolean;
  readonly subscribeGesture: (listener: GestureListener) => () => void;
  readonly bumpRenders: () => void;
  readonly ready?: boolean;
  /** Rend la structure LIVRÉE (`.thread-header`/`.thread-composer-chrome`/…), pour T7 (`inert`). */
  readonly withChromeStructure?: boolean;
}): {
  host: HTMLDivElement;
  setMode: (mode: 'focal' | 'script' | 'bubbles' | 'summary') => void;
  setReady: (ready: boolean) => void;
} {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mounted = true;

  let externalSetMode: (mode: 'focal' | 'script' | 'bubbles' | 'summary') => void = () => {};
  let externalSetReady: (ready: boolean) => void = () => {};

  function Harness() {
    const [mode, setMode] = useState(params.mode);
    const [ready, setReady] = useState(params.ready ?? true);
    externalSetMode = setMode;
    externalSetReady = setReady;
    const host = useRef<HTMLElement | null>(null);
    params.bumpRenders();
    useThreadChrome(host, {
      mode,
      searchOpen: params.searchOpen,
      composerEngaged: params.composerEngaged,
      subscribeGesture: params.subscribeGesture,
      ready,
    });
    if (params.withChromeStructure === true) {
      return (
        <div ref={host as React.RefObject<HTMLDivElement>} data-testid="host">
          <header className="thread-header">
            <button type="button">Retour</button>
            <div className="thread-header-actions">
              <button type="button">Appeler</button>
            </div>
          </header>
          <div className="thread-composer-chrome">
            <textarea />
          </div>
          <button type="button" className="thread-scroll-to-bottom">
            Défiler vers le bas
          </button>
        </div>
      );
    }
    return <div ref={host as React.RefObject<HTMLDivElement>} data-testid="host" />;
  }

  act(() => {
    root.render(<Harness />);
  });

  const host = container.querySelector('[data-testid="host"]') as HTMLDivElement;
  return {
    host,
    setMode: (m) => act(() => externalSetMode(m)),
    setReady: (r) => act(() => externalSetReady(r)),
  };
}

describe('useThreadChrome — deux attributs, hors React (T8)', () => {
  test('listener(true) pose les deux attributs SANS re-rendre le composant hote', () => {
    let renders = 0;
    const bumpRenders = () => {
      renders += 1;
    };
    let capturedListener: GestureListener = () => {};
    let unsubscribeCalls = 0;
    const subscribeGesture = (listener: GestureListener) => {
      capturedListener = listener;
      return () => {
        unsubscribeCalls += 1;
      };
    };

    const { host } = mount({ mode: 'focal', searchOpen: false, composerEngaged: false, subscribeGesture, bumpRenders });

    expect(host.dataset.chromeHeader).toBeUndefined();
    const rendersBefore = renders;

    act(() => {
      capturedListener(true);
    });

    expect(host.dataset.chromeHeader).toBe('entire');
    expect(host.dataset.chromeComposer).toBe('hidden');
    expect(renders).toBe(rendersBefore);

    act(() => {
      capturedListener(false);
    });
    expect(host.dataset.chromeHeader).toBeUndefined();
    expect(host.dataset.chromeComposer).toBeUndefined();
    expect(unsubscribeCalls).toBe(0);
  });

  test('bubbles : seule la grappe d actions se cache, jamais le composeur', () => {
    let capturedListener: GestureListener = () => {};
    const subscribeGesture = (listener: GestureListener) => {
      capturedListener = listener;
      return () => {};
    };
    const { host } = mount({ mode: 'bubbles', searchOpen: false, composerEngaged: false, subscribeGesture, bumpRenders: () => {} });

    act(() => {
      capturedListener(true);
    });
    expect(host.dataset.chromeHeader).toBe('actions');
    expect(host.dataset.chromeComposer).toBeUndefined();
  });

  test('hiding qui change PENDANT un geste tenu -> re-projection immediate', () => {
    let capturedListener: GestureListener = () => {};
    const subscribeGesture = (listener: GestureListener) => {
      capturedListener = listener;
      return () => {};
    };
    const { host, setMode } = mount({
      mode: 'focal',
      searchOpen: false,
      composerEngaged: false,
      subscribeGesture,
      bumpRenders: () => {},
    });

    act(() => {
      capturedListener(true);
    });
    expect(host.dataset.chromeHeader).toBe('entire');

    // Le mode change PENDANT que le geste reste tenu (heldRef.current = true).
    setMode('bubbles');
    expect(host.dataset.chromeHeader).toBe('actions');
    expect(host.dataset.chromeComposer).toBeUndefined();
  });

  test('demontage -> attributs retires ET desabonnement appele', () => {
    let capturedListener: GestureListener = () => {};
    let unsubscribeCalls = 0;
    const subscribeGesture = (listener: GestureListener) => {
      capturedListener = listener;
      return () => {
        unsubscribeCalls += 1;
      };
    };
    const { host } = mount({ mode: 'focal', searchOpen: false, composerEngaged: false, subscribeGesture, bumpRenders: () => {} });
    act(() => {
      capturedListener(true);
    });
    expect(host.dataset.chromeHeader).toBe('entire');

    act(() => {
      root.unmount();
    });
    mounted = false;
    expect(unsubscribeCalls).toBe(1);
  });

  /**
   * RÉGRESSION (revue de ce lot) — MÊME défaut que `useThreadScene` avait
   * déjà payé (« L'HÔTE DÉCLARE QUE SON CADRE EXISTE »), rejoué ici : sur
   * l'écran réel, l'hôte rend `<ThreadSkeleton />` (donc `scroller.current
   * === null`) au premier rendu, PUIS son arbre final une fois le fil
   * résolu. `subscribeGesture` capturait `null` pour TOUTE LA SESSION —
   * mesuré au navigateur (capture `.cache/web-v3-workflow/rendus/
   * thread-chrome-hidden-v2.*.png`, chrome jamais escamoté malgré un geste
   * réel) — parce que l'effet d'abonnement ne dépendait QUE de
   * `subscribeGesture` (identité stable, ne redéclenche jamais l'effet).
   */
  test('ready:false au montage -> subscribeGesture N\'EST PAS appelé ; ready:true ensuite -> abonnement RÉEL', () => {
    let subscribeCalls = 0;
    let capturedListener: GestureListener = () => {};
    const subscribeGesture = (listener: GestureListener) => {
      subscribeCalls += 1;
      capturedListener = listener;
      return () => {};
    };
    const { host, setReady } = mount({
      mode: 'focal',
      searchOpen: false,
      composerEngaged: false,
      subscribeGesture,
      bumpRenders: () => {},
      ready: false,
    });

    expect(subscribeCalls).toBe(0);

    setReady(true);
    expect(subscribeCalls).toBe(1);

    act(() => {
      capturedListener(true);
    });
    expect(host.dataset.chromeHeader).toBe('entire');
  });

  /**
   * RÉGRESSION revue #5774, défauts majeurs 3 et 4 — le `listener` passé à
   * `subscribeGesture` fermait DIRECTEMENT sur `project`, capturé une seule
   * fois par l'effet d'abonnement (déclenché seulement par `ready`, qui ne
   * change plus une fois vrai). `subscribeGesture` garde une identité
   * STABLE en production (`useMemo(() => createScrollerGestureSubscriber(...),
   * [])`) : un changement de MODE survenant APRÈS ce premier abonnement
   * (bascule Focal -> Bulles par la puce, ou fil atteint par le Résumé
   * Vivant où `mode` vaut déjà `'summary'` quand `ready` devient vrai)
   * n'atteignait donc jamais la loi (`chromeHiding`) pour le PROCHAIN geste
   * — seul l'état AU REPOS se corrigeait (la re-projection immédiate,
   * `project(heldRef.current)`, déjà couverte ci-dessus). Reproduit ICI
   * avec un `subscribeGesture` STABLE (contrairement aux tests précédents
   * qui en passent un nouveau par rendu et masquaient donc le défaut).
   */
  test('mode change APRÈS le premier abonnement -> le PROCHAIN geste lit le NOUVEAU mode (#5774 défaut 4)', () => {
    let capturedListener: GestureListener = () => {};
    // Identité STABLE, comme `useMemo(() => createScrollerGestureSubscriber(scroller), [])`.
    const subscribeGesture = (listener: GestureListener) => {
      capturedListener = listener;
      return () => {};
    };
    const { host, setMode } = mount({
      mode: 'focal',
      searchOpen: false,
      composerEngaged: false,
      subscribeGesture,
      bumpRenders: () => {},
    });

    // Un premier geste RELÂCHÉ ramène le chrome au repos (aucun attribut).
    act(() => {
      capturedListener(true);
    });
    act(() => {
      capturedListener(false);
    });
    expect(host.dataset.chromeHeader).toBeUndefined();

    setMode('bubbles');

    // Un NOUVEAU geste, après le changement de mode : la loi doit lire
    // 'bubbles' ('actions', jamais de composeur caché), pas 'focal' figé.
    act(() => {
      capturedListener(true);
    });
    expect(host.dataset.chromeHeader).toBe('actions');
    expect(host.dataset.chromeComposer).toBeUndefined();
  });

  /**
   * RÉGRESSION revue #5774, défaut majeur 3 — le fil atteint par le Résumé
   * Vivant : `ready` (`placed.length > 0`) devient vrai alors que `mode`
   * vaut déjà `'summary'` (`chromeHiding` y rend toujours `'none'`) ; ce
   * premier `mode` était celui gelé dans le `listener`. « Reprendre le
   * fil » fait passer `mode` à `'script'` SANS que `ready` ne change (les
   * données étaient déjà là) — l'abonnement ne se rejoue pas, mais le
   * PROCHAIN geste doit désormais honorer la loi du mode COURANT.
   */
  test('ready déjà vrai en summary -> mode change vers script -> le geste suivant escamote (#5774 défaut 3)', () => {
    let capturedListener: GestureListener = () => {};
    const subscribeGesture = (listener: GestureListener) => {
      capturedListener = listener;
      return () => {};
    };
    const { host, setMode } = mount({
      mode: 'summary',
      searchOpen: false,
      composerEngaged: false,
      subscribeGesture,
      bumpRenders: () => {},
      ready: true,
    });

    act(() => {
      capturedListener(true);
    });
    // En summary, chromeHiding rend toujours 'none' — rien ne se cache.
    expect(host.dataset.chromeHeader).toBeUndefined();
    act(() => {
      capturedListener(false);
    });

    setMode('script');

    act(() => {
      capturedListener(true);
    });
    expect(host.dataset.chromeHeader).toBe('entire');
    expect(host.dataset.chromeComposer).toBe('hidden');
  });

  /**
   * RÉGRESSION revue #5774, défaut majeur 7 — `pointer-events: none` (CSS
   * seul) n'arrête ni le clavier ni un lecteur d'écran : un en-tête/composeur
   * escamoté restait FOCALISABLE et exposé à l'arbre d'accessibilité.
   * `inert` ferme les DEUX portes (mêmes que `EdgeHiddenChrome.swift` côté
   * iOS : `.opacity(0)` + `.allowsHitTesting(false)`), posé par ATTRIBUT
   * (`matches('[inert]')`) — le contrat que les tests (et le CSS) peuvent
   * vérifier indépendamment du support de `inert` par l'environnement.
   */
  test('en-tete entier cache -> .thread-header INERTE, la grappe d actions ne l est PAS separement', () => {
    let capturedListener: GestureListener = () => {};
    const subscribeGesture = (listener: GestureListener) => {
      capturedListener = listener;
      return () => {};
    };
    const { host } = mount({
      mode: 'focal',
      searchOpen: false,
      composerEngaged: false,
      subscribeGesture,
      bumpRenders: () => {},
      withChromeStructure: true,
    });
    const header = host.querySelector('.thread-header') as HTMLElement;
    const headerActions = host.querySelector('.thread-header-actions') as HTMLElement;
    const composer = host.querySelector('.thread-composer-chrome') as HTMLElement;
    const scrollButton = host.querySelector('.thread-scroll-to-bottom') as HTMLElement;

    expect(header.hasAttribute('inert')).toBe(false);

    act(() => {
      capturedListener(true);
    });
    expect(header.hasAttribute('inert')).toBe(true);
    // L'HÉRITAGE fait le travail pour la grappe d'actions (sous-arbre d'un
    // ancêtre inerte) : la loi ne lui pose PAS l'attribut séparément.
    expect(headerActions.hasAttribute('inert')).toBe(false);
    expect(composer.hasAttribute('inert')).toBe(true);
    expect(scrollButton.hasAttribute('inert')).toBe(true);

    act(() => {
      capturedListener(false);
    });
    expect(header.hasAttribute('inert')).toBe(false);
    expect(composer.hasAttribute('inert')).toBe(false);
    expect(scrollButton.hasAttribute('inert')).toBe(false);
  });

  test('bulles : seule la grappe d actions devient INERTE, jamais l en-tete entier ni le composeur', () => {
    let capturedListener: GestureListener = () => {};
    const subscribeGesture = (listener: GestureListener) => {
      capturedListener = listener;
      return () => {};
    };
    const { host } = mount({
      mode: 'bubbles',
      searchOpen: false,
      composerEngaged: false,
      subscribeGesture,
      bumpRenders: () => {},
      withChromeStructure: true,
    });
    const header = host.querySelector('.thread-header') as HTMLElement;
    const headerActions = host.querySelector('.thread-header-actions') as HTMLElement;
    const composer = host.querySelector('.thread-composer-chrome') as HTMLElement;

    act(() => {
      capturedListener(true);
    });
    expect(header.hasAttribute('inert')).toBe(false);
    expect(headerActions.hasAttribute('inert')).toBe(true);
    expect(composer.hasAttribute('inert')).toBe(false);
  });

  test('composeur ENGAGE pendant un tirage tenu -> jamais inerte, meme en rangee plate', () => {
    let capturedListener: GestureListener = () => {};
    const subscribeGesture = (listener: GestureListener) => {
      capturedListener = listener;
      return () => {};
    };
    const { host } = mount({
      mode: 'focal',
      searchOpen: false,
      composerEngaged: true,
      subscribeGesture,
      bumpRenders: () => {},
      withChromeStructure: true,
    });
    const composer = host.querySelector('.thread-composer-chrome') as HTMLElement;

    act(() => {
      capturedListener(true);
    });
    expect(composer.hasAttribute('inert')).toBe(false);
  });

});

/**
 * `createScrollerGestureSubscriber` — LA LEVÉE D'UN GESTE INDIRECT (revue
 * #5774, défaut majeur 8). Utilise l'horloge RÉELLE (`now` par défaut,
 * comme en production) : les seuils (`INDIRECT_RELEASE_MS=200`,
 * `INDIRECT_TICK_MS=60`) sont assez courts pour qu'un test réel les
 * traverse en quelques centaines de millisecondes, sans horloge simulée —
 * `setInterval`/`clearInterval` NE SONT PAS injectés dans cette fonction
 * (seul `now` l'est), donc une horloge simulée n'aurait rien à avancer.
 */
describe('createScrollerGestureSubscriber — la levee d un geste indirect (T9, #5774 defaut 8)', () => {
  // `EventTarget`/`Event` référencés ICI, APRÈS `ensureHappyDomRegistered()`
  // (`beforeAll` du fichier) : une classe déclarée au chargement du module
  // capturerait le `EventTarget` NATIF de Node, avant le remplacement par
  // celui de happy-dom — realm mismatch avec `new Event(...)` créé plus tard.
  const makeFakeScroller = (): HTMLElement => {
    class FakeScroller extends EventTarget {
      scrollTop = 0;
    }
    return new FakeScroller() as unknown as HTMLElement;
  };

  test('molette (wheel) puis silence -> RELACHE en environ 200ms, jamais 900ms', async () => {
    const scroller = makeFakeScroller();
    const subscribe = createScrollerGestureSubscriber({ current: scroller });
    const heldHistory: boolean[] = [];
    const unsubscribe = subscribe((held) => heldHistory.push(held));

    scroller.dispatchEvent(new Event('wheel'));
    expect(heldHistory).toEqual([true]);

    // Bien AVANT le seuil (200ms) : toujours tenu, aucune transition.
    await new Promise((r) => setTimeout(r, 80));
    expect(heldHistory).toEqual([true]);

    // Bien APRES le seuil, mais BIEN AVANT l ancien seuil de 900ms : relache.
    await new Promise((r) => setTimeout(r, 400));
    expect(heldHistory).toEqual([true, false]);

    unsubscribe();
  });

  test('un SEUL touchstart -> aucun ticker indirect ne se declenche (chemin TOUCH inchange)', async () => {
    const scroller = makeFakeScroller();
    const subscribe = createScrollerGestureSubscriber({ current: scroller });
    const heldHistory: boolean[] = [];
    const unsubscribe = subscribe((held) => heldHistory.push(held));

    scroller.dispatchEvent(new Event('touchstart'));
    // Un simple contact (sans defilement) ne tire rien — `held` reste FAUX
    // (miroir `isDragging`) : aucune transition a signaler.
    expect(heldHistory).toEqual([]);

    scroller.dispatchEvent(new Event('touchend'));
    await new Promise((r) => setTimeout(r, 250));
    // Toujours rien : le chemin TOUCH n a jamais consulte la fenetre indirecte.
    expect(heldHistory).toEqual([]);

    unsubscribe();
  });
});

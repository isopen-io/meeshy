import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createRouter } from './router';

/**
 * T10 (#5816, E2) — `Link` COMPOSE l'`onClick` de l'appelant au lieu de
 * l'écraser (`{...rest}` était étalé AVANT le gestionnaire interne : tout
 * `onClick` fourni par un appelant disparaissait en silence, JSX appliquant
 * les attributs dans l'ordre où ils sont posés). Patron `use-back-dismiss.test.tsx`.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
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
  window.history.replaceState(null, '', '/');
});

const ROUTES = {
  list: { pattern: '/', screen: () => Promise.resolve({ default: () => null }) },
  target: { pattern: '/target', screen: () => Promise.resolve({ default: () => null }) },
} as const;

function NotFound() {
  return null;
}

function mount(node: React.ReactNode): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node as never);
  });
  return container;
}

function click(anchor: Element, init: MouseEventInit = {}) {
  act(() => {
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
  });
}

describe('createRouter().Link — compose l’onClick de l’appelant (#5816, T10)', () => {
  test('clic normal : le spy est appelé PUIS la navigation a lieu', () => {
    const { Link } = createRouter(ROUTES, NotFound);
    const calls: string[] = [];
    const el = mount(
      <Link to="target" onClick={() => calls.push('spy')}>
        Cible
      </Link>,
    );
    const anchor = el.querySelector('a')!;
    click(anchor);
    expect(calls).toEqual(['spy']);
    expect(window.location.pathname).toBe('/target');
  });

  test('si le spy appelle preventDefault(), aucune navigation n’a lieu', () => {
    const { Link } = createRouter(ROUTES, NotFound);
    const el = mount(
      <Link to="target" onClick={(e) => e.preventDefault()}>
        Cible
      </Link>,
    );
    const anchor = el.querySelector('a')!;
    click(anchor);
    expect(window.location.pathname).toBe('/');
  });

  test('Cmd-clic : ni le spy ni la navigation INTERNE (pushState) — le navigateur garde la main', () => {
    // `window.location.pathname` n'est pas un témoin fiable ici : sur ce clic
    // le gestionnaire rend la main SANS `preventDefault()`, donc happy-dom (
    // comme un vrai navigateur) suit le `href` lui-même — c'est exactement le
    // comportement voulu (nouvel onglet en vrai navigateur), pas un défaut.
    // Ce qui doit rester silencieux, c'est le routeur : `navigate()` (donc
    // `history.pushState`) ne doit jamais être appelé pour ce geste.
    const pushState = spyOn(window.history, 'pushState');
    const { Link } = createRouter(ROUTES, NotFound);
    const calls: string[] = [];
    const el = mount(
      <Link to="target" onClick={() => calls.push('spy')}>
        Cible
      </Link>,
    );
    const anchor = el.querySelector('a')!;
    click(anchor, { metaKey: true });
    expect(calls).toEqual([]);
    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  test('sans onClick fourni, la navigation a toujours lieu (comportement d’hier préservé)', () => {
    const { Link } = createRouter(ROUTES, NotFound);
    const el = mount(<Link to="target">Cible</Link>);
    const anchor = el.querySelector('a')!;
    click(anchor);
    expect(window.location.pathname).toBe('/target');
  });

  /**
   * NAVIGUER VERS L'ADRESSE OÙ L'ON EST DÉJÀ N'EMPILE RIEN (revue-correction
   * #5893). Mesuré dans un navigateur réel avant le correctif : sur `/feed`,
   * chaque tap du bouton flottant de gauche — qui pointe sur `feed` quelle
   * que soit la route — ajoutait une entrée d'historique (`history.length`
   * 3 → 4) sans rien changer à l'écran. Le bouton RETOUR matériel d'Android
   * (directive coque 5b) ramenait alors sur `/feed`, pas sur la liste.
   */
  test('un lien vers la route COURANTE n’empile aucune entrée d’historique (loi 4 + retour matériel)', () => {
    window.history.replaceState(null, '', '/target');
    const pushState = spyOn(window.history, 'pushState');
    const { Link } = createRouter(ROUTES, NotFound);
    const el = mount(<Link to="target">Cible</Link>);
    click(el.querySelector('a')!);
    expect(pushState).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/target');
    pushState.mockRestore();
  });

  test('… mais un lien vers une AUTRE route empile bien, lui', () => {
    window.history.replaceState(null, '', '/');
    const pushState = spyOn(window.history, 'pushState');
    const { Link } = createRouter(ROUTES, NotFound);
    const el = mount(<Link to="target">Cible</Link>);
    click(el.querySelector('a')!);
    expect(pushState).toHaveBeenCalled();
    pushState.mockRestore();
  });
});

/**
 * LE PRÉALABLE D'ÉCRAN (#6206) — un écran ne se rend qu'une fois son préalable
 * tenu (le catalogue d'interface de la langue résolue). Il est cherché EN
 * PARALLÈLE du chunk de l'écran, jamais après : attendre en série ajouterait
 * un aller-retour réseau à chaque premier écran.
 */
describe('createRouter(…, { screenPrerequisite }) — l’écran attend son préalable', () => {
  const deferred = () => {
    const box: { resolve: () => void } = { resolve: () => undefined };
    const promise = new Promise<void>((resolve) => {
      box.resolve = resolve;
    });
    return { promise, resolve: () => box.resolve() };
  };

  const settle = async () => {
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
  };

  test('le squelette tient tant que le préalable n’est pas tenu, l’écran vient ensuite', async () => {
    window.history.replaceState(null, '', '/');
    const gate = deferred();
    const requested: string[] = [];
    const table = {
      list: {
        pattern: '/',
        screen: () => {
          requested.push('screen');
          return Promise.resolve({ default: () => <p data-screen>Écran</p> });
        },
      },
    } as const;
    const { Router, navigate: go } = createRouter(table, NotFound, {
      screenPrerequisite: () => {
        requested.push('prerequisite');
        return gate.promise;
      },
    });
    /* L'adresse OBSERVÉE par le routeur est la sienne, pas `window.location` :
       `replaceState` ne le notifie pas, et le témoin précédent l'a laissé ailleurs. */
    act(() => go('/', true));

    const el = mount(<Router wrap={(screen) => screen} skeleton={<p data-skeleton>Attente</p>} />);
    await settle();

    expect(sortedCopy(requested)).toEqual(['prerequisite', 'screen']);
    expect(el.querySelector('[data-screen]')).toBeNull();
    expect(el.querySelector('[data-skeleton]')).not.toBeNull();

    gate.resolve();
    await settle();

    expect(el.querySelector('[data-screen]')).not.toBeNull();
  });
});

const sortedCopy = (values: readonly string[]): readonly string[] => [...values].sort();

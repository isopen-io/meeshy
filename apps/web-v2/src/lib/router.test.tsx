import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';

import { createRouter } from './router';

/**
 * T10 (#5816, E2) — `Link` COMPOSE l'`onClick` de l'appelant au lieu de
 * l'écraser (`{...rest}` était étalé AVANT le gestionnaire interne : tout
 * `onClick` fourni par un appelant disparaissait en silence, JSX appliquant
 * les attributs dans l'ordre où ils sont posés). Patron `use-back-dismiss.test.tsx`.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  GlobalRegistrator.register({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
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
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { hasNavigatedInApp, navigate } from '@/lib/router';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { useBackDismiss } from './use-back-dismiss';

/**
 * #18523 — UNE DESTINATION CHOISIE DANS UNE COUCHE NE L'ENTERRE PAS. Depuis
 * #18460 tout menu ancré pose une entrée d'historique à l'ouverture ; un choix
 * qui NAVIGUE (« Créer » du fil, « Voir le profil » du menu d'avatar) poussait
 * sa destination par-dessus, et l'entrée de la couche restait dessous : depuis
 * la destination, un retour ramenait l'écran d'origine, le suivant ne changeait
 * rien. La destination prend LA PLACE de l'entrée de la couche.
 *
 * `history.back()` est ici le vrai : happy-dom dépile l'entrée, change
 * l'adresse, puis dispatche `popstate`.
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

function Layer({ onClose }: { onClose: () => void }) {
  useBackDismiss(onClose);
  return <div data-open="true" />;
}

function Screen({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <Layer onClose={onClose} /> : <div data-open="false" />;
}

function mount(open: boolean, onClose: () => void): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Screen open={open} onClose={onClose} />);
  });
}

const goBack = () =>
  act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

describe('naviguer depuis une couche REMPLACE son entrée (#18523)', () => {
  test('ouvrir, choisir une destination, puis deux retours : l’écran d’origine, puis on le quitte', async () => {
    window.history.pushState(null, '', '/avant');
    window.history.pushState(null, '', '/origine');
    mount(true, () => {});
    act(() => {
      navigate('/destination');
    });
    act(() => {
      root.render(<Screen open={false} onClose={() => {}} />);
    });
    await act(async () => {});
    expect(window.location.pathname).toBe('/destination');
    await goBack();
    expect(window.location.pathname).toBe('/origine');
    await goBack();
    expect(window.location.pathname).toBe('/avant');
  });

  test('la destination prend la place de l’entrée de la couche : l’historique ne grandit pas', () => {
    mount(true, () => {});
    const withLayer = window.history.length;
    act(() => {
      navigate('/destination');
    });
    expect(window.history.length).toBe(withLayer);
    expect(window.location.pathname).toBe('/destination');
    expect(hasNavigatedInApp()).toBe(true);
  });

  test('la couche refermée après la navigation ne défait pas la destination', async () => {
    mount(true, () => {});
    act(() => {
      navigate('/destination');
    });
    act(() => {
      root.render(<Screen open={false} onClose={() => {}} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(window.location.pathname).toBe('/destination');
  });

  test('sans couche ouverte, naviguer empile comme avant', () => {
    mount(false, () => {});
    const before = window.history.length;
    act(() => {
      navigate('/destination-sans-couche');
    });
    expect(window.history.length).toBe(before + 1);
  });

  test('une redirection explicite depuis une couche réécrit toujours l’entrée courante', () => {
    mount(true, () => {});
    const withLayer = window.history.length;
    act(() => {
      navigate('/redirigee', true);
    });
    expect(window.history.length).toBe(withLayer);
    expect(window.location.pathname).toBe('/redirigee');
  });

  test('une couche restée montée après la navigation se ferme encore au retour', async () => {
    window.history.pushState(null, '', '/origine-tenue');
    const closed: string[] = [];
    mount(true, () => closed.push('fermée'));
    act(() => {
      navigate('/destination-tenue');
    });
    await goBack();
    expect(closed).toEqual(['fermée']);
    expect(window.location.pathname).toBe('/origine-tenue');
  });
});

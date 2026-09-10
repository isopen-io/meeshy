import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

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
  GlobalRegistrator.register();
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

  test('fermée AUTREMENT (pas par le retour) ⇒ rend son entrée d’historique — un retour ULTÉRIEUR n’est pas avalé', () => {
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
      expect(backCalls).toBe(1);
    } finally {
      window.history.back = originalBack;
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
});

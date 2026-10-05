import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallDevicesSheet } from './call-devices-sheet';

/**
 * LE RETOUR ANDROID REFERME LA FEUILLE DES PÉRIPHÉRIQUES (#8466) — c'est dans
 * la coque qu'elle sert le plus (écouteur, haut-parleur, Bluetooth), et c'est
 * là que le retour matériel est un `popstate`. Sans `useBackDismiss`, la
 * feuille restait ouverte pendant que le retour faisait reculer la page sous
 * l'écran d'appel ; Échap la fermait sur le web.
 */

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

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const mount = () => {
  let closed = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<CallDevicesSheet onClose={() => (closed += 1)} />);
  });
  return { closed: () => closed };
};

describe('CallDevicesSheet — le retour matériel', () => {
  test('popstate ⇒ la feuille se ferme', () => {
    const { closed } = mount();
    expect(container.querySelector('[data-call-devices] [role="dialog"]')).not.toBeNull();
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(closed()).toBe(1);
  });

  test('ouverte ⇒ pose une entrée d’historique que le retour consomme', () => {
    mount();
    expect(typeof (window.history.state as { backDismiss?: unknown } | null)?.backDismiss).toBe('string');
  });

  test('Échap la ferme toujours', () => {
    const { closed } = mount();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(closed()).toBe(1);
  });
});

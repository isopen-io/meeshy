import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRef } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { typingStore } from '@/lib/api/typing-store';

import { useThreadTyping } from './use-thread-typing';

/**
 * TÉMOIN T11 (#6171, § 5 étape 0) — `useThreadTyping` DISTRIBUE le roster
 * ENTIER (jamais `typists[0]`) et n'ANCRE le fil qu'à l'APPARITION d'un
 * premier frappeur (G8), pas à chaque relève de meneur ni à chaque frappeur
 * supplémentaire. Motif `use-thread-chrome-signals.test.tsx` : `createRoot` +
 * `act`, happy-dom réel.
 *
 * `typingStore` est le magasin PARTAGÉ (module-level, comme en production) —
 * chaque test utilise une conversation UNIQUE pour ne jamais lire l'état
 * laissé par un autre (motif isolation par identifiant, `fixtures.ts`).
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

function mountTracked(params: { readonly conversationId: string; readonly viewerId: string; readonly nearBottom: boolean }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  const calls = { pin: 0, cancel: 0 };
  let captured: readonly { readonly userId: string; readonly displayName: string }[] = [];

  const fakePin: typeof import('./pin-to-bottom').pinToBottom = () => {
    calls.pin += 1;
    return () => {
      calls.cancel += 1;
    };
  };

  function Harness() {
    const scroller = useRef<HTMLElement | null>(null);
    const typing = useThreadTyping({
      conversationId: params.conversationId,
      viewerId: params.viewerId,
      scroller,
      nearBottom: params.nearBottom,
      noteProgrammaticScroll: () => {},
      pin: fakePin,
    });
    captured = typing.typists;
    return <main ref={scroller as React.RefObject<HTMLElement>} data-testid="scroller" />;
  }

  act(() => {
    root.render(<Harness />);
  });

  return { calls, typists: () => captured };
}

describe('useThreadTyping — le roster ENTIER, l’ancrage à l’APPARITION seule (#6171, G1/G8)', () => {
  test('roster vide au départ, aucun ancrage', () => {
    const h = mountTracked({ conversationId: 'c-t11-a', viewerId: 'u-viewer', nearBottom: true });
    expect(h.typists()).toEqual([]);
    expect(h.calls.pin).toBe(0);
  });

  test('APPARITION (0 -> 1) : ancre UNE fois', () => {
    const h = mountTracked({ conversationId: 'c-t11-b', viewerId: 'u-viewer', nearBottom: true });
    act(() => {
      typingStore.getState().start('c-t11-b', { userId: 'u-kwame', displayName: 'Kwame Mensah' }, Date.now());
    });
    expect(h.typists().map((t) => t.userId)).toEqual(['u-kwame']);
    expect(h.calls.pin).toBe(1);
  });

  test('AJOUT (1 -> 2) : n’ancre PAS de nouveau', () => {
    const h = mountTracked({ conversationId: 'c-t11-c', viewerId: 'u-viewer', nearBottom: true });
    act(() => {
      typingStore.getState().start('c-t11-c', { userId: 'u-kwame', displayName: 'Kwame Mensah' }, Date.now());
    });
    expect(h.calls.pin).toBe(1);
    act(() => {
      typingStore.getState().start('c-t11-c', { userId: 'u-fatou', displayName: 'Fatou Bâ' }, Date.now());
    });
    expect(h.typists().map((t) => t.userId)).toEqual(['u-kwame', 'u-fatou']);
    expect(h.calls.pin).toBe(1); // toujours 1 : pas de second ancrage.
  });

  test('RELÈVE DE MENEUR (1 -> 1 autre) : n’ancre PAS de nouveau', () => {
    const h = mountTracked({ conversationId: 'c-t11-d', viewerId: 'u-viewer', nearBottom: true });
    act(() => {
      typingStore.getState().start('c-t11-d', { userId: 'u-kwame', displayName: 'Kwame Mensah' }, Date.now());
    });
    expect(h.calls.pin).toBe(1);
    act(() => {
      typingStore.getState().stop('c-t11-d', 'u-kwame');
      typingStore.getState().start('c-t11-d', { userId: 'u-fatou', displayName: 'Fatou Bâ' }, Date.now());
    });
    expect(h.typists().map((t) => t.userId)).toEqual(['u-fatou']);
    expect(h.calls.pin).toBe(1);
  });

  test('DISPARITION PUIS RÉAPPARITION : un second ancrage, un seul', () => {
    const h = mountTracked({ conversationId: 'c-t11-e', viewerId: 'u-viewer', nearBottom: true });
    act(() => {
      typingStore.getState().start('c-t11-e', { userId: 'u-kwame', displayName: 'Kwame Mensah' }, Date.now());
    });
    expect(h.calls.pin).toBe(1);
    act(() => {
      typingStore.getState().stop('c-t11-e', 'u-kwame');
    });
    expect(h.typists()).toEqual([]);
    expect(h.calls.cancel).toBe(1); // le nettoyage de l'effet a tourné.
    act(() => {
      typingStore.getState().start('c-t11-e', { userId: 'u-amina', displayName: 'Amina Diallo' }, Date.now());
    });
    expect(h.calls.pin).toBe(2);
  });

  test('lecteur PAS en bas : aucun ancrage même à l’apparition', () => {
    const h = mountTracked({ conversationId: 'c-t11-f', viewerId: 'u-viewer', nearBottom: false });
    act(() => {
      typingStore.getState().start('c-t11-f', { userId: 'u-kwame', displayName: 'Kwame Mensah' }, Date.now());
    });
    expect(h.typists().map((t) => t.userId)).toEqual(['u-kwame']);
    expect(h.calls.pin).toBe(0);
  });
});

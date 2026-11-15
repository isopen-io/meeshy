import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createDraftStore, type DraftStore } from '@/lib/send/draft-store';

import { useDraftLine } from './use-draft-line';

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

function mount(store: DraftStore): { readonly renders: (string | null)[]; readonly unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const renders: (string | null)[] = [];

  function Probe() {
    renders.push(useDraftLine({ store, scope: 'u_a', conversationId: 'c1' }));
    return null;
  }

  act(() => {
    root.render(<Probe />);
  });
  return {
    renders,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/**
 * LE BROUILLON DANS LA LIGNE DE LISTE (#7547) — la ligne lit le texte du
 * brouillon depuis `draft-store` et suit ses écritures ; une écriture sur une
 * AUTRE conversation ne la fait pas se re-rendre.
 */
describe('useDraftLine (#7547)', () => {
  test('rend le texte du brouillon, le suit, et ignore les autres conversations', () => {
    const store = createDraftStore(null);
    store.setDraft('u_a', 'c1', { text: 'Je pensais que…', language: 'fr', protection: {} });
    const probe = mount(store);

    expect(probe.renders.at(-1)).toBe('Je pensais que…');

    const before = probe.renders.length;
    act(() => {
      store.setDraft('u_a', 'c2', { text: 'ailleurs', language: 'fr', protection: {} });
    });
    expect(probe.renders.length).toBe(before);

    act(() => {
      store.setDraft('u_a', 'c1', { text: '', language: 'fr', protection: {} });
    });
    expect(probe.renders.at(-1)).toBeNull();
    probe.unmount();
  });

  test('un brouillon sans texte (seulement une réponse armée) ne s’affiche pas dans la ligne', () => {
    const store = createDraftStore(null);
    store.setDraft('u_a', 'c1', { text: '  ', language: 'fr', protection: {}, replyToId: 'm1' });
    const probe = mount(store);

    expect(probe.renders.at(-1)).toBeNull();
    probe.unmount();
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createReadingModeStore, type StorageLike } from './store';
import { usePersistedReadingMode, type PersistedReadingMode } from './use-persisted-mode';

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

/** Motif `store.test.ts` — un `StorageLike` en mémoire, pour observer
 * précisément ce que le magasin écrit (une seule clé par conversation). */
function fakeStorage(): StorageLike & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function mount(initial: {
  readonly conversationId: string | undefined;
  /** Un backend PARTAGÉ simule une nouvelle « ouverture » (remontage de
   * l'écran) sur le MÊME `localStorage` — jamais un nouveau magasin vide. */
  readonly backend?: ReturnType<typeof fakeStorage>;
}): {
  readonly rerender: (next: { readonly conversationId: string | undefined }) => void;
  readonly signals: () => PersistedReadingMode;
  readonly store: ReturnType<typeof createReadingModeStore>;
  readonly backend: ReturnType<typeof fakeStorage>;
  readonly root: Root;
  readonly container: HTMLDivElement;
} {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const thisRoot = root;
  const thisContainer = container;

  const backend = initial.backend ?? fakeStorage();
  const store = createReadingModeStore(backend);
  const openedAt = new Date('2026-09-12T10:00:00.000Z');
  let captured!: PersistedReadingMode;

  function Harness(props: { readonly conversationId: string | undefined }) {
    captured = usePersistedReadingMode({ store, scope: 'u_v1', conversationId: props.conversationId, openedAt });
    return null;
  }

  act(() => {
    root.render(<Harness conversationId={initial.conversationId} />);
  });

  return {
    rerender: (next) => {
      act(() => {
        root.render(<Harness conversationId={next.conversationId} />);
      });
    },
    signals: () => captured,
    store,
    backend,
    root: thisRoot,
    container: thisContainer,
  };
}

describe('usePersistedReadingMode — un seul identifiant, jamais le paramètre de route (revue-correction #5793)', () => {
  test('conversationId non résolu (undefined) : aucune lecture ni écriture', () => {
    const { signals, backend } = mount({ conversationId: undefined });
    expect(signals().stickyMode).toBeNull();
    expect(signals().lastOpenedAt).toBeNull();
    expect(backend.data.size).toBe(0);
  });

  test('une conversation ouverte par IDENTIFIANT puis résolue en ObjectId : la préférence posée après résolution se relit sous la MÊME clé au remontage', () => {
    // Premier montage : la route porte l'identifiant, la conversation n'est
    // pas encore résolue (l'écran est en `pending`) — RIEN ne doit s'écrire
    // sous `salon-riviere`.
    const first = mount({ conversationId: undefined });
    expect(first.backend.data.size).toBe(0);

    // La passerelle répond : `conversation.id` devient l'ObjectId canonique.
    first.rerender({ conversationId: '68f0aaaaaaaaaaaaaaaaaaaa' });
    expect(first.backend.data.has('meeshy.reading-mode.u_v1.salon-riviere')).toBe(false);

    // L'utilisateur choisit un mode — l'écriture cible l'ObjectId.
    act(() => {
      first.signals().selectMode('bubbles');
    });
    expect(first.backend.data.get('meeshy.reading-mode.u_v1.68f0aaaaaaaaaaaaaaaaaaaa')).toBe('bubbles');
    expect(first.backend.data.has('meeshy.reading-mode.u_v1.salon-riviere')).toBe(false);

    // Une deuxième « ouverture » (remontage de l'écran, MÊME `localStorage` —
    // `first.backend` PARTAGÉ, jamais un magasin vide) sur le MÊME lien par
    // identifiant : tant que la conversation n'est pas résolue, rien ne se
    // lit ; une fois résolue, la MÊME clé (ObjectId) rend « bubbles » —
    // jamais `null` comme le ferait une lecture prématurée sous l'identifiant.
    act(() => {
      first.root.unmount();
    });
    first.container.remove();
    const second = mount({ conversationId: undefined, backend: first.backend });
    expect(second.signals().stickyMode).toBeNull();
    second.rerender({ conversationId: '68f0aaaaaaaaaaaaaaaaaaaa' });
    expect(second.signals().stickyMode).toBe('bubbles');
  });

  test('noteOpened écrit UNE seule fois pour une résolution, jamais deux (identifiant puis ObjectId)', () => {
    const { rerender, backend } = mount({ conversationId: undefined });
    rerender({ conversationId: '68f0aaaaaaaaaaaaaaaaaaaa' });
    // Un re-rendu supplémentaire à IDENTITÉ inchangée (le virtualiseur du fil
    // re-rend l'écran à chaque image de défilement) ne doit pas ré-écrire.
    rerender({ conversationId: '68f0aaaaaaaaaaaaaaaaaaaa' });

    const keys = [...backend.data.keys()].filter((k) => k.startsWith('meeshy.last-opened.'));
    expect(keys).toEqual(['meeshy.last-opened.u_v1.68f0aaaaaaaaaaaaaaaaaaaa']);
  });

  test('resetToAuto efface sous la MÊME clé (ObjectId)', () => {
    const { rerender, signals, backend } = mount({ conversationId: undefined });
    rerender({ conversationId: 'c-1' });
    act(() => {
      signals().selectMode('script');
    });
    expect(backend.data.has('meeshy.reading-mode.u_v1.c-1')).toBe(true);
    act(() => {
      signals().resetToAuto();
    });
    expect(backend.data.has('meeshy.reading-mode.u_v1.c-1')).toBe(false);
    expect(signals().stickyMode).toBeNull();
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRef, useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { useOutOfView } from './use-out-of-view';

/**
 * `useOutOfView` — l'observation est déléguée au navigateur (#6103).
 *
 * happy-dom 20.14 DÉCLARE un `IntersectionObserver` global mais ne calcule
 * aucune intersection réelle (`lib/window/BrowserWindow.js:70`) — on ne peut
 * donc pas s'y fier pour prouver quoi que ce soit ici. Ce témoin pose son
 * PROPRE faux constructeur sur `globalThis`, capture ce que le hook lui
 * passe (cible, racine, seuils), et déclenche le callback à la main pour
 * prouver que la loi (`resolveOutOfView`) est bien appliquée à ce qu'il
 * reçoit.
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

type Recorded = {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observed: Element[];
  disconnected: boolean;
};

let recorded: Recorded | null;
const lastObserver = (): Recorded | null => recorded;
let nativeIntersectionObserver: typeof IntersectionObserver | undefined;

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    recorded = { callback, options, observed: [], disconnected: false };
  }
  observe(el: Element) {
    recorded?.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    if (recorded) recorded.disconnected = true;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
}

beforeEach(() => {
  recorded = null;
  nativeIntersectionObserver = globalThis.IntersectionObserver;
  (globalThis as typeof globalThis & { IntersectionObserver: unknown }).IntersectionObserver =
    FakeIntersectionObserver as unknown as typeof IntersectionObserver;
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  if (nativeIntersectionObserver !== undefined) {
    (globalThis as typeof globalThis & { IntersectionObserver: unknown }).IntersectionObserver =
      nativeIntersectionObserver;
  }
});

/**
 * La cible est MONTÉE CONDITIONNELLEMENT — c'est le chemin d'échec réel de la
 * liste (cache vide + erreur ⇒ `ConversationRail` ne peint plus rien ⇒ le
 * grand rail quitte le DOM, puis y revient à la reprise). Un hôte qui garde
 * sa cible pour toujours ne peut PAS distinguer une réf de rappel d'un
 * `RefObject` : les deux passent. Voir le doc-comment de `useOutOfView`.
 */
let setTargetPresent: (present: boolean) => void = () => {};

function Host({ revealRatio = 0, releaseRatio = 0.25 }: { readonly revealRatio?: number; readonly releaseRatio?: number }) {
  const scrollport = useRef<HTMLDivElement | null>(null);
  const [present, setPresent] = useState(true);
  setTargetPresent = setPresent;
  const { pinned, observe } = useOutOfView({ root: scrollport, revealRatio, releaseRatio });
  return (
    <div ref={scrollport} data-testid="root">
      {present ? <div ref={observe} data-testid="target" /> : null}
      <span data-testid="pinned">{String(pinned)}</span>
    </div>
  );
}

function mount(props: { readonly revealRatio?: number; readonly releaseRatio?: number } = {}): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  act(() => {
    r.render(<Host {...props} />);
  });
  return c;
}

function fireEntry(intersectionRatio: number): void {
  const cb = recorded?.callback;
  const target = recorded?.observed[0];
  if (cb === undefined || target === undefined) throw new Error('IntersectionObserver non armé');
  act(() => {
    cb([{ intersectionRatio, target } as unknown as IntersectionObserverEntry], recorded as unknown as IntersectionObserver);
  });
}

describe('useOutOfView — un IntersectionObserver, la loi, rien d’autre', () => {
  test('observe la CIBLE avec la RACINE et les seuils reçus', () => {
    const el = mount({ revealRatio: 0, releaseRatio: 0.25 });
    expect(recorded).not.toBeNull();
    expect(recorded?.observed).toEqual([el.querySelector('[data-testid="target"]')]);
    expect(recorded?.options?.root).toBe(el.querySelector('[data-testid="root"]'));
    expect(recorded?.options?.threshold).toEqual([0, 0.25]);
  });

  test('une entrée à 0 % de visibilité épingle la bande', () => {
    const el = mount();
    fireEntry(0);
    expect(el.querySelector('[data-testid="pinned"]')?.textContent).toBe('true');
  });

  test('puis une entrée à 30 % la relâche', () => {
    const el = mount();
    fireEntry(0);
    fireEntry(0.3);
    expect(el.querySelector('[data-testid="pinned"]')?.textContent).toBe('false');
  });

  test('le démontage déconnecte l’observateur', () => {
    mount();
    expect(recorded?.disconnected).toBe(false);
    act(() => {
      root.unmount();
    });
    expect(recorded?.disconnected).toBe(true);
  });

  /**
   * LE DÉFAUT DU `RefObject` (revue #6103). Le premier témoin est celui qui
   * l'attrape : MESURÉ sur la forme livrée, `pinned` restait `true` après la
   * disparition de la cible — titre effacé au-dessus d'une bande qui ne peint
   * rien. Falsifié sur la forme corrigée : retirer le `setPinned(false)` de
   * la branche « aucune cible » le fait rougir seul.
   *
   * Le second garde le RETOUR de la cible. Il passait déjà sur la forme
   * livrée — par l'ordre des commits, non par la règle (voir le doc-comment
   * du module) : il est ici pour que ce rattrapage cesse d'être un accident.
   * Falsifié en retirant `target` des dépendances de l'effet.
   */
  test('la cible qui DISPARAÎT relâche la bande — jamais un titre effacé au-dessus de rien', () => {
    const el = mount();
    fireEntry(0);
    expect(el.querySelector('[data-testid="pinned"]')?.textContent).toBe('true');
    act(() => {
      setTargetPresent(false);
    });
    expect(el.querySelector('[data-testid="pinned"]')?.textContent).toBe('false');
  });

  test('la cible qui REVIENT est ré-observée — la bande n’est pas perdue pour la session', () => {
    const el = mount();
    fireEntry(0);
    act(() => {
      setTargetPresent(false);
    });
    recorded = null;
    act(() => {
      setTargetPresent(true);
    });
    // Relu par un accesseur : l'affectation `null` ci-dessus rétrécirait
    // sinon le type de `recorded` à `never` pour le reste du bloc.
    const reobserved = lastObserver();
    expect(reobserved).not.toBeNull();
    expect(reobserved?.observed).toEqual([el.querySelector('[data-testid="target"]')]);
    fireEntry(0);
    expect(el.querySelector('[data-testid="pinned"]')?.textContent).toBe('true');
  });

  test('AUCUN écouteur `scroll` posé sur la CIBLE ou la RACINE — l’observation ne lit jamais le défilement à la main', () => {
    // React lui-même pose un écouteur `scroll` DÉLÉGUÉ sur le conteneur
    // racine au montage (délégation d'événements, indépendante de ce hook) —
    // ce n'est PAS ce que ce témoin vérifie. Ce qui compte : ni la cible
    // observée ni le scrollport que `useOutOfView` reçoit ne portent leur
    // PROPRE écouteur `scroll`, contrairement à `useScene` (`lens/scene.ts`),
    // qui en pose un directement pour une raison différente (une VALEUR
    // continue, pas un seuil binaire — voir le doc-comment du module).
    const scrollCallsOnObservedNodes: string[] = [];
    const original = Element.prototype.addEventListener;
    Element.prototype.addEventListener = function patched(this: Element, type: string, ...rest: unknown[]) {
      const testid = (this as unknown as HTMLElement).dataset?.testid;
      if (type === 'scroll' && (testid === 'target' || testid === 'root')) {
        scrollCallsOnObservedNodes.push(type);
      }
      return (original as (...a: unknown[]) => void).call(this, type, ...rest);
    } as typeof Element.prototype.addEventListener;
    try {
      mount();
      fireEntry(0);
    } finally {
      Element.prototype.addEventListener = original;
    }
    expect(scrollCallsOnObservedNodes).toEqual([]);
  });
});

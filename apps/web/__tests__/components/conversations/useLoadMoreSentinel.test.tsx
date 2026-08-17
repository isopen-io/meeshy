/**
 * `useLoadMoreSentinel` — REV-4/B2.
 *
 * Le mécanisme de pagination de la liste (IntersectionObserver) vivait inline
 * dans `ConversationList.tsx`, cloué à un `<div>` rendu par `renderContent` —
 * donc perdu dès que le drapeau Lentille remplaçait `renderContent`. Ces
 * témoins verrouillent l'EXTRACTION : mêmes déclenchements qu'avant, plus la
 * seule propriété que l'ancienne version n'avait pas et dont le chemin
 * Lentille a besoin — supporter une cible qui apparaît APRÈS le premier
 * effet (le point de montage Lentille est chargé en `next/dynamic`).
 *
 * behaviour-matrix:L17 — « la pagination (sentinelle + count−5) … reste
 * inchangée ». Ce fichier prouve la MÉCANIQUE ; sa présence sur les DEUX
 * chemins de rendu est prouvée par `LentilleConversationListMount.test.tsx`
 * et `ConversationList.lentille-mux.test.tsx`.
 */
import React, { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useLoadMoreSentinel } from '../../../components/conversations/hooks/useLoadMoreSentinel';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

interface FakeObserverRecord {
  readonly callback: ObserverCallback;
  readonly options: unknown;
  readonly observed: Element[];
  readonly unobserved: Element[];
}

let observers: FakeObserverRecord[] = [];

class FakeIntersectionObserver {
  constructor(callback: ObserverCallback, options: unknown) {
    this.record = { callback, options, observed: [], unobserved: [] };
    observers.push(this.record);
  }
  private record: FakeObserverRecord;
  observe(element: Element) {
    this.record.observed.push(element);
  }
  unobserve(element: Element) {
    this.record.unobserved.push(element);
  }
  disconnect() {}
}

function Harness({
  hasMore,
  isLoadingMore,
  onLoadMore,
  renderSentinel = true,
}: {
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore?: () => void;
  renderSentinel?: boolean;
}) {
  const sentinelRef = useLoadMoreSentinel({ hasMore, isLoadingMore, onLoadMore });
  return renderSentinel ? <div ref={sentinelRef} data-testid="sentinel" /> : null;
}

/** Le cas Lentille : la sous-arborescence qui porte la sentinelle n'existe pas au premier rendu. */
function LateSentinelHarness({ onLoadMore }: { onLoadMore: () => void }) {
  const [mounted, setMounted] = useState(false);
  const sentinelRef = useLoadMoreSentinel({ hasMore: true, isLoadingMore: false, onLoadMore });
  return (
    <div>
      <button type="button" onClick={() => setMounted(true)}>
        monter
      </button>
      {mounted && <div ref={sentinelRef} data-testid="sentinel" />}
    </div>
  );
}

describe('useLoadMoreSentinel — la sentinelle de pagination, extraite et partagée (B2)', () => {
  let originalObserver: unknown;

  beforeEach(() => {
    observers = [];
    originalObserver = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
      FakeIntersectionObserver as unknown;
  });

  afterEach(() => {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = originalObserver;
  });

  it('observe la cible et appelle onLoadMore quand elle entre dans le viewport', () => {
    const onLoadMore = jest.fn();
    render(<Harness hasMore isLoadingMore={false} onLoadMore={onLoadMore} />);

    expect(observers).toHaveLength(1);
    expect(observers[0].observed).toEqual([screen.getByTestId('sentinel')]);

    act(() => observers[0].callback([{ isIntersecting: true }]));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("n'appelle pas onLoadMore quand la cible n'est pas visible", () => {
    const onLoadMore = jest.fn();
    render(<Harness hasMore isLoadingMore={false} onLoadMore={onLoadMore} />);
    act(() => observers[0].callback([{ isIntersecting: false }]));
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('conserve les cotes historiques (threshold 0.1, rootMargin 50px) — extraction, pas réécriture', () => {
    render(<Harness hasMore isLoadingMore={false} onLoadMore={jest.fn()} />);
    expect(observers[0].options).toEqual({ threshold: 0.1, rootMargin: '50px' });
  });

  it("n'arme aucun observateur sans onLoadMore, sans hasMore, ou pendant un chargement en cours", () => {
    const { unmount: u1 } = render(<Harness hasMore isLoadingMore={false} />);
    expect(observers).toHaveLength(0);
    u1();

    const { unmount: u2 } = render(<Harness hasMore={false} isLoadingMore={false} onLoadMore={jest.fn()} />);
    expect(observers).toHaveLength(0);
    u2();

    render(<Harness hasMore isLoadingMore onLoadMore={jest.fn()} />);
    expect(observers).toHaveLength(0);
  });

  it("n'arme rien quand aucune cible n'est rendue (pas d'observateur orphelin)", () => {
    render(<Harness hasMore isLoadingMore={false} onLoadMore={jest.fn()} renderSentinel={false} />);
    expect(observers).toHaveLength(0);
  });

  /**
   * LE défaut de l'ancienne version, et la raison pour laquelle B2 ne peut
   * pas se contenter de re-rendre le `<div>` sentinelle dans la peau : avec
   * un `useRef` lu dans un effet dont les dépendances ignorent le nœud, une
   * cible montée plus tard (point de montage `next/dynamic`) n'est JAMAIS
   * observée — et rien ne le signale.
   */
  it('observe une cible apparue APRÈS le premier effet (montage différé — leçon B1)', () => {
    const onLoadMore = jest.fn();
    render(<LateSentinelHarness onLoadMore={onLoadMore} />);

    expect(observers).toHaveLength(0);

    act(() => {
      screen.getByText('monter').click();
    });

    expect(observers).toHaveLength(1);
    expect(observers[0].observed).toEqual([screen.getByTestId('sentinel')]);

    act(() => observers[0].callback([{ isIntersecting: true }]));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('cesse d\'observer la cible quand elle disparaît', () => {
    const onLoadMore = jest.fn();
    const { rerender } = render(<Harness hasMore isLoadingMore={false} onLoadMore={onLoadMore} />);
    const sentinel = screen.getByTestId('sentinel');
    expect(observers[0].observed).toEqual([sentinel]);

    rerender(<Harness hasMore isLoadingMore={false} onLoadMore={onLoadMore} renderSentinel={false} />);
    expect(observers[0].unobserved).toEqual([sentinel]);
  });
});

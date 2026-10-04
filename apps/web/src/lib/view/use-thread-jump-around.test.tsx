import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { message } from '@/lib/api/fixtures-base';
import type { PlacedMessage } from '@/lib/grouping';

import { useThreadJump, type ThreadJump } from './use-thread-jump';

/**
 * #8320, #7420 — LE SAUT VERS UN MESSAGE QUI N'EST PAS CHARGÉ.
 *
 * #8320 l'atteignait en chargeant les pages plus anciennes UNE À UNE : N
 * allers-retours séquentiels pour un message N pages plus haut, plafonnés à
 * vingt pages (mille messages) — au-delà, le saut ne faisait rien. #7420 le
 * remplace par la fenêtre `?around=` : UNE demande, quelle que soit la
 * distance, puis le saut et la mise en évidence dès que la rangée est là ; un
 * message que la fenêtre ne porte pas (supprimé, sous le plancher
 * d'historique) arrête la recherche au lieu d'attendre sans fin.
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

const placedOf = (ids: readonly string[]): readonly PlacedMessage[] =>
  ids.map((id) => ({
    message: message({ id, senderId: 'u-2', content: id, originalLanguage: 'fr', translations: [], createdAt: new Date('2026-09-24T10:00:00.000Z') }),
    head: true,
    tail: true,
    opensDay: null,
  }));

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

type Frame = { readonly placed: readonly PlacedMessage[]; readonly target: string | null; readonly settled: boolean };

function mount(initial: Frame) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const scrolls: number[] = [];
  const seeks: string[] = [];
  const virtualizer = { scrollToIndex: (index: number) => scrolls.push(index) };
  const noteProgrammaticScroll = () => {};
  const seek = (messageId: string) => {
    seeks.push(messageId);
  };
  let captured!: ThreadJump;

  function Harness(props: Frame) {
    captured = useThreadJump({
      placed: props.placed,
      virtualizer,
      noteProgrammaticScroll,
      mode: 'focal',
      around: { target: props.target, settled: props.settled, seek },
    });
    return null;
  }

  act(() => {
    root.render(<Harness {...initial} />);
  });

  return {
    state: () => captured,
    rerender: (frame: Frame) => {
      act(() => {
        root.render(<Harness {...frame} />);
      });
    },
    scrolls,
    seeks,
  };
}

describe('useThreadJump — le message HORS de la fenêtre chargée (#8320, #7420)', () => {
  test('UNE demande de fenêtre autour du message, puis le saut et la mise en évidence dès qu’il est là', () => {
    const h = mount({ placed: placedOf(['m150', 'm151']), target: null, settled: false });
    act(() => {
      h.state().jumpToMessage('m12');
    });
    expect(h.seeks).toEqual(['m12']);
    expect(h.scrolls).toEqual([]);

    h.rerender({ placed: placedOf(['m150', 'm151']), target: 'm12', settled: false });
    expect(h.scrolls).toEqual([]);

    h.rerender({ placed: placedOf(['m11', 'm12', 'm13']), target: 'm12', settled: true });
    expect(h.scrolls).toEqual([1]);
    expect(h.state().highlightedId).toBe('m12');
    expect(h.seeks).toEqual(['m12']);
  });

  test('une fenêtre servie SANS le message arrête la recherche : ni saut, ni seconde demande', () => {
    const h = mount({ placed: placedOf(['m5']), target: null, settled: false });
    act(() => {
      h.state().jumpToMessage('ghost');
    });
    h.rerender({ placed: placedOf(['m4', 'm5']), target: 'ghost', settled: true });
    h.rerender({ placed: placedOf(['m3', 'm4', 'm5']), target: 'ghost', settled: true });
    expect(h.seeks).toEqual(['ghost']);
    expect(h.scrolls).toEqual([]);
    expect(h.state().highlightedId).toBeNull();
  });

  test('une fenêtre ancrée sur un AUTRE message ne clôt pas la recherche en cours', () => {
    const h = mount({ placed: placedOf(['m5']), target: 'm1', settled: true });
    act(() => {
      h.state().jumpToMessage('m2');
    });
    h.rerender({ placed: placedOf(['m5']), target: 'm1', settled: true });
    h.rerender({ placed: placedOf(['m1', 'm2', 'm3']), target: 'm2', settled: true });
    expect(h.scrolls).toEqual([1]);
    expect(h.state().highlightedId).toBe('m2');
  });

  test('un message déjà chargé saute tout de suite, sans rien demander', () => {
    const h = mount({ placed: placedOf(['m1', 'm2']), target: null, settled: false });
    act(() => {
      h.state().jumpToMessage('m2');
    });
    expect(h.scrolls).toEqual([1]);
    expect(h.seeks).toEqual([]);
  });
});

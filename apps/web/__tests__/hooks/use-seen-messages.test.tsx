/**
 * Détection des messages RÉELLEMENT affichés dans une conversation.
 *
 * La liste est virtualisée : les bulles sont montées et démontées au
 * défilement. Un `querySelectorAll` unique au montage n'observerait donc que
 * celles présentes à cet instant — d'où un `MutationObserver` qui suit les
 * nœuds entrants et sortants.
 *
 * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
 */

import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';

const mockMarkAsRead = jest.fn();
jest.mock('@/services/conversations/messages.service', () => ({
  messagesService: {
    markAsRead: (...args: unknown[]) => mockMarkAsRead(...args),
  },
}));

import { useSeenMessages } from '@/hooks/use-seen-messages';

const A = '507f1f77bcf86cd799439011';
const B = '507f1f77bcf86cd799439012';

// --- doublures pilotables des deux observers (absents de jsdom) ---

type IOCallback = (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;

let intersectionCallback: IOCallback | null = null;
let observedTargets: Set<Element>;
let mutationCallback: ((records: Array<Partial<MutationRecord>>) => void) | null = null;

class FakeIntersectionObserver {
  constructor(cb: IOCallback) { intersectionCallback = cb; }
  observe(el: Element) { observedTargets.add(el); }
  unobserve(el: Element) { observedTargets.delete(el); }
  disconnect() { observedTargets.clear(); intersectionCallback = null; }
  takeRecords() { return []; }
}

class FakeMutationObserver {
  constructor(cb: (records: Array<Partial<MutationRecord>>) => void) { mutationCallback = cb; }
  observe() { /* piloté à la main via mutationCallback */ }
  disconnect() { mutationCallback = null; }
  takeRecords() { return []; }
}

function makeBubble(messageId: string): HTMLElement {
  const el = document.createElement('div');
  el.id = `message-${messageId}`;
  el.className = 'bubble-message';
  return el;
}

/**
 * Forme RÉELLE insérée par la liste : `messages-display.tsx` enveloppe chaque
 * `BubbleMessage` dans un `<div key={message.id}>` (branche virtualisée comme
 * branche simple), et c'est CE wrapper — sans `id` — que React insère. La bulle
 * porteuse de `id="message-…"` n'est qu'un descendant.
 */
function makeRow(...messageIds: string[]): { row: HTMLElement; bubbles: HTMLElement[] } {
  const row = document.createElement('div');
  const bubbles = messageIds.map((id) => {
    const bubble = makeBubble(id);
    row.appendChild(bubble);
    return bubble;
  });
  return { row, bubbles };
}

function setup(
  container: HTMLElement,
  conversationId: string | null = 'conv-1',
  resolveLanguage?: (messageId: string) => string | null
) {
  const ref = createRef<HTMLDivElement>();
  (ref as { current: HTMLElement | null }).current = container;
  return renderHook(
    ({ id }: { id: string | null }) =>
      useSeenMessages({
        containerRef: ref,
        conversationId: id,
        dwellMs: 300,
        idleMs: 1000,
        resolveLanguage,
      }),
    { initialProps: { id: conversationId } }
  );
}

describe('useSeenMessages', () => {
  let container: HTMLElement;

  beforeEach(() => {
    jest.useFakeTimers();
    mockMarkAsRead.mockReset().mockResolvedValue(undefined);
    observedTargets = new Set();
    intersectionCallback = null;
    mutationCallback = null;
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIntersectionObserver;
    (globalThis as unknown as { MutationObserver: unknown }).MutationObserver = FakeMutationObserver;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    jest.useRealTimers();
    container.remove();
  });

  it('observes the bubbles already present when the hook mounts', () => {
    container.appendChild(makeBubble(A));
    setup(container);

    expect(observedTargets.size).toBe(1);
  });

  it('observes a bubble mounted later by the virtualizer', () => {
    setup(container);
    const late = makeBubble(B);
    container.appendChild(late);

    act(() => {
      mutationCallback?.([{ addedNodes: [late] as unknown as NodeList, removedNodes: [] as unknown as NodeList }]);
    });

    expect(observedTargets.has(late)).toBe(true);
  });

  it('stops observing a bubble the virtualizer unmounted', () => {
    const bubble = makeBubble(A);
    container.appendChild(bubble);
    setup(container);

    act(() => {
      mutationCallback?.([{ addedNodes: [] as unknown as NodeList, removedNodes: [bubble] as unknown as NodeList }]);
    });

    expect(observedTargets.has(bubble)).toBe(false);
  });

  it('observes a bubble the virtualizer mounted inside its row wrapper', () => {
    // Le nœud inséré est le wrapper, pas la bulle : ne regarder que le nœud
    // lui-même laisse chaque message arrivé APRÈS le montage sans observer —
    // donc jamais rapporté comme lu.
    setup(container);
    const { row, bubbles } = makeRow(B);
    container.appendChild(row);

    act(() => {
      mutationCallback?.([{ addedNodes: [row] as unknown as NodeList, removedNodes: [] as unknown as NodeList }]);
    });

    expect(observedTargets.has(bubbles[0])).toBe(true);
  });

  it('observes every bubble of an inserted subtree', () => {
    setup(container);
    const { row, bubbles } = makeRow(A, B);
    container.appendChild(row);

    act(() => {
      mutationCallback?.([{ addedNodes: [row] as unknown as NodeList, removedNodes: [] as unknown as NodeList }]);
    });

    expect(bubbles.every(bubble => observedTargets.has(bubble))).toBe(true);
  });

  it('stops observing a bubble whose row wrapper the virtualizer unmounted', () => {
    const { row, bubbles } = makeRow(A);
    container.appendChild(row);
    setup(container);

    act(() => {
      mutationCallback?.([{ addedNodes: [] as unknown as NodeList, removedNodes: [row] as unknown as NodeList }]);
    });

    expect(observedTargets.has(bubbles[0])).toBe(false);
  });

  it('does not report a message whose row wrapper left the DOM before the dwell threshold', () => {
    // Sortir du DOM vaut disparition. Sans la descente dans le sous-arbre
    // retiré, la bulle reste « visible » pour l'accumulateur et finit déclarée
    // lue alors qu'elle a quitté l'écran — exactement ce que ce hook existe
    // pour empêcher.
    const { row, bubbles } = makeRow(A);
    container.appendChild(row);
    const { unmount } = setup(container);

    act(() => { intersectionCallback?.([{ target: bubbles[0], isIntersecting: true }]); });
    act(() => { jest.advanceTimersByTime(100); });
    act(() => {
      row.remove();
      mutationCallback?.([{ addedNodes: [] as unknown as NodeList, removedNodes: [row] as unknown as NodeList }]);
    });
    act(() => { jest.advanceTimersByTime(5000); });

    expect(mockMarkAsRead).not.toHaveBeenCalled();
    unmount();
  });

  it('joint la version linguistique réellement affichée à chaque message vu', () => {
    // Sans elle, « qui a lu » ne dit pas « dans quelle langue » — la moitié de
    // l'information manque à l'auteur.
    const bubble = makeBubble(A);
    container.appendChild(bubble);
    const { unmount } = setup(container, 'conv-1', () => 'fr');

    act(() => { intersectionCallback?.([{ target: bubble, isIntersecting: true }]); });
    act(() => { jest.advanceTimersByTime(1500); });
    act(() => { unmount(); });

    expect(mockMarkAsRead).toHaveBeenCalledWith('conv-1', [A], new Map([[A, 'fr']]));
  });

  it('n\'invente pas de langue quand la résolution échoue', () => {
    const bubble = makeBubble(A);
    container.appendChild(bubble);
    const { unmount } = setup(container, 'conv-1', () => null);

    act(() => { intersectionCallback?.([{ target: bubble, isIntersecting: true }]); });
    act(() => { jest.advanceTimersByTime(1500); });
    act(() => { unmount(); });

    expect(mockMarkAsRead).toHaveBeenCalledWith('conv-1', [A], new Map([[A, null]]));
  });

  it('reports a message that stayed visible past the dwell threshold', () => {
    const bubble = makeBubble(A);
    container.appendChild(bubble);
    const { unmount } = setup(container);

    act(() => { intersectionCallback?.([{ target: bubble, isIntersecting: true }]); });
    act(() => { jest.advanceTimersByTime(1500); });

    expect(mockMarkAsRead).toHaveBeenCalledWith('conv-1', [A], undefined);
    unmount();
  });

  it('does not report a message that flashed by below the threshold', () => {
    const bubble = makeBubble(A);
    container.appendChild(bubble);
    const { unmount } = setup(container);

    act(() => { intersectionCallback?.([{ target: bubble, isIntersecting: true }]); });
    act(() => { jest.advanceTimersByTime(100); });
    act(() => { intersectionCallback?.([{ target: bubble, isIntersecting: false }]); });
    act(() => { jest.advanceTimersByTime(5000); });

    expect(mockMarkAsRead).not.toHaveBeenCalled();
    unmount();
  });

  it('flushes what was acquired when the conversation closes', () => {
    const bubble = makeBubble(A);
    container.appendChild(bubble);
    const { unmount } = setup(container);

    act(() => { intersectionCallback?.([{ target: bubble, isIntersecting: true }]); });
    // Seuil franchi (300 ms) mais inactivité pas atteinte (1000 ms) : rien
    // n'est encore parti, la lecture n'existe que dans l'accumulateur.
    act(() => { jest.advanceTimersByTime(400); });
    expect(mockMarkAsRead).not.toHaveBeenCalled();

    // Fermer la conversation ne doit pas perdre cette lecture.
    act(() => { unmount(); });

    expect(mockMarkAsRead).toHaveBeenCalledWith('conv-1', [A], undefined);
  });

  it('never reports the same message twice', () => {
    const bubble = makeBubble(A);
    container.appendChild(bubble);
    const { unmount } = setup(container);

    act(() => { intersectionCallback?.([{ target: bubble, isIntersecting: true }]); });
    act(() => { jest.advanceTimersByTime(1500); });
    act(() => { jest.advanceTimersByTime(5000); });

    const reported = mockMarkAsRead.mock.calls.flatMap(c => c[1] as string[]);
    expect(reported.filter(id => id === A)).toHaveLength(1);
    unmount();
  });

  it('does nothing without a conversation', () => {
    container.appendChild(makeBubble(A));
    setup(container, null);

    expect(observedTargets.size).toBe(0);
  });

  it('ignores nodes that are not message bubbles', () => {
    const stranger = document.createElement('div');
    stranger.id = 'not-a-message';
    container.appendChild(stranger);
    setup(container);

    expect(observedTargets.size).toBe(0);
  });
});

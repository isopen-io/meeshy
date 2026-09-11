import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRef } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import type { Virtualizer } from '@tanstack/react-virtual';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { useThreadChromeSignals, type ThreadChromeSignals } from './use-thread-chrome-signals';
import type { Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';

/**
 * TÉMOIN DE COMPOSITION (#5774, travail 3/3) — les PRIMITIVES que ce hook
 * compose sont déjà testées séparément (`use-thread-chrome.test.tsx`,
 * `thread-chrome.test.ts`, `unread-below.test.ts`) : ce fichier ne prouve
 * que le CÂBLAGE — l'ordre et les valeurs qui traversent d'une primitive à
 * l'autre — patron `use-audio-playback.test.tsx`.
 *
 * `clientHeight`/`scrollTop` sont des propriétés RÉELLES du DOM que
 * happy-dom ne calcule pas depuis un layout : on les pose via
 * `Object.defineProperty` sur le nœud RÉEL une fois monté, puis on
 * DÉCLENCHE l'effet qui les lit (`dispatchEvent('scroll')`) — jamais une
 * valeur mockée à la place du nœud.
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

const messageOf = (id: string, senderId: string, content = 'contenu'): Message =>
  ({ id, senderId, content, originalLanguage: 'fr', translations: [] }) as unknown as Message;

function fakeVirtualizer(params: {
  readonly totalSize: number;
  readonly items: readonly { readonly index: number; readonly start: number; readonly end: number }[];
  readonly scrollToIndex: (index: number, options?: unknown) => void;
}): Virtualizer<HTMLElement, Element> {
  return {
    getTotalSize: () => params.totalSize,
    getVirtualItems: () => params.items.map((i) => ({ ...i, size: i.end - i.start, key: i.index, lane: 0 })),
    scrollToIndex: params.scrollToIndex,
  } as unknown as Virtualizer<HTMLElement, Element>;
}

function mount(params: {
  readonly placed: readonly PlacedMessage[];
  readonly messages: readonly Message[];
  readonly viewerId: string;
  readonly group: boolean;
  readonly items: readonly { readonly index: number; readonly start: number; readonly end: number }[];
  readonly totalSize: number;
  readonly scrollToIndex?: (index: number, options?: unknown) => void;
  readonly noteProgrammaticScroll?: () => void;
  readonly mode?: ConversationReadingMode;
}): { scroller: HTMLElement; setGeometry: (g: { scrollTop: number; clientHeight: number }) => void; signals: () => ThreadChromeSignals } {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  let captured!: ThreadChromeSignals;

  function Harness() {
    const scroller = useRef<HTMLElement | null>(null);
    const signals = useThreadChromeSignals({
      scroller,
      mode: params.mode ?? 'focal',
      placed: params.placed,
      virtualizer: fakeVirtualizer({
        totalSize: params.totalSize,
        items: params.items,
        scrollToIndex: params.scrollToIndex ?? (() => {}),
      }),
      messages: params.messages,
      viewerId: params.viewerId,
      group: params.group,
      readerLanguages: ['fr'],
      noteProgrammaticScroll: params.noteProgrammaticScroll ?? (() => {}),
    });
    captured = signals;
    return (
      <div ref={signals.host}>
        <main ref={scroller as React.RefObject<HTMLElement>} data-testid="scroller" />
      </div>
    );
  }

  act(() => {
    root.render(<Harness />);
  });

  const scroller = container.querySelector('[data-testid="scroller"]') as HTMLElement;
  const setGeometry = (g: { scrollTop: number; clientHeight: number }) => {
    Object.defineProperty(scroller, 'scrollTop', { value: g.scrollTop, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: g.clientHeight, configurable: true });
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });
  };

  return { scroller, setGeometry, signals: () => captured };
}

describe('useThreadChromeSignals — composition (#5774, travail 3/3)', () => {
  test('dayPillLabel vient de stickyDayOf : ouvreur trouvé en remontant depuis la tête visible', () => {
    const placed: readonly PlacedMessage[] = [
      { message: messageOf('m1', 'other'), head: true, tail: false, opensDay: 'Aujourd’hui' },
      { message: messageOf('m2', 'other'), head: false, tail: true, opensDay: null },
    ];
    const { setGeometry, signals } = mount({
      placed,
      messages: placed.map((p) => p.message),
      viewerId: 'v1',
      group: false,
      items: [
        { index: 0, start: 3900, end: 3988 },
        { index: 1, start: 3988, end: 4076 },
      ],
      totalSize: 5000,
    });
    // `dayPillLabel` se recalcule au RENDU que déclenche `nearBottom` en
    // changeant de verdict (distance 200, la borne exacte -> `false`) : le
    // même mécanisme que l'écran réel (« recalculée à chaque rendu
    // déclenché par le virtualiseur »). scrollOffset 4000 : la tête visible
    // est l'item 1 (3988 <= 4000 < 4076), qui n'ouvre pas de jour -> le
    // libellé est celui de l'OUVREUR (item 0).
    setGeometry({ scrollTop: 4000, clientHeight: 800 });
    expect(signals().dayPillLabel).toBe('Aujourd’hui');
  });

  test('geste sous le seuil de 200 px du bas -> bouton visible ; au-delà -> masqué', () => {
    const placed: readonly PlacedMessage[] = [{ message: messageOf('m1', 'v1'), head: true, tail: true, opensDay: 'Aujourd’hui' }];
    const { setGeometry, signals } = mount({
      placed,
      messages: placed.map((p) => p.message),
      viewerId: 'v1',
      group: false,
      items: [{ index: 0, start: 0, end: 88 }],
      totalSize: 5000,
    });

    // distance = 5000 - 4000 - 800 = 200 -> PAS pres du bas (borne exclue).
    setGeometry({ scrollTop: 4000, clientHeight: 800 });
    expect(signals().scrollButtonVisible).toBe(true);

    // distance = 5000 - 4200 - 800 = 0 -> pres du bas.
    setGeometry({ scrollTop: 4200, clientHeight: 800 });
    expect(signals().scrollButtonVisible).toBe(false);
  });

  /**
   * RÉGRESSION revue #5774, défaut majeur 6 — le Résumé Vivant N'A PAS de
   * liste qui défile (`chromeHiding` l'exclut déjà) : `nearBottom` y reste
   * figé à sa DERNIÈRE valeur connue (`scrollButtonVisible: !nearBottom`
   * seul ne le sait pas), et le bouton restait monté, chevauchant le CTA
   * « Reprendre le fil » — mesuré : `elementFromPoint` au-dessus du CTA
   * rendait le bouton, pas le CTA (`.thread-scroll-to-bottom`).
   */
  test('mode summary -> scrollButtonVisible toujours FAUX, quel que soit nearBottom', () => {
    const placed: readonly PlacedMessage[] = [{ message: messageOf('m1', 'v1'), head: true, tail: true, opensDay: 'Aujourd’hui' }];
    const { setGeometry, signals } = mount({
      placed,
      messages: placed.map((p) => p.message),
      viewerId: 'v1',
      group: false,
      items: [{ index: 0, start: 0, end: 88 }],
      totalSize: 5000,
      mode: 'summary',
    });

    // distance = 5000 - 4000 - 800 = 200 -> loin du bas, mais mode summary.
    setGeometry({ scrollTop: 4000, clientHeight: 800 });
    expect(signals().scrollButtonVisible).toBe(false);
  });

  /**
   * REVUE #5774 : ce témoin épinglait `virtualizer.scrollToIndex(dernier,
   * { align: 'end' })` — la fin du dernier ITEM, qui laisse le
   * `padding-bottom` de `main` sous la fenêtre. Le geste demandé est le bas
   * du DÉFILEUR, et c'est la MÊME loi que l'ouverture du fil
   * (`lib/view/pin-to-bottom.ts`).
   */
  test('onScrollToBottom annonce le défilement PROGRAMMÉ et pose le fil au bas EXACT du défileur', async () => {
    let noted = 0;
    const placed: readonly PlacedMessage[] = [
      { message: messageOf('m1', 'other'), head: true, tail: false, opensDay: 'Aujourd’hui' },
      { message: messageOf('m2', 'other'), head: false, tail: true, opensDay: null },
    ];
    const { signals } = mount({
      placed,
      messages: placed.map((p) => p.message),
      viewerId: 'v1',
      group: false,
      items: [
        { index: 0, start: 0, end: 88 },
        { index: 1, start: 88, end: 176 },
      ],
      totalSize: 176,
      scrollToIndex: () => {
        throw new Error('scrollToIndex ne doit plus porter le retour en bas (jumelle retirée)');
      },
      noteProgrammaticScroll: () => {
        noted += 1;
      },
    });

    const scroller = container.querySelector('[data-testid="scroller"]') as HTMLElement;
    let top = 0;
    Object.defineProperty(scroller, 'scrollHeight', { value: 4321, configurable: true });
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        top = value;
      },
    });

    act(() => {
      signals().onScrollToBottom();
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    expect(top).toBe(4321);
    expect(noted).toBe(1);
  });

  test('scrollButtonSenderName : jamais renseigné hors GROUPE (DM)', () => {
    const placed: readonly PlacedMessage[] = [{ message: messageOf('m1', 'other'), head: true, tail: true, opensDay: 'Aujourd’hui' }];
    const { signals } = mount({
      placed,
      messages: placed.map((p) => p.message),
      viewerId: 'v1',
      group: false,
      items: [{ index: 0, start: 0, end: 88 }],
      totalSize: 88,
    });
    expect(signals().scrollButtonSenderName).toBeNull();
  });
});

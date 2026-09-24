import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { SCROLL_ACTIVITY_LINGER_MS } from '@meeshy/shared/utils/scroll-activity';

import * as sceneActivity from '@/lib/scene/activity';
import type { SceneActivityState, SceneEvent } from '@/lib/scene/activity';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  createDayPillRevealSubscriber,
  dayPillRevealed,
  useDayPillReveal,
  type DayPillRevealListener,
} from './day-pill-reveal';

/**
 * #6101 — LA PILULE DE JOUR NE RECOUVRE RIEN AU REPOS.
 *
 * Elle se RÉVÈLE pendant que l'utilisateur fait défiler le fil (le geste où
 * elle sert à se repérer) et s'efface `SCROLL_ACTIVITY_LINGER_MS` après son
 * dernier défilement — la loi de la pilule jour·heure d'iOS
 * (`ScrollTimePillState`, `lingerMs = 900`). Un défilement du CODE (ancrage à
 * l'ouverture, « revenir en bas ») ne la révèle jamais.
 */

const replay = (events: readonly SceneEvent[]): SceneActivityState =>
  events.reduce((state, event) => sceneActivity.reduce(state, event, { mode: 'bubbles' }), sceneActivity.initialState());

describe('dayPillRevealed — la loi (#6101)', () => {
  test('un fil qui vient de s’ouvrir est AU REPOS : la pilule est effacée', () => {
    expect(dayPillRevealed(sceneActivity.initialState(), 0)).toBe(false);
  });

  test('un défilement du CODE (sans intention) ne la révèle pas', () => {
    const state = replay([{ type: 'scrolled', at: 10, y: 400 }]);
    expect(dayPillRevealed(state, 20)).toBe(false);
  });

  test('molette puis défilement : révélée pendant la fenêtre, effacée à son terme exact', () => {
    const state = replay([
      { type: 'intent', at: 100, origin: 'indirect' },
      { type: 'scrolled', at: 120, y: 300 },
    ]);
    expect(dayPillRevealed(state, 120 + SCROLL_ACTIVITY_LINGER_MS - 1)).toBe(true);
    expect(dayPillRevealed(state, 120 + SCROLL_ACTIVITY_LINGER_MS)).toBe(false);
  });

  test('doigt posé qui TIRE la liste : révélée tant que le doigt tient, même immobile au-delà de la fenêtre', () => {
    const state = replay([
      { type: 'grab', at: 0 },
      { type: 'scrolled', at: 10, y: 200 },
    ]);
    expect(dayPillRevealed(state, 10 + SCROLL_ACTIVITY_LINGER_MS * 5)).toBe(true);
  });

  test('doigt levé : la fenêtre part du DERNIER défilement, pas de la levée', () => {
    const state = replay([
      { type: 'grab', at: 0 },
      { type: 'scrolled', at: 10, y: 200 },
      { type: 'release', at: 400 },
    ]);
    expect(dayPillRevealed(state, 500)).toBe(true);
    expect(dayPillRevealed(state, 10 + SCROLL_ACTIVITY_LINGER_MS)).toBe(false);
  });

  test('un simple APPUI (sans défilement) ne la révèle pas', () => {
    const state = replay([{ type: 'grab', at: 0 }]);
    expect(dayPillRevealed(state, 50)).toBe(false);
  });
});

type Clock = {
  readonly now: () => number;
  readonly advance: (ms: number) => void;
  readonly setTimer: (run: () => void, ms: number) => number;
  readonly clearTimer: (id: number) => void;
};

const fakeClock = (): Clock => {
  const timers = new Map<number, { readonly at: number; readonly run: () => void }>();
  const cursor = { at: 0, nextId: 1 };
  return {
    now: () => cursor.at,
    advance: (ms) => {
      cursor.at += ms;
      [...timers.entries()]
        .filter(([, timer]) => timer.at <= cursor.at)
        .forEach(([id, timer]) => {
          timers.delete(id);
          timer.run();
        });
    },
    setTimer: (run, ms) => {
      const id = cursor.nextId;
      cursor.nextId += 1;
      timers.set(id, { at: cursor.at + ms, run });
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id);
    },
  };
};

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

const scrollerWithSignals = (clock: Clock) => {
  const element = document.createElement('main');
  const seen: boolean[] = [];
  const unsubscribe = createDayPillRevealSubscriber(
    { current: element },
    { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer },
  )((revealed) => {
    seen.push(revealed);
  });
  return { element, seen, unsubscribe };
};

describe('createDayPillRevealSubscriber — les événements du défileur (#6101)', () => {
  test('molette + défilement : révélée, puis effacée quand la fenêtre se referme — sans nouvel événement', () => {
    const clock = fakeClock();
    const { element, seen, unsubscribe } = scrollerWithSignals(clock);
    element.dispatchEvent(new Event('wheel'));
    element.dispatchEvent(new Event('scroll'));
    expect(seen).toEqual([true]);
    clock.advance(SCROLL_ACTIVITY_LINGER_MS - 1);
    expect(seen).toEqual([true]);
    clock.advance(1);
    expect(seen).toEqual([true, false]);
    unsubscribe();
  });

  test('un défilement du code seul ne dit rien', () => {
    const clock = fakeClock();
    const { element, seen, unsubscribe } = scrollerWithSignals(clock);
    element.dispatchEvent(new Event('scroll'));
    clock.advance(SCROLL_ACTIVITY_LINGER_MS * 2);
    expect(seen).toEqual([]);
    unsubscribe();
  });

  test('doigt qui tire puis se lève : effacée une fenêtre après le dernier défilement', () => {
    const clock = fakeClock();
    const { element, seen, unsubscribe } = scrollerWithSignals(clock);
    element.dispatchEvent(new Event('touchstart'));
    element.dispatchEvent(new Event('scroll'));
    clock.advance(SCROLL_ACTIVITY_LINGER_MS * 3);
    expect(seen).toEqual([true]);
    element.dispatchEvent(new Event('touchend'));
    expect(seen).toEqual([true, false]);
    unsubscribe();
  });

  test('désabonné : plus aucun minuteur ne rappelle l’écouteur', () => {
    const clock = fakeClock();
    const { element, seen, unsubscribe } = scrollerWithSignals(clock);
    element.dispatchEvent(new Event('wheel'));
    element.dispatchEvent(new Event('scroll'));
    unsubscribe();
    clock.advance(SCROLL_ACTIVITY_LINGER_MS * 2);
    expect(seen).toEqual([true]);
  });
});

describe('useDayPillReveal — la projection HORS React sur l’hôte (#6101)', () => {
  const mountHook = (ready: boolean) => {
    const host = document.createElement('div');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const captured: { listener: DayPillRevealListener | null } = { listener: null };
    const subscribe = (listener: DayPillRevealListener) => {
      captured.listener = listener;
      return () => {
        captured.listener = null;
      };
    };
    function Probe({ isReady }: { readonly isReady: boolean }) {
      useDayPillReveal({ current: host }, { subscribe, ready: isReady });
      return null;
    }
    const root: Root = createRoot(container);
    act(() => {
      root.render(<Probe isReady={ready} />);
    });
    return {
      host,
      captured,
      unmount: () => {
        act(() => {
          root.unmount();
        });
        container.remove();
      },
    };
  };

  test('au montage, l’hôte ne déclare rien : la pilule est au repos', () => {
    const { host, unmount } = mountHook(true);
    expect(host.dataset.dayPill).toBeUndefined();
    unmount();
  });

  test('révélée puis effacée : l’attribut suit le signal', () => {
    const { host, captured, unmount } = mountHook(true);
    act(() => captured.listener?.(true));
    expect(host.dataset.dayPill).toBe('revealed');
    act(() => captured.listener?.(false));
    expect(host.dataset.dayPill).toBeUndefined();
    unmount();
  });

  test('cadre pas encore prêt : aucun abonnement', () => {
    const { captured, unmount } = mountHook(false);
    expect(captured.listener).toBeNull();
    unmount();
  });

  test('démonté : l’attribut est retiré', () => {
    const { host, captured, unmount } = mountHook(true);
    act(() => captured.listener?.(true));
    unmount();
    expect(host.dataset.dayPill).toBeUndefined();
  });
});

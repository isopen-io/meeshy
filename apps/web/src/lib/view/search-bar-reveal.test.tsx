import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  SEARCH_BAR_HYSTERESIS,
  SEARCH_BAR_TOP_ZONE,
  initialSearchBarScroll,
  nextSearchBarScroll,
  searchBarHidden,
  searchCommunitiesShown,
  useSearchBarScrolledAway,
  type SearchBarScrollState,
} from './search-bar-reveal';

/**
 * #11036 — dans Meeshy Chats, défiler vers le BAS escamote la barre de
 * recherche, et un défilement vers le HAUT, même partiel, la ramène. Taper dans
 * le champ replie la bande des communautés pour laisser voir les résultats.
 * Miroir `ConversationSearchBarScrollLaw` / `ConversationSearchCommunitiesBandLaw` (iOS).
 */

const replay = (depths: readonly number[]): SearchBarScrollState =>
  depths.reduce(nextSearchBarScroll, initialSearchBarScroll());

describe('nextSearchBarScroll — la barre suit le SENS du défilement', () => {
  test('au repos en tête de liste, la barre est là', () => {
    expect(initialSearchBarScroll().hidden).toBe(false);
  });

  test('défiler vers le bas au-delà de la zone de tête l’escamote', () => {
    expect(replay([0, 100, 200]).hidden).toBe(true);
  });

  test('dans la zone de tête, elle reste visible quel que soit le sens', () => {
    expect(replay([0, SEARCH_BAR_TOP_ZONE - 1]).hidden).toBe(false);
  });

  test('un défilement vers le HAUT, même partiel, la ramène loin de la tête', () => {
    const hidden = replay([0, 400, 800]);
    expect(hidden.hidden).toBe(true);
    expect(nextSearchBarScroll(hidden, 800 - SEARCH_BAR_HYSTERESIS).hidden).toBe(false);
  });

  test('un frémissement plus court que l’hystérésis ne bascule rien', () => {
    const hidden = replay([0, 400, 800]);
    expect(nextSearchBarScroll(hidden, 800 - SEARCH_BAR_HYSTERESIS + 1).hidden).toBe(true);
    const shown = replay([0, 400, 800, 600]);
    expect(shown.hidden).toBe(false);
    expect(nextSearchBarScroll(shown, 600 + SEARCH_BAR_HYSTERESIS - 1).hidden).toBe(false);
  });

  test('la remontée se mesure depuis le point le PLUS BAS atteint, pas depuis la bascule', () => {
    const state = replay([0, 400, 800, 1200, 1195]);
    expect(state.hidden).toBe(true);
    expect(nextSearchBarScroll(state, 1200 - SEARCH_BAR_HYSTERESIS).hidden).toBe(false);
  });

  test('revenue, elle repart dès qu’on redescend', () => {
    expect(replay([0, 800, 600, 600 + SEARCH_BAR_HYSTERESIS]).hidden).toBe(true);
  });
});

describe('searchBarHidden — la recherche en cours tient la barre', () => {
  test('escamotée seulement si l’on a défilé, sans focus ni texte', () => {
    expect(searchBarHidden({ scrolledAway: true, focused: false, query: '' })).toBe(true);
    expect(searchBarHidden({ scrolledAway: false, focused: false, query: '' })).toBe(false);
    expect(searchBarHidden({ scrolledAway: true, focused: true, query: '' })).toBe(false);
    expect(searchBarHidden({ scrolledAway: true, focused: false, query: 'a' })).toBe(false);
  });
});

describe('searchCommunitiesShown — taper replie les communautés', () => {
  test('au focus, champ vide : la bande est là', () => {
    expect(searchCommunitiesShown({ focused: true, query: '' })).toBe(true);
  });

  test('dès le premier caractère, elle se replie pour laisser voir les résultats', () => {
    expect(searchCommunitiesShown({ focused: true, query: 'a' })).toBe(false);
    expect(searchCommunitiesShown({ focused: true, query: ' ' })).toBe(false);
  });

  test('champ vidé : elle revient ; recherche annulée (focus perdu) : elle part', () => {
    expect(searchCommunitiesShown({ focused: true, query: '' })).toBe(true);
    expect(searchCommunitiesShown({ focused: false, query: '' })).toBe(false);
  });
});

describe('useSearchBarScrolledAway — branché sur le scrollport', () => {
  let root: Root | null = null;
  let host: HTMLDivElement;
  let renders = 0;
  let latest = false;

  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  function Probe() {
    const frame = useRef<HTMLUListElement | null>(null);
    latest = useSearchBarScrolledAway(frame);
    renders += 1;
    return <ul ref={frame} data-probe />;
  }

  const scrollTo = (depth: number) => {
    const list = host.querySelector('[data-probe]') as HTMLUListElement;
    Object.defineProperty(list, 'scrollTop', { configurable: true, value: depth });
    act(() => {
      list.dispatchEvent(new Event('scroll'));
    });
  };

  test('bascule au changement de sens, et ne re-rend qu’à la bascule', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(<Probe />);
    });
    expect(latest).toBe(false);
    const afterMount = renders;

    scrollTo(100);
    scrollTo(200);
    scrollTo(300);
    expect(latest).toBe(true);
    expect(renders).toBe(afterMount + 1);

    scrollTo(250);
    expect(latest).toBe(false);
    expect(renders).toBe(afterMount + 2);

    scrollTo(240);
    scrollTo(230);
    expect(renders).toBe(afterMount + 2);

    act(() => root?.unmount());
    host.remove();
  });
});

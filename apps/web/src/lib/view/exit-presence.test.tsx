import { act, createElement, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ExitPresence, retainDepartures, useExitMotion } from './exit-presence';
import { sectionMayLeave } from './list-departures';

/**
 * UNE RANGÉE ARCHIVÉE OU SUPPRIMÉE SORT EN SE REPLIANT (#11574). Le FLIP de la
 * liste animait la remontée et l'entrée, pas la sortie : archiver retirait la
 * rangée d'un coup, et celles du dessous sautaient d'un cran. La rangée qui
 * part reste désormais MONTÉE le temps de sa sortie (fondu + repli), inerte,
 * puis quitte le DOM ; un rollback la rend sans sortie ; « réduire le
 * mouvement » la retire tout de suite.
 */
describe('retainDepartures — la loi pure', () => {
  const entry = (key: string) => ({ key, value: key });
  const shownOf = (keys: readonly string[], leaving: readonly string[] = []) =>
    keys.map((key) => ({ key, value: key, leaving: leaving.includes(key) }));
  const base = { mayLeave: () => true, settled: new Set<string>(), flush: false, max: 3 };

  test('une clé partie reste à SA place, marquée sortante', () => {
    const next = retainDepartures({ ...base, shown: shownOf(['a', 'b', 'c']), next: [entry('a'), entry('c')] });
    expect(next.map((p) => `${p.key}${p.leaving ? '↓' : ''}`)).toEqual(['a', 'b↓', 'c']);
  });

  test('une clé revenue (rollback) n’est plus sortante', () => {
    const next = retainDepartures({ ...base, shown: shownOf(['a', 'b', 'c'], ['b']), next: [entry('a'), entry('b'), entry('c')] });
    expect(next.filter((p) => p.leaving)).toEqual([]);
  });

  test('une sortie terminée quitte la liste', () => {
    const next = retainDepartures({ ...base, settled: new Set(['b']), shown: shownOf(['a', 'b', 'c'], ['b']), next: [entry('a'), entry('c')] });
    expect(next.map((p) => p.key)).toEqual(['a', 'c']);
  });

  test('une clé qui vit AILLEURS (changement de section) ne laisse aucun fantôme', () => {
    const next = retainDepartures({ ...base, mayLeave: (key) => key !== 'b', shown: shownOf(['a', 'b']), next: [entry('a')] });
    expect(next.map((p) => p.key)).toEqual(['a']);
  });

  test('au-delà de trois départs d’un coup, c’est un filtre : rien ne se met en scène', () => {
    const next = retainDepartures({ ...base, shown: shownOf(['a', 'b', 'c', 'd', 'e']), next: [entry('a')] });
    expect(next.map((p) => p.key)).toEqual(['a']);
  });

  test('un changement de portée (filtre, recherche) vide les sorties en cours', () => {
    const next = retainDepartures({ ...base, flush: true, shown: shownOf(['a', 'b'], ['b']), next: [entry('a')] });
    expect(next.map((p) => p.key)).toEqual(['a']);
  });

  test('la première clé partie se replie en tête', () => {
    const next = retainDepartures({ ...base, shown: shownOf(['a', 'b']), next: [entry('b')] });
    expect(next.map((p) => p.key)).toEqual(['a', 'b']);
  });
});

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

type Played = {
  readonly id: string | undefined;
  readonly keyframes: readonly Keyframe[];
  readonly finish: () => void;
  cancelled: boolean;
};

describe('ExitPresence + useExitMotion — la rangée sort en se repliant', () => {
  const played: Played[] = [];
  const mounted: { root: Root; host: HTMLElement }[] = [];
  let restore: (() => void) | null = null;
  let reduced = false;

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  beforeEach(() => {
    played.splice(0);
    reduced = false;
    const proto = HTMLElement.prototype;
    const originalAnimate = proto.animate;
    const originalMatchMedia = window.matchMedia;
    proto.animate = function (this: HTMLElement, keyframes: Keyframe[] | PropertyIndexedKeyframes | null) {
      const resolvers: { resolve: () => void } = { resolve: () => {} };
      const finished = new Promise<void>((resolve) => {
        resolvers.resolve = resolve;
      });
      const record: Played = {
        id: this.dataset.row,
        keyframes: Array.isArray(keyframes) ? keyframes : [],
        finish: () => resolvers.resolve(),
        cancelled: false,
      };
      played.push(record);
      return {
        finished,
        cancel: () => {
          record.cancelled = true;
        },
      } as unknown as Animation;
    } as typeof proto.animate;
    window.matchMedia = ((query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    restore = () => {
      proto.animate = originalAnimate;
      window.matchMedia = originalMatchMedia;
    };
  });

  afterEach(() => {
    for (const { root, host } of mounted.splice(0)) {
      act(() => root.unmount());
      host.remove();
    }
    restore?.();
    restore = null;
  });

  const Row = ({ id }: { readonly id: string }) => {
    const ref = useRef<HTMLLIElement | null>(null);
    useExitMotion(ref);
    return createElement('li', { ref, 'data-row': id }, createElement('button', { type: 'button' }, id));
  };

  const List = ({ ids, scope = 'all' }: { readonly ids: readonly string[]; readonly scope?: string }): ReactNode =>
    createElement('ul', null, createElement(ExitPresence, { scope, children: ids.map((id) => createElement(Row, { key: id, id })) }));

  const mount = (ids: readonly string[]) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    act(() => root.render(createElement(List, { ids })));
    return {
      host,
      rerender: (next: readonly string[], scope = 'all') => act(() => root.render(createElement(List, { ids: next, scope }))),
    };
  };

  const rowsOf = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('[data-row]')].map((node) => node.dataset.row);

  test('la rangée archivée reste montée, inerte, pendant sa sortie, puis quitte le DOM', async () => {
    const { host, rerender } = mount(['a', 'b', 'c']);
    rerender(['a', 'c']);

    const leaving = host.querySelector<HTMLElement>('[data-row="b"]');
    expect(rowsOf(host)).toEqual(['a', 'b', 'c']);
    expect(leaving?.hasAttribute('data-row-exiting')).toBe(true);
    expect(leaving?.hasAttribute('inert')).toBe(true);
    expect(leaving?.getAttribute('aria-hidden')).toBe('true');
    const exit = played.find((p) => p.id === 'b');
    expect(exit?.keyframes.at(-1)?.opacity).toBe(0);

    await act(async () => {
      exit?.finish();
      await Promise.resolve();
    });
    expect(rowsOf(host)).toEqual(['a', 'c']);
  });

  test('la sortie n’anime que transform et opacity — aucune géométrie', () => {
    const { rerender } = mount(['a', 'b']);
    rerender(['a']);
    const keys = played.flatMap((p) => p.keyframes.flatMap((frame) => Object.keys(frame)));
    expect(keys.every((key) => ['opacity', 'transform', 'offset', 'easing'].includes(key))).toBe(true);
  });

  test('rollback pendant la sortie : la rangée revient sans sortie, l’animation est annulée', async () => {
    const { host, rerender } = mount(['a', 'b', 'c']);
    rerender(['a', 'c']);
    const exit = played.find((p) => p.id === 'b');
    rerender(['a', 'b', 'c']);

    const back = host.querySelector<HTMLElement>('[data-row="b"]');
    expect(rowsOf(host)).toEqual(['a', 'b', 'c']);
    expect(exit?.cancelled).toBe(true);
    expect(back?.hasAttribute('data-row-exiting')).toBe(false);
    expect(back?.hasAttribute('inert')).toBe(false);
    expect(back?.hasAttribute('aria-hidden')).toBe(false);

    await act(async () => {
      exit?.finish();
      await Promise.resolve();
    });
    expect(rowsOf(host)).toEqual(['a', 'b', 'c']);
  });

  test('sous prefers-reduced-motion, la rangée part tout de suite, sans animation', () => {
    reduced = true;
    const { host, rerender } = mount(['a', 'b', 'c']);
    rerender(['a', 'c']);
    expect(rowsOf(host)).toEqual(['a', 'c']);
    expect(played).toEqual([]);
  });

  test('un changement de filtre retire les rangées sans les mettre en scène', () => {
    const { host, rerender } = mount(['a', 'b', 'c']);
    rerender(['a', 'c'], 'unread');
    expect(rowsOf(host)).toEqual(['a', 'c']);
    expect(played).toEqual([]);
  });
});

describe('sectionMayLeave — une section vidée par minuit ne laisse aucun fantôme', () => {
  test('vidée par sa dernière sortie, elle se replie ; ses rangées vivant ailleurs, elle part sans scène', () => {
    expect(sectionMayLeave(['a'], new Set(['b']))).toBe(true);
    expect(sectionMayLeave(['a', 'c'], new Set(['c']))).toBe(false);
    expect(sectionMayLeave(undefined, new Set())).toBe(true);
  });
});

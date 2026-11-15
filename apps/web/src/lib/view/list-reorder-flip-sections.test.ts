import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { reorderClimbers, useListReorderFlip } from './list-reorder-flip';

/**
 * UNE CONVERSATION QUI CHANGE DE SECTION EN REMONTANT GLISSE (#11342). Les
 * sections (« Aujourd'hui », « Hier »…) sont des parents distincts : une
 * rangée d'« Hier » qui reçoit un message est DÉMONTÉE puis remontée en tête
 * d'« Aujourd'hui ». Le FLIP de #11207 lisait l'ancien nœud, déconnecté, et la
 * laissait paraître d'un coup pendant que les rangées dépassées glissaient :
 * une animation sans sujet.
 */
describe('reorderClimbers — qui a DÉPASSÉ quelqu’un', () => {
  test('la rangée qui remonte en tête est la seule à dépasser ; celles qu’elle dépasse ne grimpent pas', () => {
    expect(reorderClimbers(['a', 'b', 'c', 'd'], ['c', 'a', 'b', 'd'])).toEqual(new Set(['c']));
  });

  test('un filtre qui retire des rangées ne fait grimper personne — l’ordre relatif tient', () => {
    expect(reorderClimbers(['a', 'b', 'c', 'd'], ['b', 'd'])).toEqual(new Set());
  });

  test('une rangée nouvelle n’a pas d’ordre d’avant : elle ne grimpe pas', () => {
    expect(reorderClimbers(['a', 'b'], ['z', 'a', 'b'])).toEqual(new Set());
  });
});

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const ROW = 60;

type Played = { readonly id: string | undefined; readonly connected: boolean; readonly keyframes: readonly Keyframe[] };
type Sections = { readonly today: readonly string[]; readonly yesterday: readonly string[] };

describe('useListReorderFlip — d’une section à l’autre', () => {
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
    const originalRect = proto.getBoundingClientRect;
    const originalAnimate = proto.animate;
    const originalMatchMedia = window.matchMedia;
    proto.getBoundingClientRect = function (this: HTMLElement) {
      const frame = this.closest('[data-testid="frame"]');
      const index = this.hasAttribute('data-row') && frame !== null ? [...frame.querySelectorAll('[data-row]')].indexOf(this) : -1;
      const top = index < 0 ? 0 : index * ROW;
      const height = index < 0 ? 600 : ROW;
      return { top, bottom: top + height, height, left: 0, right: 320, width: 320, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    };
    proto.animate = function (this: HTMLElement, keyframes: Keyframe[] | PropertyIndexedKeyframes | null) {
      played.push({ id: this.dataset.row, connected: this.isConnected, keyframes: Array.isArray(keyframes) ? keyframes : [] });
      return { cancel: () => {}, finished: Promise.resolve() } as unknown as Animation;
    } as typeof proto.animate;
    window.matchMedia = ((query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    restore = () => {
      proto.getBoundingClientRect = originalRect;
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

  const List = ({ sections }: { readonly sections: Sections }) => {
    const frame = useRef<HTMLDivElement | null>(null);
    useListReorderFlip(frame, [...sections.today, ...sections.yesterday].map((id) => ({ id })));
    const section = (key: string, ids: readonly string[]) =>
      createElement(
        'ul',
        { key, 'data-section': key },
        ids.map((id) => createElement('li', { key: id, 'data-row': id }, id)),
      );
    return createElement('div', { ref: frame, 'data-testid': 'frame' }, [section('today', sections.today), section('yesterday', sections.yesterday)]);
  };

  const mount = (sections: Sections) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    act(() => root.render(createElement(List, { sections })));
    return { rerender: (next: Sections) => act(() => root.render(createElement(List, { sections: next }))) };
  };

  test('une rangée d’« Hier » qui passe en tête d’« Aujourd’hui » glisse depuis son ancienne place — sur son NOUVEAU nœud', () => {
    const { rerender } = mount({ today: ['t0', 't1', 't2'], yesterday: ['y0', 'y1', 'y2'] });
    rerender({ today: ['y1', 't0', 't1', 't2'], yesterday: ['y0', 'y2'] });
    const raised = played.find((p) => p.id === 'y1');
    expect(raised?.connected).toBe(true);
    expect(raised?.keyframes[0]?.transform).toBe(`translateY(${4 * ROW}px)`);
    expect(raised?.keyframes.at(-1)?.transform).toBe('translateY(0px)');
    expect(played.filter((p) => p.id !== 'y1').map((p) => p.id).sort()).toEqual(['t0', 't1', 't2', 'y0']);
  });

  test('une rangée qui n’était pas à l’écran entre en FONDU à sa nouvelle place, sans traverser l’écran', () => {
    const today = Array.from({ length: 10 }, (_, i) => `t${i}`);
    const yesterday = Array.from({ length: 5 }, (_, i) => `y${i}`);
    const { rerender } = mount({ today, yesterday });
    rerender({ today: ['y3', ...today], yesterday: yesterday.filter((id) => id !== 'y3') });
    const entering = played.filter((p) => p.id === 'y3');
    expect(entering).toHaveLength(1);
    expect(entering[0]?.connected).toBe(true);
    expect(entering[0]?.keyframes[0]?.opacity).toBe(0);
    expect(entering[0]?.keyframes.at(-1)?.opacity).toBe(1);
    expect(entering[0]?.keyframes.some((frame) => frame.transform !== undefined)).toBe(false);
  });

  test('sous prefers-reduced-motion, ni glissement ni fondu', () => {
    reduced = true;
    const { rerender } = mount({ today: ['t0', 't1', 't2'], yesterday: ['y0', 'y1', 'y2'] });
    rerender({ today: ['y1', 't0', 't1', 't2'], yesterday: ['y0', 'y2'] });
    expect(played).toEqual([]);
  });

  test('une rangée qui DESCEND d’une section n’entre pas en fondu : seules celles qui dépassent', () => {
    const today = Array.from({ length: 10 }, (_, i) => `t${i}`);
    const { rerender } = mount({ today, yesterday: ['y0'] });
    rerender({ today: today.slice(0, 9), yesterday: ['t9', 'y0'] });
    expect(played.filter((p) => p.keyframes.some((frame) => frame.opacity !== undefined))).toEqual([]);
  });
});

import { describe, expect, test } from 'bun:test';

import { pinToBottom } from './pin-to-bottom';

/**
 * `requestAnimationFrame` bouchonné : les images se jouent À LA MAIN, ce qui
 * rend la convergence des mesures OBSERVABLE (une hauteur qui change entre
 * deux images) au lieu de dépendre d'une horloge.
 */
const frameQueue = () => {
  const pending = new Map<number, FrameRequestCallback>();
  let next = 1;
  return {
    requestFrame: (callback: FrameRequestCallback) => {
      const id = next;
      next += 1;
      pending.set(id, callback);
      return id;
    },
    cancelFrame: (id: number) => {
      pending.delete(id);
    },
    run: () => {
      const entries = [...pending.entries()];
      pending.clear();
      for (const [, callback] of entries) callback(0);
      return entries.length;
    },
  };
};

type FakeScroller = HTMLElement & { scrollHeight: number };

const scroller = (scrollHeight: number, clientHeight: number): FakeScroller => {
  let top = 0;
  const element = {
    get scrollTop(): number {
      return top;
    },
    set scrollTop(value: number) {
      top = Math.max(0, Math.min(value, element.scrollHeight - clientHeight));
    },
    scrollHeight,
    clientHeight,
  };
  return element as unknown as FakeScroller;
};

describe('pinToBottom — le bas EXACT du défileur, pas la fin du dernier item', () => {
  test('la première image pose scrollTop au maximum', () => {
    const queue = frameQueue();
    const el = scroller(2000, 700);
    pinToBottom(el, { frames: 5, requestFrame: queue.requestFrame, cancelFrame: queue.cancelFrame });
    queue.run();
    expect(el.scrollTop).toBe(1300);
  });

  test('se ré-ancre quand la hauteur mesurée change sous lui', () => {
    const queue = frameQueue();
    const el = scroller(2000, 700);
    pinToBottom(el, { frames: 5, requestFrame: queue.requestFrame, cancelFrame: queue.cancelFrame });
    queue.run();
    el.scrollHeight = 2600;
    queue.run();
    expect(el.scrollTop).toBe(1900);
  });

  test('joue exactement le nombre d images demandé, jamais un de plus', () => {
    const queue = frameQueue();
    const el = scroller(1000, 400);
    pinToBottom(el, { frames: 3, requestFrame: queue.requestFrame, cancelFrame: queue.cancelFrame });
    expect(queue.run()).toBe(1);
    expect(queue.run()).toBe(1);
    expect(queue.run()).toBe(1);
    expect(queue.run()).toBe(0);
  });

  test('le cancel rendu ABANDONNE : la hauteur peut ensuite grandir sans ramener le fil en bas', () => {
    const queue = frameQueue();
    const el = scroller(2000, 700);
    const cancel = pinToBottom(el, { frames: 10, requestFrame: queue.requestFrame, cancelFrame: queue.cancelFrame });
    queue.run();
    cancel();
    el.scrollHeight = 4000;
    queue.run();
    expect(el.scrollTop).toBe(1300);
  });

  test('annonce le défilement PROGRAMMÉ une seule fois, à la première image', () => {
    const queue = frameQueue();
    const el = scroller(2000, 700);
    let announced = 0;
    pinToBottom(el, {
      frames: 4,
      onFirstFrame: () => {
        announced += 1;
      },
      requestFrame: queue.requestFrame,
      cancelFrame: queue.cancelFrame,
    });
    queue.run();
    queue.run();
    queue.run();
    expect(announced).toBe(1);
  });
});

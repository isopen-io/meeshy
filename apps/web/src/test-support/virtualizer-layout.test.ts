import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Virtualizer, elementScroll, observeElementOffset, observeElementRect } from '@tanstack/react-virtual';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { simulateLayout } from '@/test-support/virtualizer-layout';

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const renderedRowsOf = (): number => {
  const scroller = document.createElement('div');
  document.body.appendChild(scroller);
  const virtualizer = new Virtualizer<HTMLDivElement, Element>({
    count: 50,
    getScrollElement: () => scroller,
    estimateSize: () => 100,
    scrollToFn: elementScroll,
    observeElementRect,
    observeElementOffset,
    onChange: () => undefined,
  });
  const unmount = virtualizer._didMount();
  virtualizer._willUpdate();
  const rows = virtualizer.getVirtualItems().length;
  unmount();
  scroller.remove();
  return rows;
};

describe('simulateLayout — la seule chose que happy-dom ne fait pas, une boîte', () => {
  test('sans elle, le VRAI virtualiseur ne rend aucune rangée', () => {
    expect(renderedRowsOf()).toBe(0);
  });

  test('avec elle, il rend les rangées de sa fenêtre', () => {
    const restore = simulateLayout({ height: 800, width: 390 });
    try {
      expect(renderedRowsOf()).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  test('la boîte se lit sous les deux mesures du virtualiseur — client* (le cadre) et offset* (la rangée)', () => {
    const restore = simulateLayout({ height: 800, width: 390 });
    try {
      const element = document.createElement('div');
      expect([element.clientHeight, element.clientWidth, element.offsetHeight, element.offsetWidth]).toEqual([800, 390, 800, 390]);
    } finally {
      restore();
    }
  });

  test('restaurer rend à happy-dom ses boîtes vides — rien ne fuit vers la suite suivante', () => {
    simulateLayout({ height: 800, width: 390 })();
    const element = document.createElement('div');
    expect([element.clientHeight, element.clientWidth, element.offsetHeight, element.offsetWidth]).toEqual([0, 0, 0, 0]);
  });
});

import { render } from '@testing-library/react';
import { useRef } from 'react';
import {
  FOCAL_FOCUSED_ATTRIBUTE,
  FOCAL_ROW_ATTRIBUTE,
  FOCAL_SCALE_ATTRIBUTE,
  useFocalScroller,
} from '../use-focal-scroller';

// jsdom ne fait pas de layout : on programme les rectangles à la main pour que
// la courbe de mise au point ait de vraies positions à consommer.
function stubLayout(container: HTMLElement, containerHeight: number, rowTops: number[]) {
  container.getBoundingClientRect = () =>
    ({ top: 0, height: containerHeight, bottom: containerHeight, left: 0, right: 0, width: 400, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

  const rows = Array.from(container.querySelectorAll<HTMLElement>(`[${FOCAL_ROW_ATTRIBUTE}]`));
  rows.forEach((row, index) => {
    const top = rowTops[index];
    row.getBoundingClientRect = () =>
      ({ top, height: 40, bottom: top + 40, left: 0, right: 0, width: 400, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  });
  return rows;
}

function Harness({ enabled, onReady }: { enabled: boolean; onReady: (el: HTMLDivElement) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocalScroller({ containerRef, enabled });

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        if (el) onReady(el);
      }}
      data-testid="scroller"
    >
      <div {...{ [FOCAL_ROW_ATTRIBUTE]: 'm1' }}>ancien</div>
      <div {...{ [FOCAL_ROW_ATTRIBUTE]: 'm2' }}>récent</div>
    </div>
  );
}

function flushFrame() {
  jest.advanceTimersByTime(32);
}

beforeEach(() => {
  jest.useFakeTimers();
  window.matchMedia = jest.fn().mockReturnValue({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useFocalScroller — la perspective ne touche que transform et opacity', () => {
  it('shrinks and fades the row furthest above the focus line', () => {
    let container: HTMLElement | null = null;
    const { rerender } = render(
      <Harness enabled={true} onReady={(el) => { container = el; }} />
    );

    // conteneur 660 → focusY 510 ; m1 au milieu 40, m2 au milieu 490
    stubLayout(container!, 660, [20, 470]);
    rerender(<Harness enabled={true} onReady={(el) => { container = el; }} />);
    flushFrame();

    const [m1, m2] = Array.from(
      container!.querySelectorAll<HTMLElement>(`[${FOCAL_ROW_ATTRIBUTE}]`)
    );

    // m1 : d = 510 − 40 = 470 → f = 1 → échelle 0.6 / opacité 0.18
    expect(m1.style.transform).toBe('scale(0.6000)');
    expect(Number(m1.style.opacity)).toBeCloseTo(0.18, 3);

    // m2 : d = 510 − 490 = 20 → quasiment au point
    expect(Number(m2.style.opacity)).toBeGreaterThan(0.9);
  });

  it('marks the row nearest the focus line as the focus card', () => {
    let container: HTMLElement | null = null;
    const { rerender } = render(
      <Harness enabled={true} onReady={(el) => { container = el; }} />
    );

    stubLayout(container!, 660, [20, 470]);
    rerender(<Harness enabled={true} onReady={(el) => { container = el; }} />);
    flushFrame();

    const [m1, m2] = Array.from(
      container!.querySelectorAll<HTMLElement>(`[${FOCAL_ROW_ATTRIBUTE}]`)
    );

    expect(m1.hasAttribute(FOCAL_FOCUSED_ATTRIBUTE)).toBe(false);
    expect(m2.getAttribute(FOCAL_FOCUSED_ATTRIBUTE)).toBe('true');
  });

  it('leaves every row untouched when disabled — that is the Script density', () => {
    let container: HTMLElement | null = null;
    const { rerender } = render(
      <Harness enabled={false} onReady={(el) => { container = el; }} />
    );

    stubLayout(container!, 660, [20, 470]);
    rerender(<Harness enabled={false} onReady={(el) => { container = el; }} />);
    flushFrame();

    const rows = Array.from(
      container!.querySelectorAll<HTMLElement>(`[${FOCAL_ROW_ATTRIBUTE}]`)
    );
    rows.forEach((row) => {
      expect(row.style.transform).toBe('');
      expect(row.style.opacity).toBe('');
      expect(row.hasAttribute(FOCAL_FOCUSED_ATTRIBUTE)).toBe(false);
    });
  });

  // Le virtualiseur mesure l'ANCRE. Écrire la transformation sur l'élément
  // mesuré ferait rétrécir le rectangle mesuré, qui recalculerait une autre
  // échelle : la liste tremblerait d'une frame à l'autre. La transformation va
  // donc sur un enfant dédié.
  it('writes the transform on the inner target, never on the measured anchor', () => {
    let container: HTMLElement | null = null;

    function NestedHarness({ onReady }: { onReady: (el: HTMLDivElement) => void }) {
      const containerRef = useRef<HTMLDivElement>(null);
      useFocalScroller({ containerRef, enabled: true });
      return (
        <div
          ref={(el) => {
            containerRef.current = el;
            if (el) onReady(el);
          }}
        >
          <div {...{ [FOCAL_ROW_ATTRIBUTE]: 'm1' }} data-testid="anchor">
            <div {...{ [FOCAL_SCALE_ATTRIBUTE]: 'true' }} data-testid="target">ancien</div>
          </div>
        </div>
      );
    }

    const { rerender } = render(<NestedHarness onReady={(el) => { container = el; }} />);
    stubLayout(container!, 660, [20]);
    rerender(<NestedHarness onReady={(el) => { container = el; }} />);
    flushFrame();

    const anchor = container!.querySelector<HTMLElement>(`[${FOCAL_ROW_ATTRIBUTE}]`)!;
    const target = container!.querySelector<HTMLElement>(`[${FOCAL_SCALE_ATTRIBUTE}]`)!;

    expect(anchor.style.transform).toBe('');
    expect(anchor.style.opacity).toBe('');
    expect(target.style.transform).toBe('scale(0.6000)');
    expect(Number(target.style.opacity)).toBeCloseTo(0.18, 3);
  });

  // Accessibilité : la perspective est purement visuelle. Qui demande moins de
  // mouvement obtient la liste plate uniforme, sans rien perdre du contenu.
  it('honours prefers-reduced-motion by disabling the perspective', () => {
    window.matchMedia = jest.fn().mockReturnValue({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }) as unknown as typeof window.matchMedia;

    let container: HTMLElement | null = null;
    const { rerender } = render(
      <Harness enabled={true} onReady={(el) => { container = el; }} />
    );

    stubLayout(container!, 660, [20, 470]);
    rerender(<Harness enabled={true} onReady={(el) => { container = el; }} />);
    flushFrame();

    const rows = Array.from(
      container!.querySelectorAll<HTMLElement>(`[${FOCAL_ROW_ATTRIBUTE}]`)
    );
    rows.forEach((row) => {
      expect(row.style.transform).toBe('');
      expect(row.style.opacity).toBe('');
    });
  });
});

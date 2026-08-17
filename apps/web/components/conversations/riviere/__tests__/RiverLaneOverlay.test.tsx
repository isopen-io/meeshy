import { render, screen } from '@testing-library/react';
import { RiverLaneOverlay } from '../RiverLaneOverlay';
import type { RiverPaint } from '../river-paint';

const emptyPaint: RiverPaint = { connectors: [], lines: [], tails: [], births: [], rings: [] };

const fullPaint: RiverPaint = {
  connectors: [{ key: 'c1', d: 'M 0 0 C 1 1 2 2 3 3', color: '#123456', opacity: 0.5 }],
  lines: [{ key: 'l1', x: 50, y1: 0, y2: 100, color: '#123456' }],
  tails: [
    {
      key: 't1',
      gradientId: 'river-fade-0-0',
      x: 50,
      y1: 100,
      y2: 150,
      startColor: '#123456',
      startOpacity: 0.85,
      endColor: '#123456',
      endOpacity: 0,
    },
  ],
  births: [{ key: 'b1', cx: 50, cy: 0, color: '#123456' }],
  rings: [{ key: 'r1', cx: 50, cy: 200, color: '#123456' }],
};

describe('RiverLaneOverlay — tracé DÉCORATIF, aucune géométrie recalculée', () => {
  it('est aria-hidden (décoratif — le contenu prime, §7bis)', () => {
    render(<RiverLaneOverlay paint={emptyPaint} widthPx={300} heightPx={300} />);
    expect(screen.getByTestId('river-lane-overlay')).toHaveAttribute('aria-hidden', 'true');
  });

  it('paint vide ⇒ aucun élément de tracé (sérialisée, §7ter C)', () => {
    render(<RiverLaneOverlay paint={emptyPaint} widthPx={300} heightPx={300} />);
    expect(screen.queryByTestId('river-connector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('river-lane-line')).not.toBeInTheDocument();
    expect(screen.queryByTestId('river-lane-birth')).not.toBeInTheDocument();
    expect(screen.queryByTestId('river-lane-addressed-ring')).not.toBeInTheDocument();
  });

  it('pose un élément par entrée de paint', () => {
    render(<RiverLaneOverlay paint={fullPaint} widthPx={300} heightPx={300} />);
    expect(screen.getAllByTestId('river-connector')).toHaveLength(1);
    expect(screen.getAllByTestId('river-lane-line')).toHaveLength(1);
    expect(screen.getAllByTestId('river-lane-tail')).toHaveLength(1);
    expect(screen.getAllByTestId('river-lane-birth')).toHaveLength(1);
    expect(screen.getAllByTestId('river-lane-addressed-ring')).toHaveLength(1);
  });

  it('consomme river.line/river.connector en CSS pur (épaisseur), jamais un nombre en dur', () => {
    render(<RiverLaneOverlay paint={fullPaint} widthPx={300} heightPx={300} />);
    const line = screen.getByTestId('river-lane-line');
    const connector = screen.getByTestId('river-connector');
    expect(line.style.strokeWidth).toBe('var(--lentille-river-line-width)');
    expect(connector.style.strokeWidth).toBe('var(--lentille-river-connector-stroke-width)');
  });

  it('ne pose AUCUNE transition/animation CSS (reduce-motion §7bis, par construction)', () => {
    const { container } = render(<RiverLaneOverlay paint={fullPaint} widthPx={300} heightPx={300} />);
    expect(container.innerHTML).not.toMatch(/transition|animation/i);
  });
});

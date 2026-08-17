import {
  riverTotalWidthPx,
  riverLaneLeadingXPx,
  riverRailXPx,
  riverBubbleContentWidthPx,
  type RiverColumnLayout,
} from '../river-column-layout';

const layout: RiverColumnLayout = { laneWidthPx: 300, gutterPx: 28, laneCount: 4 };

describe('river-column-layout — arithmétique pure (miroir de RiverColumnLayout.swift)', () => {
  it('totalWidthPx = laneCount * laneWidthPx', () => {
    expect(riverTotalWidthPx(layout)).toBe(1200);
  });

  it('totalWidthPx ne descend jamais sous zéro pour un laneCount négatif', () => {
    expect(riverTotalWidthPx({ ...layout, laneCount: -3 })).toBe(0);
  });

  it('laneLeadingXPx(0) = 0, laneLeadingXPx(n) = n * laneWidthPx', () => {
    expect(riverLaneLeadingXPx(layout, 0)).toBe(0);
    expect(riverLaneLeadingXPx(layout, 3)).toBe(900);
  });

  it('railXPx passe au CENTRE du couloir (leadingX + largeur/2)', () => {
    expect(riverRailXPx(layout, 0)).toBe(150);
    expect(riverRailXPx(layout, 1)).toBe(450);
    expect(riverRailXPx(layout, 2)).toBe(750);
  });

  it('bubbleContentWidthPx = laneWidthPx - 2*gutterPx', () => {
    expect(riverBubbleContentWidthPx(layout)).toBe(244);
  });

  it('bubbleContentWidthPx ne descend jamais sous zéro (gouttière > largeur)', () => {
    expect(riverBubbleContentWidthPx({ laneWidthPx: 10, gutterPx: 100, laneCount: 1 })).toBe(0);
  });
});

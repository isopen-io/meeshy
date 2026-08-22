import { computeParticipantOverlayPosition } from '../overlay-grid-layout';

describe('computeParticipantOverlayPosition', () => {
  it('places the first tile at the top-left margin', () => {
    const position = computeParticipantOverlayPosition({
      index: 0,
      viewportWidth: 1280,
      viewportHeight: 800,
    });

    expect(position).toEqual({ x: 20, y: 20 });
  });

  it('lays tiles out left to right on a wide viewport', () => {
    const positions = [0, 1, 2].map((index) =>
      computeParticipantOverlayPosition({ index, viewportWidth: 1280, viewportHeight: 800 })
    );

    // Same row (equal y), strictly increasing x.
    expect(positions[0].y).toBe(positions[1].y);
    expect(positions[1].y).toBe(positions[2].y);
    expect(positions[1].x).toBeGreaterThan(positions[0].x);
    expect(positions[2].x).toBeGreaterThan(positions[1].x);
  });

  it('wraps to a new row instead of running off the right edge of the viewport', () => {
    // Narrow viewport: only room for 2 tiles (200px each + 20px gap) per row.
    const viewportWidth = 460;
    const tileWidth = 200;
    const gap = 20;

    const third = computeParticipantOverlayPosition({
      index: 2,
      viewportWidth,
      viewportHeight: 800,
      tileWidth,
      gap,
    });

    // Regression: the previous layout (`x: 20 + index * 160`) never wrapped —
    // the 3rd tile of a group call would land at x=340, entirely past a
    // 460px-wide viewport and impossible to reach or even see.
    expect(third.x).toBeLessThanOrEqual(viewportWidth - tileWidth);
    expect(third.y).toBeGreaterThan(20);
  });

  it('never places a tile outside the viewport bounds, however many participants', () => {
    const viewportWidth = 1024;
    const viewportHeight = 640;
    const tileWidth = 200;
    const tileHeight = 280;

    for (let index = 0; index < 24; index += 1) {
      const position = computeParticipantOverlayPosition({
        index,
        viewportWidth,
        viewportHeight,
        tileWidth,
        tileHeight,
      });

      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeGreaterThanOrEqual(0);
      expect(position.x + tileWidth).toBeLessThanOrEqual(viewportWidth);
      expect(position.y + tileHeight).toBeLessThanOrEqual(viewportHeight);
    }
  });

  it('cycles back to the first grid slot once participants exceed the grid capacity, rather than stacking below the viewport', () => {
    // A grid that fits exactly 4 tiles (2 columns x 2 rows).
    const options = {
      viewportWidth: 460,
      viewportHeight: 620,
      tileWidth: 200,
      tileHeight: 280,
      gap: 20,
    };

    const fifth = computeParticipantOverlayPosition({ index: 4, ...options });
    const first = computeParticipantOverlayPosition({ index: 0, ...options });

    expect(fifth).toEqual(first);
  });

  it('uses default tile dimensions matching DraggableParticipantOverlay drag-clamp bounds', () => {
    // DraggableParticipantOverlay clamps drag position with
    // maxX = innerWidth - 200 / maxY = innerHeight - 280 — the initial
    // placement must agree with those defaults so a freshly-mounted tile is
    // never immediately outside the range dragging can reach.
    const position = computeParticipantOverlayPosition({
      index: 1,
      viewportWidth: 1280,
      viewportHeight: 800,
    });

    expect(position.x).toBeLessThanOrEqual(1280 - 200);
    expect(position.y).toBeLessThanOrEqual(800 - 280);
  });
});

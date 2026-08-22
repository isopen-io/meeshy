/**
 * Pure layout for the floating remote-participant tiles rendered by
 * `VideoCallInterface`/`DraggableParticipantOverlay`.
 *
 * Before this, initial tile placement was `x: 20 + index * 160, y: 20` — a
 * single unbounded row. Harmless at the old 1:1 cap, but the group-call cap
 * lift (S1, `tasks/2026-08-13-group-calls-gap-analysis.md`) made a call with
 * several remote participants reachable: past the first few tiles, `x`
 * overflows the viewport and the tile renders fully off-screen — invisible,
 * and (since `DraggableParticipantOverlay` clamps DRAG moves but never the
 * INITIAL position) impossible to drag back into view.
 *
 * This wraps tiles into rows within the viewport instead, and cycles back to
 * the first slot once participants exceed the grid's capacity — overlapping
 * tiles are still visible and draggable, off-screen ones are neither.
 */

export interface OverlayGridPosition {
  readonly x: number;
  readonly y: number;
}

export interface ComputeOverlayPositionOptions {
  /** Zero-based index of this participant among the floating overlay tiles. */
  index: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Must match `DraggableParticipantOverlay`'s drag-clamp `maxX` (`innerWidth - tileWidth`). */
  tileWidth?: number;
  /** Must match `DraggableParticipantOverlay`'s drag-clamp `maxY` (`innerHeight - tileHeight`). */
  tileHeight?: number;
  gap?: number;
}

const DEFAULT_TILE_WIDTH = 200;
const DEFAULT_TILE_HEIGHT = 280;
const DEFAULT_GAP = 20;

export function computeParticipantOverlayPosition({
  index,
  viewportWidth,
  viewportHeight,
  tileWidth = DEFAULT_TILE_WIDTH,
  tileHeight = DEFAULT_TILE_HEIGHT,
  gap = DEFAULT_GAP,
}: ComputeOverlayPositionOptions): OverlayGridPosition {
  const maxX = Math.max(gap, viewportWidth - tileWidth);
  const maxY = Math.max(gap, viewportHeight - tileHeight);

  const columnStride = tileWidth + gap;
  const rowStride = tileHeight + gap;

  const tilesPerRow = Math.max(1, Math.floor((viewportWidth - gap) / columnStride));
  const rowsPerScreen = Math.max(1, Math.floor((viewportHeight - gap) / rowStride));
  const capacity = tilesPerRow * rowsPerScreen;

  const slot = index % capacity;
  const row = Math.floor(slot / tilesPerRow);
  const col = slot % tilesPerRow;

  return {
    x: Math.min(gap + col * columnStride, maxX),
    y: Math.min(gap + row * rowStride, maxY),
  };
}

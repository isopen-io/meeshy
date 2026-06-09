import { renderHook, act } from '@testing-library/react';
import { useDraggable } from '@/hooks/use-draggable';

function mouseDown(clientX: number, clientY: number) {
  return { clientX, clientY } as unknown as React.MouseEvent;
}

describe('useDraggable', () => {
  const originalW = window.innerWidth;
  const originalH = window.innerHeight;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalW, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: originalH, configurable: true });
  });

  it('starts at the initial position and not dragging', () => {
    const { result } = renderHook(() =>
      useDraggable({ initial: { x: 20, y: 30 } })
    );
    expect(result.current.position).toEqual({ x: 20, y: 30 });
    expect(result.current.isDragging).toBe(false);
  });

  it('moves the tile while dragging, tracking the pointer offset', () => {
    const { result } = renderHook(() =>
      useDraggable({ initial: { x: 100, y: 100 }, tileWidth: 160, tileHeight: 240 })
    );

    act(() => {
      // Grab at (110,120): offset from tile origin is (10,20).
      result.current.onDragStart(mouseDown(110, 120));
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 400 }));
    });
    // New origin = pointer - offset = (300-10, 400-20) = (290, 380).
    expect(result.current.position).toEqual({ x: 290, y: 380 });

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    expect(result.current.isDragging).toBe(false);
  });

  it('constrains the tile within the viewport bounds', () => {
    const { result } = renderHook(() =>
      useDraggable({ initial: { x: 0, y: 0 }, tileWidth: 160, tileHeight: 240 })
    );

    act(() => {
      result.current.onDragStart(mouseDown(0, 0));
    });
    act(() => {
      // Drag far beyond bottom-right.
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 5000, clientY: 5000 }));
    });
    // Clamped to (innerWidth - tileWidth, innerHeight - tileHeight) = (840, 560).
    expect(result.current.position).toEqual({ x: 840, y: 560 });

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: -5000, clientY: -5000 }));
    });
    expect(result.current.position).toEqual({ x: 0, y: 0 });
  });

  it('does not move after drag ends', () => {
    const { result } = renderHook(() => useDraggable({ initial: { x: 50, y: 50 } }));
    act(() => result.current.onDragStart(mouseDown(50, 50)));
    act(() => window.dispatchEvent(new MouseEvent('mouseup')));

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 700, clientY: 700 }));
    });
    expect(result.current.position).toEqual({ x: 50, y: 50 });
  });
});

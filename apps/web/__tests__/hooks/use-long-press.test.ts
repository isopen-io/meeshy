/**
 * Tests for hooks/use-long-press.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useLongPress } from '@/hooks/use-long-press';

const makeMouse = (x = 100, y = 200): React.MouseEvent<HTMLElement> =>
  ({ clientX: x, clientY: y, preventDefault: jest.fn(), stopPropagation: jest.fn(), target: {} } as any);

const makeTouch = (x = 50, y = 80): React.TouchEvent<HTMLElement> =>
  ({ touches: [{ clientX: x, clientY: y }], preventDefault: jest.fn(), target: {} } as any);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── returned handlers ────────────────────────────────────────────────────────

describe('returned handlers', () => {
  it('returns all expected event handlers', () => {
    const { result } = renderHook(() => useLongPress(jest.fn()));
    expect(result.current).toHaveProperty('onTouchStart');
    expect(result.current).toHaveProperty('onTouchEnd');
    expect(result.current).toHaveProperty('onTouchMove');
    expect(result.current).toHaveProperty('onMouseDown');
    expect(result.current).toHaveProperty('onMouseUp');
    expect(result.current).toHaveProperty('onMouseLeave');
    expect(result.current).toHaveProperty('onClick');
  });
});

// ─── long press fires callback ────────────────────────────────────────────────

describe('long press fires callback', () => {
  it('calls callback after threshold (default 500ms) on mouse', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useLongPress(callback));
    const event = makeMouse(10, 20);
    act(() => { result.current.onMouseDown(event); });
    jest.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledWith(event, { x: 10, y: 20 });
  });

  it('calls callback after custom threshold on mouse', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useLongPress(callback, { threshold: 1000 }));
    act(() => { result.current.onMouseDown(makeMouse()); });
    jest.advanceTimersByTime(999);
    expect(callback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalled();
  });

  it('calls callback after threshold on touch', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useLongPress(callback));
    const event = makeTouch(50, 80);
    act(() => { result.current.onTouchStart(event); });
    jest.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledWith(event, { x: 50, y: 80 });
  });
});

// ─── cancel before threshold ──────────────────────────────────────────────────

describe('cancel before threshold', () => {
  it('does not call callback when mouseUp before threshold', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useLongPress(callback));
    act(() => { result.current.onMouseDown(makeMouse()); });
    act(() => { result.current.onMouseUp(); });
    jest.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not call callback when mouseLeave before threshold', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useLongPress(callback));
    act(() => { result.current.onMouseDown(makeMouse()); });
    act(() => { result.current.onMouseLeave(); });
    jest.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not call callback when touchEnd before threshold', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useLongPress(callback));
    act(() => { result.current.onTouchStart(makeTouch()); });
    act(() => { result.current.onTouchEnd(); });
    jest.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not call callback when touchMove (drag) before threshold', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useLongPress(callback));
    act(() => { result.current.onTouchStart(makeTouch()); });
    act(() => { result.current.onTouchMove(); });
    jest.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();
  });
});

// ─── callbacks ────────────────────────────────────────────────────────────────

describe('option callbacks', () => {
  it('calls onStart when press starts', () => {
    const onStart = jest.fn();
    const { result } = renderHook(() => useLongPress(jest.fn(), { onStart }));
    act(() => { result.current.onMouseDown(makeMouse()); });
    expect(onStart).toHaveBeenCalled();
  });

  it('calls onCancel when press is released early', () => {
    const onCancel = jest.fn();
    const { result } = renderHook(() => useLongPress(jest.fn(), { onCancel }));
    act(() => { result.current.onMouseDown(makeMouse()); });
    act(() => { result.current.onMouseUp(); });
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not call onCancel when long press completes', () => {
    const onCancel = jest.fn();
    const { result } = renderHook(() => useLongPress(jest.fn(), { onCancel }));
    act(() => { result.current.onMouseDown(makeMouse()); });
    jest.advanceTimersByTime(500);
    act(() => { result.current.onMouseUp(); });
    expect(onCancel).not.toHaveBeenCalled();
  });
});

// ─── onClick ──────────────────────────────────────────────────────────────────

describe('onClick', () => {
  it('does not block click when no long press occurred', () => {
    const event = makeMouse();
    const { result } = renderHook(() => useLongPress(jest.fn()));
    act(() => { result.current.onClick(event); });
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('does not block click after cancel', () => {
    const event = makeMouse();
    const { result } = renderHook(() => useLongPress(jest.fn()));
    act(() => { result.current.onMouseDown(makeMouse()); });
    act(() => { result.current.onMouseUp(); });
    act(() => { result.current.onClick(event); });
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

/**
 * Tests for hooks/use-single-tap.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useSingleTap } from '@/hooks/use-single-tap';

const makeTouchEvent = () =>
  ({ preventDefault: jest.fn(), stopPropagation: jest.fn() } as unknown as React.TouchEvent);

const makeClickEvent = () => ({} as React.MouseEvent);

describe('useSingleTap', () => {
  it('returns onTouchEnd and onClick handlers', () => {
    const { result } = renderHook(() => useSingleTap(jest.fn()));
    expect(typeof result.current.onTouchEnd).toBe('function');
    expect(typeof result.current.onClick).toBe('function');
  });

  it('calls onTap when touch ends', () => {
    const onTap = jest.fn();
    const { result } = renderHook(() => useSingleTap(onTap));
    const event = makeTouchEvent();
    act(() => { result.current.onTouchEnd(event); });
    expect(onTap).toHaveBeenCalledWith(event);
  });

  it('prevents default and stops propagation on touch', () => {
    const onTap = jest.fn();
    const { result } = renderHook(() => useSingleTap(onTap));
    const event = makeTouchEvent();
    act(() => { result.current.onTouchEnd(event); });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('calls onTap when clicked', () => {
    const onTap = jest.fn();
    const { result } = renderHook(() => useSingleTap(onTap));
    const event = makeClickEvent();
    act(() => { result.current.onClick(event); });
    expect(onTap).toHaveBeenCalledWith(event);
  });

  it('updates handler when onTap callback changes', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { result, rerender } = renderHook(
      ({ fn }) => useSingleTap(fn),
      { initialProps: { fn: first } }
    );

    act(() => { result.current.onClick(makeClickEvent()); });
    expect(first).toHaveBeenCalledTimes(1);

    rerender({ fn: second });
    act(() => { result.current.onClick(makeClickEvent()); });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });
});

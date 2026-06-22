import { useRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFocusTrap } from '@/hooks/use-accessibility';

function TrapHarness({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref as React.RefObject<HTMLElement>, active);
  return (
    <div ref={ref} data-testid="container">
      <button data-testid="first">First</button>
      <button data-testid="mid">Mid</button>
      <button data-testid="last">Last</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('focuses the first focusable element when activated', () => {
    render(<TrapHarness active />);
    expect(document.activeElement).toBe(screen.getByTestId('first'));
  });

  it('does not move focus when inactive', () => {
    render(<TrapHarness active={false} />);
    expect(document.activeElement).not.toBe(screen.getByTestId('first'));
  });

  it('wraps focus from the last element to the first on Tab', () => {
    render(<TrapHarness active />);
    const container = screen.getByTestId('container');
    const last = screen.getByTestId('last');
    last.focus();
    fireEvent.keyDown(container, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByTestId('first'));
  });

  it('wraps focus from the first element to the last on Shift+Tab', () => {
    render(<TrapHarness active />);
    const container = screen.getByTestId('container');
    const first = screen.getByTestId('first');
    first.focus();
    fireEvent.keyDown(container, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByTestId('last'));
  });
});

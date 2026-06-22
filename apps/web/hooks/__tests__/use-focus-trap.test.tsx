import { render } from '@testing-library/react';
import { useFocusTrap } from '../use-focus-trap';

/**
 * Minimal dialog harness driven by the hook under test. Renders a container
 * (with the focus-trap ref) holding three buttons, plus an "opener" button
 * outside the dialog to assert focus restoration on unmount.
 */
function Dialog({ active }: { active: boolean }) {
  const ref = useFocusTrap<HTMLDivElement>(active);
  return (
    <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1} data-testid="dialog">
      <button data-testid="first">First</button>
      <button data-testid="middle">Middle</button>
      <button data-testid="last">Last</button>
    </div>
  );
}

function pressTab(target: Element, shiftKey = false) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }),
  );
}

describe('useFocusTrap', () => {
  it('moves focus into the dialog when activated', () => {
    const { getByTestId } = render(<Dialog active />);
    expect(document.activeElement).toBe(getByTestId('first'));
  });

  it('wraps focus from the last element back to the first on Tab', () => {
    const { getByTestId } = render(<Dialog active />);
    const last = getByTestId('last');
    last.focus();
    pressTab(last);
    expect(document.activeElement).toBe(getByTestId('first'));
  });

  it('wraps focus from the first element to the last on Shift+Tab', () => {
    const { getByTestId } = render(<Dialog active />);
    const first = getByTestId('first');
    first.focus();
    pressTab(first, true);
    expect(document.activeElement).toBe(getByTestId('last'));
  });

  it('does not hijack Tab between interior elements', () => {
    const { getByTestId } = render(<Dialog active />);
    const first = getByTestId('first');
    first.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    first.dispatchEvent(event);
    // Tabbing forward off a non-last element is left to the browser default.
    expect(event.defaultPrevented).toBe(false);
  });

  it('does nothing while inactive', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    render(<Dialog active={false} />);
    expect(document.activeElement).toBe(opener);
    document.body.removeChild(opener);
  });

  it('restores focus to the opener when the dialog unmounts', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { unmount, getByTestId } = render(<Dialog active />);
    expect(document.activeElement).toBe(getByTestId('first'));

    unmount();
    expect(document.activeElement).toBe(opener);
    document.body.removeChild(opener);
  });
});

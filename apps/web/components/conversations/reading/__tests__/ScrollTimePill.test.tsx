import { act, render, screen } from '@testing-library/react';
import { ScrollTimePill } from '../ScrollTimePill';

const DISMISS_AFTER_MS = 900;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ScrollTimePill — n’existe que pendant le défilement', () => {
  it('is hidden before any scrolling happens', () => {
    render(<ScrollTimePill label="Mercredi · 17:42" scrollTick={0} />);

    expect(screen.getByText('Mercredi · 17:42')).toHaveAttribute('aria-hidden', 'true');
  });

  it('appears as soon as the list scrolls', () => {
    const { rerender } = render(<ScrollTimePill label="Mercredi · 17:42" scrollTick={0} />);

    rerender(<ScrollTimePill label="Mercredi · 17:42" scrollTick={1} />);

    expect(screen.getByText('Mercredi · 17:42')).toHaveAttribute('aria-hidden', 'false');
  });

  // Le volume 4 : « le doigt s'arrête + 900 ms → opacité 0 ».
  it('fades away 900ms after the finger stops', () => {
    const { rerender } = render(<ScrollTimePill label="Mercredi · 17:42" scrollTick={0} />);
    rerender(<ScrollTimePill label="Mercredi · 17:42" scrollTick={1} />);

    act(() => { jest.advanceTimersByTime(DISMISS_AFTER_MS - 1); });
    expect(screen.getByText('Mercredi · 17:42')).toHaveAttribute('aria-hidden', 'false');

    act(() => { jest.advanceTimersByTime(1); });
    expect(screen.getByText('Mercredi · 17:42')).toHaveAttribute('aria-hidden', 'true');
  });

  // « timer réarmé à chaque scrollViewDidScroll » : un défilement continu ne
  // doit jamais faire clignoter la pilule.
  it('rearms the timer on every scroll so continuous scrolling keeps it visible', () => {
    const { rerender } = render(<ScrollTimePill label="Mercredi · 17:42" scrollTick={0} />);
    rerender(<ScrollTimePill label="Mercredi · 17:42" scrollTick={1} />);

    act(() => { jest.advanceTimersByTime(800); });
    rerender(<ScrollTimePill label="Mercredi · 17:42" scrollTick={2} />);
    act(() => { jest.advanceTimersByTime(800); });

    expect(screen.getByText('Mercredi · 17:42')).toHaveAttribute('aria-hidden', 'false');
  });

  it('renders nothing without a label', () => {
    const { container } = render(<ScrollTimePill label="" scrollTick={3} />);

    expect(container).toBeEmptyDOMElement();
  });
});

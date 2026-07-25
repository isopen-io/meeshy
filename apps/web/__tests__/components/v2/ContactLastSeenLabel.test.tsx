import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { ContactLastSeenLabel } from '@/components/v2/ContactLastSeenLabel';
import { useUserStore } from '@/stores/user-store';

const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

describe('ContactLastSeenLabel', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-12T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the relative label computed from lastActiveAt at render time', () => {
    render(
      <ContactLastSeenLabel
        lastActiveAt={new Date('2026-06-12T11:58:00Z').toISOString()}
        t={t}
      />
    );

    expect(screen.getByText('status.lastSeenMinutes:{"count":2}')).toBeInTheDocument();
  });

  it('recomputes the label when the user status tick fires', () => {
    render(
      <ContactLastSeenLabel
        lastActiveAt={new Date('2026-06-12T11:58:00Z').toISOString()}
        t={t}
      />
    );

    act(() => {
      jest.setSystemTime(new Date('2026-06-12T12:05:00Z'));
      useUserStore.getState().triggerStatusTick();
    });

    expect(screen.getByText('status.lastSeenMinutes:{"count":7}')).toBeInTheDocument();
  });

  it('renders nothing without lastActiveAt', () => {
    const { container } = render(<ContactLastSeenLabel t={t} />);

    expect(container).toBeEmptyDOMElement();
  });
});

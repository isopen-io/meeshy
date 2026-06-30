import { render, screen } from '@testing-library/react';

// t() returns the interpolated value so we can assert i18n + pluralization deterministically.
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown> | string) => {
      const count =
        params && typeof params === 'object' ? (params as { count?: number }).count : undefined;
      if (key === 'info.participant') return `${count} participant`;
      if (key === 'info.participants') return `${count} participants`;
      return key;
    },
    isLoading: false,
  }),
}));

import { CallInfoOverlay } from '@/components/video-calls/CallInfoOverlay';

describe('CallInfoOverlay', () => {
  it('renders the duration label', () => {
    render(<CallInfoOverlay durationLabel="1:23" participantCount={3} />);
    expect(screen.getByTestId('call-duration')).toHaveTextContent('1:23');
  });

  it('renders a translated, pluralized participant count (plural)', () => {
    render(<CallInfoOverlay durationLabel="1:23" participantCount={3} />);
    expect(screen.getByText('3 participants')).toBeInTheDocument();
  });

  it('renders the singular form for a single participant', () => {
    render(<CallInfoOverlay durationLabel="0:42" participantCount={1} />);
    expect(screen.getByText('1 participant')).toBeInTheDocument();
  });
});

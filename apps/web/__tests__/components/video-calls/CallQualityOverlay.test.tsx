import { render, screen } from '@testing-library/react';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k, isLoading: false }),
}));
// Break the heavy transitive import chain (socket service → encryption) pulled
// in by ConnectionQualityBadge's quality helpers; irrelevant to this overlay.
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: () => null },
}));

import { CallQualityOverlay } from '@/components/video-calls/CallQualityOverlay';

describe('CallQualityOverlay', () => {
  it('shows the survival pill when video is suspended and the user wants video', () => {
    render(<CallQualityOverlay stats={null} videoSuspended userWantsVideo />);
    expect(screen.getByTestId('survival-pill')).toBeInTheDocument();
  });

  it('hides the survival pill when not suspended', () => {
    render(<CallQualityOverlay stats={null} videoSuspended={false} userWantsVideo />);
    expect(screen.queryByTestId('survival-pill')).not.toBeInTheDocument();
  });

  it('hides the survival pill when the user does not want video', () => {
    render(<CallQualityOverlay stats={null} videoSuspended userWantsVideo={false} />);
    expect(screen.queryByTestId('survival-pill')).not.toBeInTheDocument();
  });
});

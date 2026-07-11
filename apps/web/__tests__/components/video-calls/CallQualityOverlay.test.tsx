import { render, screen } from '@testing-library/react';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    // The remoteAlerts labels carry a {name} placeholder in the real catalog —
    // mirror it so the interpolation test below actually proves substitution.
    t: (k: string) => (k.startsWith('calls.remoteAlerts.') ? `${k} {name}` : k),
    isLoading: false,
  }),
}));
// Break the heavy transitive import chain (socket service → encryption) pulled
// in by ConnectionQualityBadge's quality helpers; irrelevant to this overlay.
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: () => null, onStatusChange: jest.fn(() => () => {}) },
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

  // --- remote alerts (call:quality-alert / call:screen-capture-alert) ------

  it('shows the remote-quality pill while the peer link is degraded', () => {
    render(<CallQualityOverlay stats={null} remoteQualityDegraded participantName="Alice" />);
    expect(screen.getByTestId('remote-quality-pill')).toBeInTheDocument();
  });

  it('hides the remote-quality pill by default', () => {
    render(<CallQualityOverlay stats={null} />);
    expect(screen.queryByTestId('remote-quality-pill')).not.toBeInTheDocument();
  });

  it('shows the privacy pill while the peer captures the screen', () => {
    render(<CallQualityOverlay stats={null} remoteScreenCapturing participantName="Alice" />);
    expect(screen.getByTestId('screen-capture-pill')).toBeInTheDocument();
  });

  it('hides the privacy pill once the capture stops', () => {
    render(<CallQualityOverlay stats={null} remoteScreenCapturing={false} participantName="Alice" />);
    expect(screen.queryByTestId('screen-capture-pill')).not.toBeInTheDocument();
  });

  it('interpolates the participant name into both pill labels', () => {
    render(
      <CallQualityOverlay
        stats={null}
        remoteQualityDegraded
        remoteScreenCapturing
        participantName="Alice"
      />,
    );
    expect(screen.getByTestId('remote-quality-pill').textContent).toContain('Alice');
    expect(screen.getByTestId('remote-quality-pill').textContent).not.toContain('{name}');
    expect(screen.getByTestId('screen-capture-pill').textContent).toContain('Alice');
    expect(screen.getByTestId('screen-capture-pill').textContent).not.toContain('{name}');
  });
});

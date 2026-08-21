import { render, screen } from '@testing-library/react';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    // The remoteAlerts labels carry a {name} placeholder in the real catalog —
    // mirror it so the interpolation test below actually proves substitution.
    // Mirror the real `t(key, params)` function-replacer (hooks/use-i18n.ts):
    // values are inserted via a function replacer, so `$`-sequences in a
    // user-controlled name are NEVER re-interpreted by String.prototype.replace.
    t: (k: string, params?: Record<string, unknown>) => {
      const template = k.startsWith('remoteAlerts.') ? `${k} {name}` : k;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, key: string) =>
        params[key] != null ? String(params[key]) : match,
      );
    },
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

  it('shows the discreet remote-quality indicator while the peer link is degraded', () => {
    render(<CallQualityOverlay stats={null} remoteQualityDegraded qualityDegradedParticipantName="Alice" />);
    expect(screen.getByTestId('remote-quality-indicator')).toBeInTheDocument();
  });

  it('no longer renders the intrusive text pill for a degraded peer link', () => {
    render(<CallQualityOverlay stats={null} remoteQualityDegraded qualityDegradedParticipantName="Alice" />);
    expect(screen.queryByTestId('remote-quality-pill')).not.toBeInTheDocument();
  });

  it('hides the remote-quality indicator by default', () => {
    render(<CallQualityOverlay stats={null} />);
    expect(screen.queryByTestId('remote-quality-indicator')).not.toBeInTheDocument();
  });

  it('shows the privacy pill while the peer captures the screen', () => {
    render(<CallQualityOverlay stats={null} remoteScreenCapturing screenCapturingParticipantName="Alice" />);
    expect(screen.getByTestId('screen-capture-pill')).toBeInTheDocument();
  });

  it('hides the privacy pill once the capture stops', () => {
    render(<CallQualityOverlay stats={null} remoteScreenCapturing={false} screenCapturingParticipantName="Alice" />);
    expect(screen.queryByTestId('screen-capture-pill')).not.toBeInTheDocument();
  });

  it('interpolates the participant name into the quality indicator aria-label and the capture pill', () => {
    render(
      <CallQualityOverlay
        stats={null}
        remoteQualityDegraded
        remoteScreenCapturing
        qualityDegradedParticipantName="Alice"
        screenCapturingParticipantName="Alice"
      />,
    );
    // The degraded-peer signal is now a discreet icon: the interpolated label
    // lives in its accessible name (aria-label), not visible body text.
    const indicator = screen.getByTestId('remote-quality-indicator');
    expect(indicator.getAttribute('aria-label')).toContain('Alice');
    expect(indicator.getAttribute('aria-label')).not.toContain('{name}');
    expect(screen.getByTestId('screen-capture-pill').textContent).toContain('Alice');
    expect(screen.getByTestId('screen-capture-pill').textContent).not.toContain('{name}');
  });

  it('inserts a participant name containing $-sequences verbatim without leaking the {name} sentinel', () => {
    // A display name is user-controlled. `String.prototype.replace(needle, value)`
    // interprets `$&`/`$$`/`` $` ``/`$'` inside the *replacement value* — so a name
    // like `A$&B` would re-inject the matched `{name}` placeholder into the alert.
    // Routing through `t(key, { name })` (a function replacer) inserts it verbatim.
    const trickyName = "A$&B $$ C$'D";
    render(
      <CallQualityOverlay
        stats={null}
        remoteQualityDegraded
        remoteScreenCapturing
        qualityDegradedParticipantName={trickyName}
        screenCapturingParticipantName={trickyName}
      />,
    );
    const indicator = screen.getByTestId('remote-quality-indicator');
    expect(indicator.getAttribute('aria-label')).toContain(trickyName);
    expect(indicator.getAttribute('aria-label')).not.toContain('{name}');
    expect(screen.getByTestId('screen-capture-pill').textContent).toContain(trickyName);
    expect(screen.getByTestId('screen-capture-pill').textContent).not.toContain('{name}');
  });

  // Vague 131 — the two alerts are about POTENTIALLY DIFFERENT peers in a
  // group call; a single shared name prop could only ever be right for one
  // of them. Each alert must interpolate ITS OWN name independently.
  it('interpolates a DIFFERENT name per alert when the degraded peer and the capturing peer differ', () => {
    render(
      <CallQualityOverlay
        stats={null}
        remoteQualityDegraded
        remoteScreenCapturing
        qualityDegradedParticipantName="Alice"
        screenCapturingParticipantName="Bob"
      />,
    );
    const indicator = screen.getByTestId('remote-quality-indicator');
    expect(indicator.getAttribute('aria-label')).toContain('Alice');
    expect(indicator.getAttribute('aria-label')).not.toContain('Bob');
    const pill = screen.getByTestId('screen-capture-pill');
    expect(pill.textContent).toContain('Bob');
    expect(pill.textContent).not.toContain('Alice');
  });
});

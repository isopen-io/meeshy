import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k, isLoading: false }),
}));

import { CallControls } from '@/components/video-calls/CallControls';

const baseProps = {
  audioEnabled: true,
  videoEnabled: true,
  onToggleAudio: jest.fn(),
  onToggleVideo: jest.fn(),
  onHangUp: jest.fn(),
};

describe('CallControls', () => {
  it('renders as a toolbar', () => {
    render(<CallControls {...baseProps} />);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('shows the auto-paused indicator when video is suspended while wanted', () => {
    render(<CallControls {...baseProps} videoEnabled videoSuspended />);
    expect(screen.getByTestId('video-autopaused-dot')).toBeInTheDocument();
  });

  it('does NOT show the auto-paused indicator when video is healthy', () => {
    render(<CallControls {...baseProps} videoEnabled videoSuspended={false} />);
    expect(screen.queryByTestId('video-autopaused-dot')).not.toBeInTheDocument();
  });

  it('does NOT show the auto-paused indicator when the user turned video off', () => {
    render(<CallControls {...baseProps} videoEnabled={false} videoSuspended />);
    expect(screen.queryByTestId('video-autopaused-dot')).not.toBeInTheDocument();
  });

  it('invokes onToggleVideo when the video button is pressed', () => {
    const onToggleVideo = jest.fn();
    render(<CallControls {...baseProps} onToggleVideo={onToggleVideo} />);
    fireEvent.click(screen.getByTestId('toggle-video'));
    expect(onToggleVideo).toHaveBeenCalledTimes(1);
  });

  // The speaker button used to always render and flip a purely local boolean
  // with zero effect on actual audio output (root cause + fix live in
  // VideoCallInterface/VideoStream — this component is now a dumb presenter).
  // It must render ONLY when the caller (VideoCallInterface) proves there's
  // an alternate output device to route to — same precedent already
  // established here by `onSwitchCamera`/`supportsCameraSwitch`.
  describe('speaker toggle — only rendered when it can actually do something', () => {
    it('does not render when onToggleSpeaker is omitted (unsupported browser / single output device)', () => {
      render(<CallControls {...baseProps} />);
      expect(
        screen.queryByRole('button', { name: 'calls.controls.speakerOff' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'calls.controls.speakerOn' })
      ).not.toBeInTheDocument();
    });

    it('renders and invokes onToggleSpeaker when supplied', () => {
      const onToggleSpeaker = jest.fn();
      render(<CallControls {...baseProps} speakerEnabled onToggleSpeaker={onToggleSpeaker} />);

      const button = screen.getByRole('button', { name: 'calls.controls.speakerOff' });
      fireEvent.click(button);

      expect(onToggleSpeaker).toHaveBeenCalledTimes(1);
    });

    it('reflects speakerEnabled=false in its accessible name', () => {
      render(
        <CallControls {...baseProps} speakerEnabled={false} onToggleSpeaker={jest.fn()} />
      );
      expect(
        screen.getByRole('button', { name: 'calls.controls.speakerOn' })
      ).toBeInTheDocument();
    });
  });
});

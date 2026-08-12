import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k, isLoading: false }),
}));

import { CallControls } from '@/components/video-calls/CallControls';

const baseProps = {
  audioEnabled: true,
  videoEnabled: true,
  speakerEnabled: true,
  onToggleAudio: jest.fn(),
  onToggleVideo: jest.fn(),
  onToggleSpeaker: jest.fn(),
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

  // Regression guard — the speaker button used to flip a local `useState`
  // that nothing downstream ever read, so it never actually muted/unmuted
  // remote audio playback. It must now be a controlled toggle: the parent
  // (which owns the <video> elements playing remote streams) decides what
  // "speaker on/off" means and re-renders the label from its own state.
  it('invokes onToggleSpeaker when the speaker button is pressed, and never manages its own state', () => {
    const onToggleSpeaker = jest.fn();
    render(<CallControls {...baseProps} speakerEnabled onToggleSpeaker={onToggleSpeaker} />);
    const button = screen.getByRole('button', { name: 'controls.speakerOff' });
    fireEvent.click(button);
    expect(onToggleSpeaker).toHaveBeenCalledTimes(1);
    // A controlled component must not flip its own label on click — only a
    // prop change from the parent may do that.
    expect(screen.getByRole('button', { name: 'controls.speakerOff' })).toBeInTheDocument();
  });

  it('reflects speakerEnabled=false via the "speakerOn" (call-to-action) label', () => {
    render(<CallControls {...baseProps} speakerEnabled={false} />);
    expect(screen.getByRole('button', { name: 'controls.speakerOn' })).toBeInTheDocument();
  });
});

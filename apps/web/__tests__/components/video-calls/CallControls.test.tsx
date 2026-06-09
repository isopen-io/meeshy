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
});

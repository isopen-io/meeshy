import { render, screen } from '@testing-library/react';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k, isLoading: false }),
}));

import { LocalVideoTile } from '@/components/video-calls/LocalVideoTile';

const baseProps = {
  stream: null,
  audioEnabled: true,
  videoEnabled: true,
  position: { x: 20, y: 20 },
  isDragging: false,
  onDragStart: jest.fn(),
};

describe('LocalVideoTile', () => {
  it('renders the tile at the given position', () => {
    render(<LocalVideoTile {...baseProps} position={{ x: 40, y: 60 }} />);
    const tile = screen.getByTestId('local-video-tile');
    expect(tile).toHaveStyle({ left: '40px', top: '60px' });
  });

  it('shows the weak-connection paused overlay when video is suspended while wanted', () => {
    render(<LocalVideoTile {...baseProps} videoEnabled videoSuspended />);
    expect(screen.getByTestId('local-video-suspended')).toBeInTheDocument();
  });

  it('does NOT show the paused overlay when not suspended', () => {
    render(<LocalVideoTile {...baseProps} videoEnabled videoSuspended={false} />);
    expect(screen.queryByTestId('local-video-suspended')).not.toBeInTheDocument();
  });

  it('does NOT show the paused overlay when the user turned video off', () => {
    // videoEnabled=false means a deliberate camera-off, not a survival suspend.
    render(<LocalVideoTile {...baseProps} videoEnabled={false} videoSuspended />);
    expect(screen.queryByTestId('local-video-suspended')).not.toBeInTheDocument();
  });

  it('keeps the live video element visible under the banner while suspended — L6-3 freezes the encoder (2 fps), it never stops the track', () => {
    render(<LocalVideoTile {...baseProps} videoEnabled videoSuspended />);
    // Suspended banner is shown as a non-covering hint...
    expect(screen.getByTestId('local-video-suspended')).toBeInTheDocument();
    // ...but the underlying <video> element must stay visible (not the
    // VideoStream "no video" placeholder, which only renders when
    // isVideoEnabled is false) since the camera is still sending frames.
    const video = screen.getByLabelText("you's video");
    expect(video).not.toHaveClass('hidden');
  });
});

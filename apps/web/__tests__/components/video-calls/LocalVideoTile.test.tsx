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
});

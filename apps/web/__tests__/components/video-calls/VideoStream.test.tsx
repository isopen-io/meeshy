import { act } from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k, isLoading: false }),
}));

import { VideoStream } from '@/components/video-calls/VideoStream';

// VideoCallInterface deliberately preserves a peer connection across a
// same-session rejoin (network blip, tab reload) that lands within the 2s
// grace window: it flips `isDisconnected` back to `false` on the SAME
// VideoStream instance (keyed on the stable participantId, never remounted).
// VideoStream must mirror that recovery, not latch the disconnected state.
describe('VideoStream — disconnected overlay tracks isDisconnected both ways', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the disconnected overlay while isDisconnected is true', () => {
    render(<VideoStream stream={null} isDisconnected participantName="Alice" />);
    expect(screen.getByText('calls.stream.disconnected')).toBeInTheDocument();
  });

  it('hides the disconnected overlay again once isDisconnected flips back to false', () => {
    const { rerender } = render(
      <VideoStream stream={null} isDisconnected participantName="Alice" />
    );
    expect(screen.getByText('calls.stream.disconnected')).toBeInTheDocument();

    rerender(<VideoStream stream={null} isDisconnected={false} participantName="Alice" />);

    expect(screen.queryByText('calls.stream.disconnected')).not.toBeInTheDocument();
  });

  it('un-hides the video element once reconnected', () => {
    const { rerender, container } = render(
      <VideoStream stream={null} isDisconnected isVideoEnabled participantName="Alice" />
    );
    const video = container.querySelector('video');
    expect(video?.className).toContain('hidden');

    rerender(
      <VideoStream stream={null} isDisconnected={false} isVideoEnabled participantName="Alice" />
    );

    expect(video?.className).not.toContain('hidden');
  });

  it('cancels the pending onRemove callback when the participant rejoins inside the 2s grace window', () => {
    const onRemove = jest.fn();
    const { rerender } = render(<VideoStream stream={null} isDisconnected onRemove={onRemove} />);

    rerender(<VideoStream stream={null} isDisconnected={false} onRemove={onRemove} />);

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(onRemove).not.toHaveBeenCalled();
  });

  it('still calls onRemove after 2s when the participant stays disconnected', () => {
    const onRemove = jest.fn();
    render(<VideoStream stream={null} isDisconnected onRemove={onRemove} />);

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

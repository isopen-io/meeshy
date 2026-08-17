import { act } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k, isLoading: false }),
}));

// Same convention as DeliveryQueueItemCard.test.tsx — stub the Radix
// primitives to plain elements so the confirm flow is testable without a
// portal, while still exercising the real trigger → content → action wiring.
jest.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  AlertDialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children?: React.ReactNode }) => (
    <button data-testid="alert-dialog-cancel">{children}</button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button data-testid="alert-dialog-action" onClick={onClick}>
      {children}
    </button>
  ),
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
    expect(screen.getByText('stream.disconnected')).toBeInTheDocument();
  });

  it('hides the disconnected overlay again once isDisconnected flips back to false', () => {
    const { rerender } = render(
      <VideoStream stream={null} isDisconnected participantName="Alice" />
    );
    expect(screen.getByText('stream.disconnected')).toBeInTheDocument();

    rerender(<VideoStream stream={null} isDisconnected={false} participantName="Alice" />);

    expect(screen.queryByText('stream.disconnected')).not.toBeInTheDocument();
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

// W6 (`tasks/2026-08-13-group-calls-gap-analysis.md`) — moderator "remove
// from call" control. Callers gate `onKickParticipant` on moderator role +
// group conversation type; VideoStream itself has no opinion on permissions,
// it only renders/wires the control when the prop is present.
describe('VideoStream — moderator kick control (W6)', () => {
  it('does not render a remove-participant control when onKickParticipant is absent', () => {
    render(<VideoStream stream={null} participantName="Alice" />);
    expect(screen.queryByRole('button', { name: 'stream.removeParticipant' })).not.toBeInTheDocument();
  });

  it('renders an accessible remove-participant control when onKickParticipant is provided', () => {
    render(<VideoStream stream={null} participantName="Alice" onKickParticipant={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'stream.removeParticipant' })).toBeInTheDocument();
  });

  it('does not call onKickParticipant merely by opening the confirmation', () => {
    const onKickParticipant = jest.fn();
    render(<VideoStream stream={null} participantName="Alice" onKickParticipant={onKickParticipant} />);
    fireEvent.click(screen.getByRole('button', { name: 'stream.removeParticipant' }));
    expect(onKickParticipant).not.toHaveBeenCalled();
  });

  it('calls onKickParticipant when the confirm action is clicked', () => {
    const onKickParticipant = jest.fn();
    render(<VideoStream stream={null} participantName="Alice" onKickParticipant={onKickParticipant} />);
    fireEvent.click(screen.getByTestId('alert-dialog-action'));
    expect(onKickParticipant).toHaveBeenCalledTimes(1);
  });

  it('does not call onKickParticipant when cancel is clicked', () => {
    const onKickParticipant = jest.fn();
    render(<VideoStream stream={null} participantName="Alice" onKickParticipant={onKickParticipant} />);
    fireEvent.click(screen.getByTestId('alert-dialog-cancel'));
    expect(onKickParticipant).not.toHaveBeenCalled();
  });

  it('stops the trigger click from bubbling to an ancestor fullscreen toggle', () => {
    const onAncestorClick = jest.fn();
    render(
      <div onClick={onAncestorClick}>
        <VideoStream stream={null} participantName="Alice" onKickParticipant={jest.fn()} />
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: 'stream.removeParticipant' }));
    expect(onAncestorClick).not.toHaveBeenCalled();
  });
});

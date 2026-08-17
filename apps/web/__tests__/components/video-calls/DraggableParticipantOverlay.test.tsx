import { render, screen, fireEvent } from '@testing-library/react';

// VideoStream pulls in heavy WebRTC/ref machinery — stub it to a marker node.
// `data-muted` mirrors the real `muted` prop so the speaker-toggle wiring below
// can be asserted without a real <video> element. `data-has-kick` does the
// same for the W6 moderator-kick prop.
jest.mock('@/components/video-calls/VideoStream', () => ({
  VideoStream: (props: { muted?: boolean; onKickParticipant?: () => void }) => (
    <div data-testid="video-stream" data-muted={String(props.muted)} data-has-kick={String(!!props.onKickParticipant)} />
  ),
}));

// t() returns the key so we can assert the accessible name deterministically.
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k, isLoading: false }),
}));

import { DraggableParticipantOverlay } from '@/components/video-calls/DraggableParticipantOverlay';

const renderOverlay = (onDoubleClick = jest.fn()) => {
  const result = render(
    <DraggableParticipantOverlay
      participantId="p1"
      stream={{} as MediaStream}
      participantName="Alice"
      onDoubleClick={onDoubleClick}
    />
  );
  // Fullscreen control only mounts on hover.
  fireEvent.mouseEnter(result.container.firstChild as Element);
  return { onDoubleClick, ...result };
};

describe('DraggableParticipantOverlay — fullscreen control keyboard a11y', () => {
  it('exposes the fullscreen toggle as a focusable button with an accessible name', () => {
    renderOverlay();
    const button = screen.getByRole('button', { name: 'stream.fullscreen' });
    expect(button).toHaveAttribute('tabIndex', '0');
  });

  it('activates fullscreen on Enter', () => {
    const { onDoubleClick } = renderOverlay();
    fireEvent.keyDown(screen.getByRole('button', { name: 'stream.fullscreen' }), {
      key: 'Enter',
    });
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('activates fullscreen on Space', () => {
    const { onDoubleClick } = renderOverlay();
    fireEvent.keyDown(screen.getByRole('button', { name: 'stream.fullscreen' }), {
      key: ' ',
    });
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('does not activate on unrelated keys', () => {
    const { onDoubleClick } = renderOverlay();
    fireEvent.keyDown(screen.getByRole('button', { name: 'stream.fullscreen' }), {
      key: 'a',
    });
    expect(onDoubleClick).not.toHaveBeenCalled();
  });

  it('still activates on click (pointer parity preserved)', () => {
    const { onDoubleClick } = renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'stream.fullscreen' }));
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });
});

describe('DraggableParticipantOverlay — speaker mute threading', () => {
  it('plays audio (unmuted) by default, matching the fullscreen tile', () => {
    render(
      <DraggableParticipantOverlay participantId="p1" stream={{} as MediaStream} participantName="Alice" />
    );
    expect(screen.getByTestId('video-stream')).toHaveAttribute('data-muted', 'false');
  });

  it('forwards muted=true to its VideoStream when the parent turns the speaker off', () => {
    render(
      <DraggableParticipantOverlay
        participantId="p1"
        stream={{} as MediaStream}
        participantName="Alice"
        muted
      />
    );
    expect(screen.getByTestId('video-stream')).toHaveAttribute('data-muted', 'true');
  });
});

describe('DraggableParticipantOverlay — moderator kick threading (W6)', () => {
  it('does not forward a kick control to VideoStream when onKickParticipant is absent', () => {
    render(
      <DraggableParticipantOverlay participantId="p1" stream={{} as MediaStream} participantName="Alice" />
    );
    expect(screen.getByTestId('video-stream')).toHaveAttribute('data-has-kick', 'false');
  });

  it('forwards onKickParticipant to its VideoStream unchanged', () => {
    render(
      <DraggableParticipantOverlay
        participantId="p1"
        stream={{} as MediaStream}
        participantName="Alice"
        onKickParticipant={jest.fn()}
      />
    );
    expect(screen.getByTestId('video-stream')).toHaveAttribute('data-has-kick', 'true');
  });
});

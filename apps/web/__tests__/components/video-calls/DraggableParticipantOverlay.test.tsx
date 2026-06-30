import { render, screen, fireEvent } from '@testing-library/react';

// VideoStream pulls in heavy WebRTC/ref machinery — stub it to a marker node.
jest.mock('@/components/video-calls/VideoStream', () => ({
  VideoStream: () => <div data-testid="video-stream" />,
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
    const button = screen.getByRole('button', { name: 'calls.stream.fullscreen' });
    expect(button).toHaveAttribute('tabIndex', '0');
  });

  it('activates fullscreen on Enter', () => {
    const { onDoubleClick } = renderOverlay();
    fireEvent.keyDown(screen.getByRole('button', { name: 'calls.stream.fullscreen' }), {
      key: 'Enter',
    });
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('activates fullscreen on Space', () => {
    const { onDoubleClick } = renderOverlay();
    fireEvent.keyDown(screen.getByRole('button', { name: 'calls.stream.fullscreen' }), {
      key: ' ',
    });
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it('does not activate on unrelated keys', () => {
    const { onDoubleClick } = renderOverlay();
    fireEvent.keyDown(screen.getByRole('button', { name: 'calls.stream.fullscreen' }), {
      key: 'a',
    });
    expect(onDoubleClick).not.toHaveBeenCalled();
  });

  it('still activates on click (pointer parity preserved)', () => {
    const { onDoubleClick } = renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'calls.stream.fullscreen' }));
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });
});

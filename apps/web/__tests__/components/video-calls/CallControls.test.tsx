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

  // Regression guard — `supportsCameraSwitch` used to be computed ONCE on
  // mount via a bare `enumerateDevices()` call with no `devicechange`
  // listener. A call that starts before camera permission/labels are ready,
  // or a second camera plugged in mid-call (e.g. a USB webcam), could never
  // reveal the switch-camera button for the rest of the call — the stale
  // `false` from mount never re-evaluated.
  describe('camera switch detection stays live (devicechange)', () => {
    const originalMediaDevices = navigator.mediaDevices;

    afterEach(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: originalMediaDevices,
        configurable: true,
      });
    });

    function mockMediaDevices(devicesSequence: MediaDeviceInfo[][]) {
      let call = 0;
      const listeners: Record<string, () => void> = {};
      const enumerateDevices = jest.fn(() => {
        const devices = devicesSequence[Math.min(call, devicesSequence.length - 1)];
        call += 1;
        return Promise.resolve(devices);
      });
      const addEventListener = jest.fn((event: string, cb: () => void) => {
        listeners[event] = cb;
      });
      const removeEventListener = jest.fn();
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { enumerateDevices, addEventListener, removeEventListener },
        configurable: true,
      });
      return {
        fireDeviceChange: () => listeners['devicechange']?.(),
        addEventListener,
        removeEventListener,
      };
    }

    const oneCamera = [{ kind: 'videoinput' } as MediaDeviceInfo];
    const twoCameras = [
      { kind: 'videoinput' } as MediaDeviceInfo,
      { kind: 'videoinput' } as MediaDeviceInfo,
    ];

    it('does not show the switch-camera button while only one camera is known', async () => {
      mockMediaDevices([oneCamera]);
      render(<CallControls {...baseProps} onSwitchCamera={jest.fn()} />);
      await screen.findByRole('toolbar');
      expect(screen.queryByRole('button', { name: 'controls.switchCamera' })).not.toBeInTheDocument();
    });

    it('reveals the switch-camera button once a second camera appears after mount', async () => {
      const { fireDeviceChange } = mockMediaDevices([oneCamera, twoCameras]);
      render(<CallControls {...baseProps} onSwitchCamera={jest.fn()} />);
      await screen.findByRole('toolbar');
      expect(screen.queryByRole('button', { name: 'controls.switchCamera' })).not.toBeInTheDocument();

      fireDeviceChange();

      expect(await screen.findByRole('button', { name: 'controls.switchCamera' })).toBeInTheDocument();
    });

    it('subscribes to and unsubscribes from devicechange with the mount/unmount lifecycle', () => {
      const { addEventListener, removeEventListener } = mockMediaDevices([oneCamera]);
      const { unmount } = render(<CallControls {...baseProps} onSwitchCamera={jest.fn()} />);
      expect(addEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));

      unmount();

      expect(removeEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
    });

    // Some environments (and, notably, a bare mock shape reused elsewhere in
    // this suite) expose `enumerateDevices` without full `EventTarget`
    // support on `mediaDevices`. The initial probe must still run and must
    // not throw for lack of `addEventListener`.
    it('still performs the initial probe and does not throw when mediaDevices has no addEventListener', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { enumerateDevices: jest.fn().mockResolvedValue(twoCameras) },
      });
      expect(() =>
        render(<CallControls {...baseProps} onSwitchCamera={jest.fn()} />)
      ).not.toThrow();

      expect(await screen.findByRole('button', { name: 'controls.switchCamera' })).toBeInTheDocument();
    });
  });
});

import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { AudioPostComposer } from '@/components/v2/AudioPostComposer';

jest.mock('@/components/v2/Button', () => ({
  Button: ({ children, onClick, disabled, ...props }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string; size?: string; className?: string }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

jest.mock('@/components/v2/Avatar', () => ({
  Avatar: () => <div data-testid="avatar" />,
}));

const mockGetUserMedia = jest.fn();
Object.defineProperty(navigator, 'mediaDevices', {
  value: { getUserMedia: mockGetUserMedia },
  writable: true,
});

describe('AudioPostComposer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('renders nothing when not open', () => {
    const { container } = render(
      <AudioPostComposer open={false} onPublish={jest.fn()} onClose={jest.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders idle state when open', () => {
    render(<AudioPostComposer open onPublish={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByTestId('audio-post-composer')).toBeInTheDocument();
    expect(screen.getByText('Audio Post')).toBeInTheDocument();
    expect(screen.getByLabelText('Start recording')).toBeInTheDocument();
    expect(screen.getByText('Tap to record')).toBeInTheDocument();
    expect(screen.getByText('Stereo • Real-time transcription')).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = jest.fn();
    render(<AudioPostComposer open onPublish={jest.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows error when microphone access denied', async () => {
    mockGetUserMedia.mockRejectedValue(new Error('NotAllowedError'));

    render(<AudioPostComposer open onPublish={jest.fn()} onClose={jest.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Start recording'));
    });

    expect(screen.getByText(/Microphone access denied/)).toBeInTheDocument();
  });

  it('requests stereo audio with correct constraints', async () => {
    const mockStream = {
      getTracks: () => [{ stop: jest.fn() }],
    };
    mockGetUserMedia.mockResolvedValue(mockStream);

    // Mock MediaRecorder
    const mockRecorder = {
      start: jest.fn(),
      stop: jest.fn(),
      ondataavailable: null as ((e: { data: Blob }) => void) | null,
      onstop: null as (() => void) | null,
      state: 'inactive',
    };
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = jest.fn(() => mockRecorder);
    (window as unknown as { MediaRecorder: { isTypeSupported: (t: string) => boolean } }).MediaRecorder.isTypeSupported = () => true;

    // Mock AudioContext
    const mockAnalyser = {
      fftSize: 256,
      frequencyBinCount: 128,
      getByteTimeDomainData: jest.fn(),
    };
    const mockSource = { connect: jest.fn() };
    (window as unknown as { AudioContext: unknown }).AudioContext = jest.fn(() => ({
      createMediaStreamSource: () => mockSource,
      createAnalyser: () => mockAnalyser,
      close: jest.fn(),
      sampleRate: 44100,
    }));

    render(<AudioPostComposer open onPublish={jest.fn()} onClose={jest.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Start recording'));
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({
        channelCount: 2,
        sampleRate: 44100,
      }),
    });
  });
});

/**
 * Tests for AudioPostComposer audience selection (Task 3, point 4).
 * `handleAudioPublish` in PostsFeedScreen used to hardcode `visibility:
 * 'PUBLIC'` — this exposes the audience choice on the composer itself
 * (default PUBLIC, same VISIBILITY_OPTIONS/AudienceUserPicker pattern as
 * PostComposer) so it can be forwarded through `onPublish`.
 */
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

type MockRecorder = {
  start: jest.Mock;
  stop: jest.Mock;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  state: string;
};

async function renderInPreview(onPublish: jest.Mock) {
  const mockStream = { getTracks: () => [{ stop: jest.fn() }] };
  mockGetUserMedia.mockResolvedValue(mockStream);

  const mockRecorder: MockRecorder = {
    start: jest.fn(),
    stop: jest.fn(),
    ondataavailable: null,
    onstop: null,
    state: 'recording',
  };
  (window as unknown as { MediaRecorder: unknown }).MediaRecorder = jest.fn(() => mockRecorder);
  (window as unknown as { MediaRecorder: { isTypeSupported: (t: string) => boolean } }).MediaRecorder.isTypeSupported = () => true;

  const mockAnalyser = {
    fftSize: 256,
    frequencyBinCount: 128,
    getByteTimeDomainData: jest.fn(),
  };
  (window as unknown as { AudioContext: unknown }).AudioContext = jest.fn(() => ({
    createMediaStreamSource: () => ({ connect: jest.fn() }),
    createAnalyser: () => mockAnalyser,
    close: jest.fn(),
    sampleRate: 44100,
  }));

  render(<AudioPostComposer open onPublish={onPublish} onClose={jest.fn()} />);

  await act(async () => {
    fireEvent.click(screen.getByLabelText('Start recording'));
  });

  await act(async () => {
    fireEvent.click(screen.getByLabelText('Stop recording'));
    mockRecorder.onstop?.();
  });
}

describe('AudioPostComposer — audience selection', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = jest.fn();
  });

  it('publishes with visibility=PUBLIC and no visibilityUserIds by default', async () => {
    const onPublish = jest.fn();
    await renderInPreview(onPublish);

    fireEvent.click(screen.getByText('Publish'));

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'PUBLIC', visibilityUserIds: undefined }),
    );
  });

  it('shows a visibility picker offering Friends and Private', async () => {
    const onPublish = jest.fn();
    await renderInPreview(onPublish);

    fireEvent.click(screen.getByLabelText('Change visibility'));

    expect(screen.getByText('Friends')).toBeInTheDocument();
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('forwards the selected visibility on publish', async () => {
    const onPublish = jest.fn();
    await renderInPreview(onPublish);

    fireEvent.click(screen.getByLabelText('Change visibility'));
    fireEvent.click(screen.getByText('Friends'));
    fireEvent.click(screen.getByText('Publish'));

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'FRIENDS' }),
    );
  });
});

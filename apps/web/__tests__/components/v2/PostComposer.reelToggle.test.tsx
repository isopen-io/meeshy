/**
 * PostComposer — Reel ⇄ Post toggle (Task 5, P2 web social parity)
 *
 * Source of truth for qualification: `qualifiesAsReel` from
 * `@meeshy/shared/utils/reel-composition` (video/audio >= 3000ms, or >= 2
 * images). Mirrors iOS: when the uploaded composition qualifies, a toggle
 * appears (default REEL, forcible to POST); when it does not, no toggle is
 * shown and the publish payload always carries `type: 'POST'`.
 *
 * Client-side duration-unknown rule: an uploaded video/audio attachment
 * whose `duration` is undefined is treated as NON-qualifying — never
 * promoted to REEL client-side, to avoid a false promise the gateway would
 * silently downgrade.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PostComposer } from '@/components/v2/PostComposer';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

jest.mock('@/components/v2/Avatar', () => ({
  Avatar: () => <div data-testid="avatar" />,
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { authToken: string | null }) => unknown) =>
    selector({ authToken: 'token-123' }),
}));

jest.mock('@/services/attachmentService', () => ({
  AttachmentService: {
    validateFiles: () => ({ valid: true, errors: [] }),
  },
}));

type MockAttachmentState = {
  selectedFiles: File[];
  uploadedAttachments: UploadedAttachmentResponse[];
  isUploading: boolean;
  uploadProgress: Record<number, number>;
};

let mockAttachmentState: MockAttachmentState = {
  selectedFiles: [],
  uploadedAttachments: [],
  isUploading: false,
  uploadProgress: {},
};

jest.mock('@/hooks/composer/useAttachmentUpload', () => ({
  useAttachmentUpload: () => ({
    selectedFiles: mockAttachmentState.selectedFiles,
    uploadedAttachments: mockAttachmentState.uploadedAttachments,
    isUploading: mockAttachmentState.isUploading,
    uploadProgress: mockAttachmentState.uploadProgress,
    handleFilesSelected: jest.fn(),
    handleRemoveFile: jest.fn(),
    clearAttachments: jest.fn(),
  }),
}));

global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

function makeAttachment(overrides: Partial<UploadedAttachmentResponse> = {}): UploadedAttachmentResponse {
  return {
    id: 'att-1',
    messageId: '',
    fileName: 'photo.png',
    originalName: 'photo.png',
    mimeType: 'image/png',
    fileSize: 1024,
    fileUrl: 'https://cdn.test/photo.png',
    uploadedBy: 'user-1',
    isAnonymous: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function expandComposer() {
  fireEvent.focus(screen.getByLabelText('postComposer.contentLabel'));
}

function publish(onPublish: jest.Mock) {
  fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: 'Hello' } });
  fireEvent.click(screen.getByText('publish'));
  return onPublish;
}

describe('PostComposer — Reel ⇄ Post toggle (Task 5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAttachmentState = {
      selectedFiles: [],
      uploadedAttachments: [],
      isUploading: false,
      uploadProgress: {},
    };
  });

  it('shows no toggle and publishes type POST when there is no media', () => {
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    expect(screen.queryByTestId('post-composer-type-toggle')).not.toBeInTheDocument();

    publish(onPublish);
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ type: 'POST' }));
  });

  it('shows no toggle for a single image (the 2→1 removal trap) and publishes POST', () => {
    mockAttachmentState.uploadedAttachments = [makeAttachment({ mimeType: 'image/jpeg' })];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    expect(screen.queryByTestId('post-composer-type-toggle')).not.toBeInTheDocument();

    publish(onPublish);
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ type: 'POST' }));
  });

  it('shows the toggle for two qualifying images and defaults to REEL', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ id: 'att-1', mimeType: 'image/jpeg' }),
      makeAttachment({ id: 'att-2', mimeType: 'image/png' }),
    ];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    expect(screen.getByTestId('post-composer-type-toggle')).toBeInTheDocument();

    publish(onPublish);
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ type: 'REEL' }));
  });

  it('does NOT show the toggle for a video with unknown duration and forces POST', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ mimeType: 'video/mp4', duration: undefined }),
    ];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    expect(screen.queryByTestId('post-composer-type-toggle')).not.toBeInTheDocument();

    publish(onPublish);
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ type: 'POST' }));
  });

  it('does NOT qualify a video at 2999ms (boundary) — no toggle, forces POST', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ mimeType: 'video/mp4', duration: 2999 }),
    ];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    expect(screen.queryByTestId('post-composer-type-toggle')).not.toBeInTheDocument();

    publish(onPublish);
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ type: 'POST' }));
  });

  it('qualifies a video at exactly 3000ms (boundary) — shows the toggle, defaults to REEL', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ mimeType: 'video/mp4', duration: 3000 }),
    ];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    expect(screen.getByTestId('post-composer-type-toggle')).toBeInTheDocument();

    publish(onPublish);
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ type: 'REEL' }));
  });

  it('a qualifying audio attachment also shows the toggle and defaults to REEL', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ mimeType: 'audio/mpeg', duration: 5000 }),
    ];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    expect(screen.getByTestId('post-composer-type-toggle')).toBeInTheDocument();

    publish(onPublish);
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ type: 'REEL' }));
  });

  it('lets the author force POST on a qualifying composition via the toggle', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ id: 'att-1', mimeType: 'image/jpeg' }),
      makeAttachment({ id: 'att-2', mimeType: 'image/png' }),
    ];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    fireEvent.click(screen.getByRole('button', { name: /post as a regular post/i }));
    publish(onPublish);

    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ type: 'POST' }));
  });

  it('lets the author switch back to REEL after forcing POST', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ id: 'att-1', mimeType: 'image/jpeg' }),
      makeAttachment({ id: 'att-2', mimeType: 'image/png' }),
    ];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    fireEvent.click(screen.getByRole('button', { name: /post as a regular post/i }));
    fireEvent.click(screen.getByRole('button', { name: /post as a reel/i }));
    publish(onPublish);

    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ type: 'REEL' }));
  });
});

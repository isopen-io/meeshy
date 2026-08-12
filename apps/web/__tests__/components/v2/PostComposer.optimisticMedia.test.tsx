/**
 * PostComposer — optimisticMedia payoff (Task 4, point 0bis)
 *
 * `useCreatePostMutation` has accepted `optimisticMedia` since Task 3 (it
 * seeds the optimistic post's `media` field so a media-only publish never
 * flashes an empty card) but PostComposer never built it — the mechanism was
 * dormant. `onPublish` must now carry `optimisticMedia` mapped 1:1 from
 * `uploadedAttachments` (id/mimeType/fileUrl/thumbnailUrl/order), same shape
 * PostsFeedScreen.handleAudioPublish already produces for the audio composer.
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
  AttachmentService: { validateFiles: () => ({ valid: true, errors: [] }) },
}));

type MockAttachmentState = { uploadedAttachments: UploadedAttachmentResponse[] };
let mockAttachmentState: MockAttachmentState = { uploadedAttachments: [] };

jest.mock('@/hooks/composer/useAttachmentUpload', () => ({
  useAttachmentUpload: () => ({
    selectedFiles: [],
    uploadedAttachments: mockAttachmentState.uploadedAttachments,
    isUploading: false,
    uploadProgress: {},
    handleFilesSelected: jest.fn(),
    handleRemoveFile: jest.fn(),
    clearAttachments: jest.fn(),
  }),
}));

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

describe('PostComposer — optimisticMedia payoff (Task 4, point 0bis)', () => {
  beforeEach(() => {
    mockAttachmentState = { uploadedAttachments: [] };
  });

  it('builds optimisticMedia from uploadedAttachments (id/mimeType/fileUrl/thumbnailUrl/order)', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ id: 'att-1', mimeType: 'image/png', fileUrl: 'https://cdn.test/1.png', thumbnailUrl: 'https://cdn.test/1-thumb.png' }),
      makeAttachment({ id: 'att-2', mimeType: 'video/mp4', fileUrl: 'https://cdn.test/2.mp4' }),
    ];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();
    fireEvent.click(screen.getByText('publish'));

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        optimisticMedia: [
          { id: 'att-1', mimeType: 'image/png', fileUrl: 'https://cdn.test/1.png', thumbnailUrl: 'https://cdn.test/1-thumb.png', order: 0 },
          { id: 'att-2', mimeType: 'video/mp4', fileUrl: 'https://cdn.test/2.mp4', thumbnailUrl: undefined, order: 1 },
        ],
      }),
    );
  });

  it('carries the raw millisecond duration through optimisticMedia for audio/video attachments', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ id: 'att-1', mimeType: 'audio/webm', fileUrl: 'https://cdn.test/clip.webm', duration: 75000 }),
    ];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();
    fireEvent.click(screen.getByText('publish'));

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        optimisticMedia: [
          expect.objectContaining({ id: 'att-1', mimeType: 'audio/webm', duration: 75000 }),
        ],
      }),
    );
  });

  it('omits optimisticMedia entirely for a text-only publish', () => {
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();
    fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: 'Text only' } });
    fireEvent.click(screen.getByText('publish'));

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ optimisticMedia: undefined }),
    );
  });
});

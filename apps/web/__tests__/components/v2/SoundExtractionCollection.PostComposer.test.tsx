/**
 * C7-UI — collecte de `allowSoundExtraction` (parité web du composer iOS,
 * `MediaAccessibilityStore.allowsSoundExtraction()` + `SoundExtractionToggle`).
 *
 * `Post.allowSoundExtraction` (`schema.prisma:3125`) is a SINGLE flag for the
 * whole post, not a per-media field — one checkbox for the whole attachment
 * list, never one per row, shown only once a video is among the attachments.
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

describe('PostComposer — allowSoundExtraction collection (C7-UI)', () => {
  beforeEach(() => {
    mockAttachmentState = { uploadedAttachments: [] };
  });

  it('does not render the checkbox when no attachment is a video', () => {
    mockAttachmentState.uploadedAttachments = [makeAttachment({ id: 'att-1', mimeType: 'image/png' })];
    render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();

    expect(screen.queryByTestId('media-sound-extraction-checkbox')).not.toBeInTheDocument();
  });

  it('renders the checkbox once a video attachment is present', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ id: 'att-1', mimeType: 'image/png' }),
      makeAttachment({ id: 'att-2', originalName: 'clip.mp4', mimeType: 'video/mp4' }),
    ];
    render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();

    expect(screen.getByTestId('media-sound-extraction-checkbox')).toBeInTheDocument();
  });

  it('defaults unchecked (conservative opt-in)', () => {
    mockAttachmentState.uploadedAttachments = [makeAttachment({ id: 'att-1', mimeType: 'video/mp4' })];
    render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();

    expect(screen.getByTestId('media-sound-extraction-checkbox')).not.toBeChecked();
  });

  it('checking it carries allowSoundExtraction: true in the publish payload', () => {
    mockAttachmentState.uploadedAttachments = [makeAttachment({ id: 'att-1', mimeType: 'video/mp4' })];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    fireEvent.click(screen.getByTestId('media-sound-extraction-checkbox'));
    fireEvent.click(screen.getByText('publish'));

    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ allowSoundExtraction: true }));
  });

  /**
   * `test_untouched rougit si` the payload always sends
   * `allowSoundExtraction: false` even when the author never opened the
   * toggle — an untouched author choice and an explicit "no" are different
   * signals for a partial update.
   */
  it('omits allowSoundExtraction from the publish payload when the toggle was never touched', () => {
    mockAttachmentState.uploadedAttachments = [makeAttachment({ id: 'att-1', mimeType: 'video/mp4' })];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();
    fireEvent.click(screen.getByText('publish'));

    expect(onPublish.mock.calls[0]?.[0]).not.toHaveProperty('allowSoundExtraction');
  });

  it('unchecking after checking sends an explicit false', () => {
    mockAttachmentState.uploadedAttachments = [makeAttachment({ id: 'att-1', mimeType: 'video/mp4' })];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    const checkbox = screen.getByTestId('media-sound-extraction-checkbox');
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText('publish'));

    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ allowSoundExtraction: false }));
  });
});

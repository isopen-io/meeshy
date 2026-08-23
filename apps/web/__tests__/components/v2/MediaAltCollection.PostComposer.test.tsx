/**
 * C7-UI — collecte du texte alternatif par média (parité web du composer
 * iOS, `MediaAccessibilityStore` + `MediaAltTextField`).
 *
 * `mediaAlt: Record<string, string>` traverse déjà le transport
 * (`CreatePostRequest.mediaAlt`, `apps/web/services/posts.service.ts`) mais
 * rien ne le collectait côté UI avant `MediaAccessibilityFields`, monté par
 * `PostComposer` dès qu'au moins un média est uploadé.
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

describe('PostComposer — media alt text collection (C7-UI)', () => {
  beforeEach(() => {
    mockAttachmentState = { uploadedAttachments: [] };
  });

  it('renders one alt input per uploaded attachment', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ id: 'att-1' }),
      makeAttachment({ id: 'att-2', originalName: 'clip.mp4', mimeType: 'video/mp4' }),
    ];
    render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();

    expect(screen.getByTestId('media-alt-input-att-1')).toBeInTheDocument();
    expect(screen.getByTestId('media-alt-input-att-2')).toBeInTheDocument();
  });

  it('renders no accessibility fields block when no media has been uploaded yet', () => {
    render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();

    expect(screen.queryByTestId('media-accessibility-fields')).not.toBeInTheDocument();
  });

  /**
   * `test_typing rougit si` `MediaAccessibilityFields`'s per-attachment
   * inputs share ONE piece of state instead of being keyed by attachment id
   * — typing in one field must never bleed into the other.
   */
  it('keeps each attachment alt text independent', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ id: 'att-1' }),
      makeAttachment({ id: 'att-2', originalName: 'second.png' }),
    ];
    render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();

    fireEvent.change(screen.getByTestId('media-alt-input-att-1'), { target: { value: 'A cat' } });

    expect(screen.getByTestId('media-alt-input-att-1')).toHaveValue('A cat');
    expect(screen.getByTestId('media-alt-input-att-2')).toHaveValue('');
  });

  it('carries mediaAlt in the publish payload, keyed by attachment id', () => {
    mockAttachmentState.uploadedAttachments = [makeAttachment({ id: 'att-1' })];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    fireEvent.change(screen.getByTestId('media-alt-input-att-1'), { target: { value: 'Sunset over the beach' } });
    fireEvent.click(screen.getByText('publish'));

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ mediaAlt: { 'att-1': 'Sunset over the beach' } }),
    );
  });

  /**
   * `test_omitted rougit si` the payload sends `mediaAlt: {}` instead of
   * omitting the key entirely when nothing was typed — an empty object and
   * an absent key are different signals for `CreatePostRequest.mediaAlt`.
   */
  it('omits mediaAlt from the publish payload when nothing was typed', () => {
    mockAttachmentState.uploadedAttachments = [makeAttachment({ id: 'att-1' })];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();
    fireEvent.click(screen.getByText('publish'));

    expect(onPublish.mock.calls[0]?.[0]).not.toHaveProperty('mediaAlt');
  });

  /**
   * `test_pruning rougit si` a media removed from `uploadedAttachments`
   * (upload failure, or the x button before upload settles) leaves its alt
   * text alive in state — a stale id could otherwise resurface if the SAME
   * id were ever reused.
   */
  it('prunes alt text for an attachment that is no longer uploaded', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ id: 'att-1' }),
      makeAttachment({ id: 'att-2', originalName: 'second.png' }),
    ];
    const onPublish = jest.fn();
    const { rerender } = render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    fireEvent.change(screen.getByTestId('media-alt-input-att-1'), { target: { value: 'First' } });
    fireEvent.change(screen.getByTestId('media-alt-input-att-2'), { target: { value: 'Second' } });

    // att-1 disappears from the upload hook's state (removed / failed).
    mockAttachmentState.uploadedAttachments = [makeAttachment({ id: 'att-2', originalName: 'second.png' })];
    rerender(<PostComposer onPublish={onPublish} />);

    fireEvent.click(screen.getByText('publish'));

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ mediaAlt: { 'att-2': 'Second' } }),
    );
  });
});

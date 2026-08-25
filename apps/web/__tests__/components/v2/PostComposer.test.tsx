/**
 * PostComposer — media wiring (Task 1, P0 web social parity)
 *
 * Covers:
 * - hidden photo/video file inputs wired to the shared upload hook
 * - file selection triggers handleFilesSelected
 * - onPublish payload carries mediaIds from uploaded attachments
 * - media-only publish is permitted (no text content required)
 * - publish is disabled while an upload is in progress
 * - client-side 10-media cap disables the buttons and blocks further selection
 * - inline (non-toast) error message for invalid files
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

const mockValidateFiles = jest.fn();
jest.mock('@/services/attachmentService', () => ({
  AttachmentService: {
    validateFiles: (...args: unknown[]) => mockValidateFiles(...args),
  },
}));

const mockHandleFilesSelected = jest.fn();
const mockHandleRemoveFile = jest.fn();
const mockClearAttachments = jest.fn();

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

// Spy-wrapped so tests can assert on the exact options PostComposer passes
// to the hook (notably `maxAttachments` — see the double-count regression
// tests below), while still returning the externally-controlled state.
const mockUseAttachmentUpload = jest.fn((_opts: { token?: string; maxAttachments?: number }) => ({
  selectedFiles: mockAttachmentState.selectedFiles,
  uploadedAttachments: mockAttachmentState.uploadedAttachments,
  isUploading: mockAttachmentState.isUploading,
  uploadProgress: mockAttachmentState.uploadProgress,
  handleFilesSelected: mockHandleFilesSelected,
  handleRemoveFile: mockHandleRemoveFile,
  clearAttachments: mockClearAttachments,
}));

jest.mock('@/hooks/composer/useAttachmentUpload', () => ({
  useAttachmentUpload: (opts: { token?: string; maxAttachments?: number }) => mockUseAttachmentUpload(opts),
}));

// Distinct return values per call (not a fixed string) so the revoke tests
// below can verify the exact URL created for a given File is the one revoked.
let objectUrlCounter = 0;
global.URL.createObjectURL = jest.fn(() => `blob:mock-url-${objectUrlCounter++}`);
global.URL.revokeObjectURL = jest.fn();

function makeFile(name: string, type: string, size = 1024): File {
  return new File([new ArrayBuffer(size)], name, { type });
}

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

describe('PostComposer — media wiring (Task 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    objectUrlCounter = 0;
    mockAttachmentState = {
      selectedFiles: [],
      uploadedAttachments: [],
      isUploading: false,
      uploadProgress: {},
    };
    mockValidateFiles.mockReturnValue({ valid: true, errors: [] });
  });

  it('renders hidden photo and video file inputs with the same accept as StoryComposer', () => {
    const { container } = render(<PostComposer onPublish={jest.fn()} />);
    const imageInput = container.querySelector('input[type="file"][accept="image/*"]');
    const videoInput = container.querySelector('input[type="file"][accept="video/*"]');
    expect(imageInput).toBeInTheDocument();
    expect(imageInput).toHaveClass('hidden');
    expect(videoInput).toBeInTheDocument();
    expect(videoInput).toHaveClass('hidden');
  });

  it('selecting a photo forwards it to the shared upload hook', () => {
    const { container } = render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();
    const imageInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    const file = makeFile('cat.png', 'image/png');

    fireEvent.change(imageInput, { target: { files: [file] } });

    expect(mockHandleFilesSelected).toHaveBeenCalledWith([file]);
  });

  it('selecting a video forwards it to the shared upload hook', () => {
    const { container } = render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();
    const videoInput = container.querySelector('input[type="file"][accept="video/*"]') as HTMLInputElement;
    const file = makeFile('clip.mp4', 'video/mp4');

    fireEvent.change(videoInput, { target: { files: [file] } });

    expect(mockHandleFilesSelected).toHaveBeenCalledWith([file]);
  });

  it('shows the specific upload-hook validation message inline instead of calling the upload hook', () => {
    mockValidateFiles.mockReturnValue({
      valid: false,
      errors: ['huge.png: File too large. Max size: 25 MB'],
    });
    const { container } = render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();
    const imageInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    const file = makeFile('huge.png', 'image/png');

    fireEvent.change(imageInput, { target: { files: [file] } });

    expect(mockHandleFilesSelected).not.toHaveBeenCalled();
    expect(screen.getByTestId('post-composer-media-error')).toHaveTextContent('File too large. Max size: 25 MB');
  });

  it('disables the publish button while an upload is in progress, even with text content', () => {
    mockAttachmentState.isUploading = true;
    render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();
    fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: 'Hello' } });

    expect(screen.getByText('uploading')).toBeDisabled();
  });

  it('permits a media-only publish with no text content', () => {
    mockAttachmentState.uploadedAttachments = [makeAttachment({ id: 'att-1' })];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    const publishButton = screen.getByText('publish');
    expect(publishButton).not.toBeDisabled();
    fireEvent.click(publishButton);

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ content: '', mediaIds: ['att-1'] }),
    );
  });

  it('includes mediaIds from every uploaded attachment alongside text content', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ id: 'att-1' }),
      makeAttachment({ id: 'att-2' }),
    ];
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();
    fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: 'Hello world' } });
    fireEvent.click(screen.getByText('publish'));

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Hello world', mediaIds: ['att-1', 'att-2'] }),
    );
  });

  it('omits mediaIds entirely when no media was uploaded', () => {
    const onPublish = jest.fn();
    render(<PostComposer onPublish={onPublish} />);
    expandComposer();
    fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: 'Text only' } });
    fireEvent.click(screen.getByText('publish'));

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Text only', mediaIds: undefined }),
    );
  });

  it('disables photo/video buttons at the 10-media cap and blocks a further selection', () => {
    mockAttachmentState.selectedFiles = Array.from({ length: 10 }, (_, i) => makeFile(`img-${i}.png`, 'image/png'));
    const { container } = render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();

    expect(screen.getByLabelText('postComposer.addPhoto')).toBeDisabled();
    expect(screen.getByLabelText('postComposer.addVideo')).toBeDisabled();

    const imageInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    fireEvent.change(imageInput, { target: { files: [makeFile('extra.png', 'image/png')] } });

    expect(mockHandleFilesSelected).not.toHaveBeenCalled();
    expect(screen.getByTestId('post-composer-media-error')).toHaveTextContent('10');
  });

  it('wires the remove button on each preview tile to handleRemoveFile', () => {
    mockAttachmentState.selectedFiles = [makeFile('cat.png', 'image/png')];
    render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();

    fireEvent.click(screen.getByLabelText('delete'));

    expect(mockHandleRemoveFile).toHaveBeenCalledWith(0);
  });

  // Task 7, point 2 (review fix) — useAttachmentUpload used to enforce
  // maxAttachments against `selectedFiles.length + uploadedAttachments.length`,
  // double-counting once uploads settled since selectedFiles was never
  // trimmed on success. Now that the hook counts selectedFiles alone as the
  // single source of truth, PostComposer passes MEDIA_LIMIT as-is (no more
  // `* 2` headroom workaround). See PostComposer.mediaCapDoubleCount.test.tsx
  // for the sequential-selection regression test proving the fixed hook lets
  // exactly MEDIA_LIMIT uploads through.
  it('passes MEDIA_LIMIT as-is to the upload hook (no double-count workaround)', () => {
    render(<PostComposer onPublish={jest.fn()} />);

    expect(mockUseAttachmentUpload).toHaveBeenCalledWith(
      expect.objectContaining({ maxAttachments: 10 }),
    );
  });

  it("declares the 'post' upload context — its media travel as PostMedia via TUS, never MessageAttachment", () => {
    render(<PostComposer onPublish={jest.fn()} />);

    expect(mockUseAttachmentUpload).toHaveBeenCalledWith(
      expect.objectContaining({ uploadContext: 'post' }),
    );
  });

  it('sets a cap-reached message and still uploads the files that fit when more are selected than remain', () => {
    mockAttachmentState.selectedFiles = Array.from({ length: 8 }, (_, i) => makeFile(`img-${i}.png`, 'image/png'));
    const { container } = render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();

    const imageInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    const extra = [makeFile('a.png', 'image/png'), makeFile('b.png', 'image/png'), makeFile('c.png', 'image/png')];
    fireEvent.change(imageInput, { target: { files: extra } });

    expect(mockHandleFilesSelected).toHaveBeenCalledWith(extra.slice(0, 2));
    expect(screen.getByTestId('post-composer-media-error')).toHaveTextContent('Only 2 added');
  });

  it('clears the inline media error once a tile is removed', () => {
    mockAttachmentState.selectedFiles = [makeFile('existing.png', 'image/png')];
    mockValidateFiles.mockReturnValue({ valid: false, errors: ['huge.png: File too large. Max size: 25 MB'] });
    const { container } = render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();

    const imageInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    fireEvent.change(imageInput, { target: { files: [makeFile('huge.png', 'image/png')] } });
    expect(screen.getByTestId('post-composer-media-error')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('delete'));

    expect(screen.queryByTestId('post-composer-media-error')).not.toBeInTheDocument();
  });

  // Important #2 (review fix) — URL.createObjectURL was called inline in the
  // render body with no memoization or revocation: every keystroke in the
  // caption re-rendered the preview list and minted a fresh blob URL per
  // image tile, leaking one File reference per keystroke.
  it('creates an object URL for an image preview only once across re-renders (typing does not leak blobs)', () => {
    mockAttachmentState.selectedFiles = [makeFile('cat.png', 'image/png')];
    render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: 'H' } });
    fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: 'He' } });
    fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: 'Hel' } });

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('revokes the object URL for a tile that drops out of selectedFiles', () => {
    const fileA = makeFile('a.png', 'image/png');
    const fileB = makeFile('b.png', 'image/png');
    mockAttachmentState.selectedFiles = [fileA, fileB];
    const { rerender } = render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();

    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    const revokedUrl = (URL.createObjectURL as jest.Mock).mock.results[0].value;

    mockAttachmentState.selectedFiles = [fileB];
    rerender(<PostComposer onPublish={jest.fn()} />);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(revokedUrl);
  });

  it('revokes every cached object URL on unmount', () => {
    mockAttachmentState.selectedFiles = [makeFile('a.png', 'image/png'), makeFile('b.png', 'image/png')];
    const { unmount } = render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();

    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});

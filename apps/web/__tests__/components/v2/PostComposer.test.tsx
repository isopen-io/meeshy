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

jest.mock('@/hooks/composer/useAttachmentUpload', () => ({
  useAttachmentUpload: () => ({
    selectedFiles: mockAttachmentState.selectedFiles,
    uploadedAttachments: mockAttachmentState.uploadedAttachments,
    isUploading: mockAttachmentState.isUploading,
    uploadProgress: mockAttachmentState.uploadProgress,
    handleFilesSelected: mockHandleFilesSelected,
    handleRemoveFile: mockHandleRemoveFile,
    clearAttachments: mockClearAttachments,
  }),
}));

global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url');

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
});

/**
 * Tests for useAttachmentUpload hook
 *
 * Tests cover:
 * - Initial state
 * - File selection and validation
 * - Duplicate file detection
 * - Empty file handling
 * - Attachment limit enforcement
 * - Compression logic
 * - Upload success/failure
 * - Text attachment creation
 * - File removal
 * - Drag and drop handlers
 * - File input handling
 * - Cleanup on clearAttachments
 * - onAttachmentsChange callback
 */

import { renderHook, act, waitFor } from '@testing-library/react';

// Mock toast - define mock object BEFORE jest.mock
const mockToastFns = {
  warning: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  info: jest.fn(),
};

jest.mock('sonner', () => ({
  toast: {
    warning: (...args: unknown[]) => mockToastFns.warning(...args),
    error: (...args: unknown[]) => mockToastFns.error(...args),
    success: (...args: unknown[]) => mockToastFns.success(...args),
    info: (...args: unknown[]) => mockToastFns.info(...args),
  },
}));

// Mock AttachmentService - define mock fns that will be configured in beforeEach
const mockServiceFns = {
  uploadFiles: jest.fn(),
  uploadText: jest.fn(),
  deleteAttachment: jest.fn(),
  validateFiles: jest.fn(),
};

jest.mock('@/services/attachmentService', () => ({
  AttachmentService: {
    uploadFiles: (...args: unknown[]) => mockServiceFns.uploadFiles(...args),
    uploadText: (...args: unknown[]) => mockServiceFns.uploadText(...args),
    deleteAttachment: (...args: unknown[]) => mockServiceFns.deleteAttachment(...args),
    validateFiles: (files: File[]) => mockServiceFns.validateFiles(files),
  },
}));

// Mock media compression utilities
const mockCompressionFns = {
  needsCompression: jest.fn(),
  compressMultipleFiles: jest.fn(),
};

jest.mock('@/utils/media-compression', () => ({
  needsCompression: (file: File) => mockCompressionFns.needsCompression(file),
  compressMultipleFiles: (...args: unknown[]) => mockCompressionFns.compressMultipleFiles(...args),
}));

// Import hook after mocks are set up
import { useAttachmentUpload } from '@/hooks/composer/useAttachmentUpload';

// Helper to create mock files
function createMockFile(
  name: string,
  size: number,
  type: string,
  lastModified?: number
): File {
  const content = new ArrayBuffer(size);
  const blob = new Blob([content], { type });
  return new File([blob], name, { type, lastModified: lastModified || Date.now() });
}

// Helper to create mock uploaded attachment response
function createMockUploadedAttachment(
  id: string,
  originalName: string,
  mimeType: string,
  fileSize: number
) {
  return {
    id,
    originalName,
    mimeType,
    fileSize,
    createdAt: new Date().toISOString(),
    key: `uploads/${id}`,
    url: `https://example.com/uploads/${id}`,
  };
}

describe('useAttachmentUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    mockServiceFns.validateFiles.mockReturnValue({ valid: true, errors: [] });
    mockCompressionFns.needsCompression.mockReturnValue(false);
    mockServiceFns.uploadFiles.mockResolvedValue({
      success: true,
      attachments: [],
    });
    mockServiceFns.uploadText.mockResolvedValue({
      success: true,
      attachment: null,
    });
    mockServiceFns.deleteAttachment.mockResolvedValue({ success: true });

    // Suppress console logs in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return initial state with empty arrays and false flags', () => {
      const { result } = renderHook(() => useAttachmentUpload());

      expect(result.current.selectedFiles).toEqual([]);
      expect(result.current.uploadedAttachments).toEqual([]);
      expect(result.current.isUploading).toBe(false);
      expect(result.current.isCompressing).toBe(false);
      expect(result.current.isDragOver).toBe(false);
      expect(result.current.uploadProgress).toEqual({});
      expect(result.current.compressionProgress).toEqual({});
      expect(result.current.showAttachmentLimitModal).toBe(false);
      expect(result.current.attemptedCount).toBe(0);
    });

    it('should return all handler functions', () => {
      const { result } = renderHook(() => useAttachmentUpload());

      expect(typeof result.current.handleFilesSelected).toBe('function');
      expect(typeof result.current.handleRemoveFile).toBe('function');
      expect(typeof result.current.clearAttachments).toBe('function');
      expect(typeof result.current.handleCreateTextAttachment).toBe('function');
      expect(typeof result.current.handleDragEnter).toBe('function');
      expect(typeof result.current.handleDragLeave).toBe('function');
      expect(typeof result.current.handleDragOver).toBe('function');
      expect(typeof result.current.handleDrop).toBe('function');
      expect(typeof result.current.handleFileInputChange).toBe('function');
      expect(typeof result.current.closeAttachmentLimitModal).toBe('function');
      expect(typeof result.current.handleAttachmentClick).toBe('function');
    });

    it('should provide fileInputRef', () => {
      const { result } = renderHook(() => useAttachmentUpload());

      expect(result.current.fileInputRef).toBeDefined();
      expect(result.current.fileInputRef.current).toBeNull();
    });
  });

  describe('File Selection (handleFilesSelected)', () => {
    it('should do nothing when no files are provided', async () => {
      const { result } = renderHook(() => useAttachmentUpload());

      await act(async () => {
        await result.current.handleFilesSelected([]);
      });

      expect(mockServiceFns.validateFiles).not.toHaveBeenCalled();
      expect(mockServiceFns.uploadFiles).not.toHaveBeenCalled();
    });

    it('should validate files before upload', async () => {
      const mockFile = createMockFile('test.jpg', 1024, 'image/jpeg');
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'test.jpg', 'image/jpeg', 1024)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(mockServiceFns.validateFiles).toHaveBeenCalledWith([mockFile]);
    });

    it('should show error toast when validation fails', async () => {
      const mockFile = createMockFile('test.exe', 1024, 'application/x-msdownload');
      mockServiceFns.validateFiles.mockReturnValue({
        valid: false,
        errors: ['File type not allowed'],
      });

      const { result } = renderHook(() => useAttachmentUpload());

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(mockToastFns.error).toHaveBeenCalledWith('File type not allowed');
      expect(mockServiceFns.uploadFiles).not.toHaveBeenCalled();
    });

    it('should upload files successfully', async () => {
      const mockFile = createMockFile('test.jpg', 1024, 'image/jpeg');
      const mockAttachment = createMockUploadedAttachment('1', 'test.jpg', 'image/jpeg', 1024);

      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [mockAttachment],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(mockServiceFns.uploadFiles).toHaveBeenCalled();
      expect(result.current.uploadedAttachments).toHaveLength(1);
      expect(result.current.uploadedAttachments[0].id).toBe('1');
    });

    it('should set isUploading during upload', async () => {
      const mockFile = createMockFile('test.jpg', 1024, 'image/jpeg');

      let resolveUpload: (value: unknown) => void;
      mockServiceFns.uploadFiles.mockImplementation(() => {
        return new Promise((resolve) => {
          resolveUpload = resolve;
        });
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      // Start upload
      let uploadPromise: Promise<void>;
      act(() => {
        uploadPromise = result.current.handleFilesSelected([mockFile]);
      });

      // Check isUploading is true during upload (set synchronously, before
      // the async client-side duration-extraction pass — Task 7, point 1)
      expect(result.current.isUploading).toBe(true);

      // The (async, even for a non-media file) metadata-build step runs
      // before AttachmentService.uploadFiles is actually invoked.
      await waitFor(() => expect(resolveUpload).toBeDefined());

      // Complete upload
      await act(async () => {
        resolveUpload!({ success: true, attachments: [] });
        await uploadPromise!;
      });

      expect(result.current.isUploading).toBe(false);
    });

    it('should handle upload failure', async () => {
      const mockFile = createMockFile('test.jpg', 1024, 'image/jpeg');
      mockServiceFns.uploadFiles.mockRejectedValue(new Error('Upload failed'));

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(mockToastFns.error).toHaveBeenCalledWith('Upload failed: Upload failed');
    });
  });

  describe('Rollback on media upload failure (Task 7, point 3)', () => {
    it('reverts selectedFiles to its prior length when an image/video upload fails, symmetric with the text-attachment path', async () => {
      const mockFile = createMockFile('photo.jpg', 1024, 'image/jpeg');
      mockServiceFns.uploadFiles.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(result.current.selectedFiles).toHaveLength(0);
      expect(result.current.uploadedAttachments).toHaveLength(0);
    });

    it('only rolls back the files from the failed selection, keeping previously uploaded ones intact', async () => {
      const firstFile = createMockFile('first.jpg', 1024, 'image/jpeg', 1);
      mockServiceFns.uploadFiles.mockResolvedValueOnce({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'first.jpg', 'image/jpeg', 1024)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([firstFile]);
      });

      expect(result.current.selectedFiles).toHaveLength(1);

      const secondFile = createMockFile('second.jpg', 1024, 'image/jpeg', 2);
      mockServiceFns.uploadFiles.mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        await result.current.handleFilesSelected([secondFile]);
      });

      expect(result.current.selectedFiles).toEqual([firstFile]);
      expect(result.current.uploadedAttachments).toHaveLength(1);
    });

    it('allows re-selecting a file after its upload failed and was rolled back (no phantom duplicate)', async () => {
      const mockFile = createMockFile('retry.jpg', 1024, 'image/jpeg', 1);
      mockServiceFns.uploadFiles.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(result.current.selectedFiles).toHaveLength(0);

      mockServiceFns.uploadFiles.mockResolvedValueOnce({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'retry.jpg', 'image/jpeg', 1024)],
      });

      await act(async () => {
        await result.current.handleFilesSelected([createMockFile('retry.jpg', 1024, 'image/jpeg', 1)]);
      });

      expect(mockToastFns.warning).not.toHaveBeenCalled();
      expect(result.current.uploadedAttachments).toHaveLength(1);
    });
  });

  describe('Reconciling the gateway silent-failure shape (review Important #2)', () => {
    it('rolls back selectedFiles and sets uploadError when the server drops every file (success:true, attachments: [])', async () => {
      const mockFile = createMockFile('photo.jpg', 1024, 'image/jpeg');
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(result.current.selectedFiles).toHaveLength(0);
      expect(result.current.uploadedAttachments).toHaveLength(0);
      expect(result.current.uploadError).toEqual(expect.any(String));
      expect(mockToastFns.error).toHaveBeenCalled();
    });

    it('rolls back only the unmatched file when the server silently drops SOME files (success:true, shortened attachments)', async () => {
      const keptFile = createMockFile('kept.jpg', 1024, 'image/jpeg', 1);
      const droppedFile = createMockFile('dropped.jpg', 1024, 'image/jpeg', 2);
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'kept.jpg', 'image/jpeg', 1024)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([keptFile, droppedFile]);
      });

      expect(result.current.selectedFiles).toEqual([keptFile]);
      expect(result.current.uploadedAttachments).toHaveLength(1);
      expect(result.current.uploadError).toEqual(expect.any(String));
    });

    it('fires the additive onUploadError callback for a silent partial failure', async () => {
      const onUploadError = jest.fn();
      const keptFile = createMockFile('kept.jpg', 1024, 'image/jpeg', 1);
      const droppedFile = createMockFile('dropped.jpg', 1024, 'image/jpeg', 2);
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'kept.jpg', 'image/jpeg', 1024)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token', onUploadError }));

      await act(async () => {
        await result.current.handleFilesSelected([keptFile, droppedFile]);
      });

      expect(onUploadError).toHaveBeenCalledWith(expect.any(String));
    });

    it('does not set uploadError or roll back anything when every file is echoed back', async () => {
      const mockFile = createMockFile('photo.jpg', 1024, 'image/jpeg');
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'photo.jpg', 'image/jpeg', 1024)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(result.current.selectedFiles).toEqual([mockFile]);
      expect(result.current.uploadError).toBeNull();
      expect(mockToastFns.error).not.toHaveBeenCalled();
    });

    it('reconciles the swallow shape inside a batch (uploadFilesInBatches path)', async () => {
      // batchSize defaults to 10: 11 files -> batch 1 = img-0..img-9 (all succeed),
      // batch 2 = img-10 alone, silently dropped by the gateway (success:true, attachments: []).
      const files = Array.from({ length: 11 }, (_, i) => createMockFile(`img-${i}.jpg`, 1024, 'image/jpeg', 1000 + i));
      mockServiceFns.uploadFiles
        .mockResolvedValueOnce({
          success: true,
          attachments: files.slice(0, 10).map((f, i) => createMockUploadedAttachment(`${i}`, f.name, 'image/jpeg', 1024)),
        })
        .mockResolvedValueOnce({
          success: true,
          attachments: [],
        });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token', maxAttachments: 20 }));

      await act(async () => {
        await result.current.handleFilesSelected(files);
      });

      expect(result.current.selectedFiles).toHaveLength(10);
      expect(result.current.selectedFiles.map((f) => f.name)).not.toContain('img-10.jpg');
      expect(result.current.uploadedAttachments).toHaveLength(10);
      expect(result.current.uploadError).toEqual(expect.any(String));
    });
  });

  describe('Upload error exposure (Task 7, point 4)', () => {
    it('exposes the failure message via uploadError while still emitting the existing toast', async () => {
      const mockFile = createMockFile('photo.jpg', 1024, 'image/jpeg');
      mockServiceFns.uploadFiles.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(result.current.uploadError).toBe('Network error');
      expect(mockToastFns.error).toHaveBeenCalledWith('Upload failed: Network error');
    });

    it('calls the additive onUploadError callback with the failure message', async () => {
      const onUploadError = jest.fn();
      const mockFile = createMockFile('photo.jpg', 1024, 'image/jpeg');
      mockServiceFns.uploadFiles.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token', onUploadError }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(onUploadError).toHaveBeenCalledWith('Network error');
    });

    it('does not populate uploadError and never calls onUploadError on a successful upload', async () => {
      const onUploadError = jest.fn();
      const mockFile = createMockFile('photo.jpg', 1024, 'image/jpeg');
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'photo.jpg', 'image/jpeg', 1024)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token', onUploadError }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(result.current.uploadError).toBeNull();
      expect(onUploadError).not.toHaveBeenCalled();
    });

    it('clears a stale uploadError once a new selection succeeds', async () => {
      const mockFile = createMockFile('photo.jpg', 1024, 'image/jpeg');
      mockServiceFns.uploadFiles.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(result.current.uploadError).toBe('Network error');

      mockServiceFns.uploadFiles.mockResolvedValueOnce({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'photo2.jpg', 'image/jpeg', 1024)],
      });

      await act(async () => {
        await result.current.handleFilesSelected([createMockFile('photo2.jpg', 1024, 'image/jpeg', 2)]);
      });

      expect(result.current.uploadError).toBeNull();
    });

    it('clears uploadError on clearAttachments', async () => {
      const mockFile = createMockFile('photo.jpg', 1024, 'image/jpeg');
      mockServiceFns.uploadFiles.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(result.current.uploadError).toBe('Network error');

      act(() => {
        result.current.clearAttachments();
      });

      expect(result.current.uploadError).toBeNull();
    });
  });

  describe('Media Duration Extraction (Task 7, point 1)', () => {
    const realCreateElement = document.createElement.bind(document);

    type FakeMediaElement = {
      preload: string;
      src: string;
      duration: number | undefined;
      addEventListener: (event: string, cb: () => void) => void;
      removeEventListener: (event: string, cb: () => void) => void;
    };

    function mockMediaElement({ duration, shouldError = false }: { duration?: number; shouldError?: boolean }) {
      return jest.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
        if (tagName !== 'video' && tagName !== 'audio') {
          return realCreateElement(tagName);
        }
        const listeners: Record<string, Array<() => void>> = {};
        const fakeElement: FakeMediaElement = {
          preload: '',
          src: '',
          duration,
          addEventListener: (event, cb) => {
            listeners[event] = listeners[event] || [];
            listeners[event].push(cb);
          },
          removeEventListener: (event, cb) => {
            listeners[event] = (listeners[event] || []).filter((l) => l !== cb);
          },
        };
        queueMicrotask(() => {
          const eventName = shouldError ? 'error' : 'loadedmetadata';
          (listeners[eventName] || []).forEach((cb) => cb());
        });
        return fakeElement as unknown as HTMLElement;
      }) as typeof document.createElement);
    }

    beforeEach(() => {
      global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-media-url');
      global.URL.revokeObjectURL = jest.fn();
    });

    it('attaches the extracted duration (ms) to the metadata sent for a video file', async () => {
      mockMediaElement({ duration: 12.5 });
      const videoFile = createMockFile('clip.mp4', 2048, 'video/mp4');
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'clip.mp4', 'video/mp4', 2048)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([videoFile]);
      });

      expect(mockServiceFns.uploadFiles).toHaveBeenCalledWith(
        [videoFile],
        'test-token',
        [expect.objectContaining({ duration: 12500 })],
        expect.any(Function),
      );
    });

    it('attaches the extracted duration (ms) to the metadata sent for an audio file', async () => {
      mockMediaElement({ duration: 3 });
      const audioFile = createMockFile('voice.mp3', 512, 'audio/mpeg');
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'voice.mp3', 'audio/mpeg', 512)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([audioFile]);
      });

      expect(mockServiceFns.uploadFiles).toHaveBeenCalledWith(
        [audioFile],
        'test-token',
        [expect.objectContaining({ duration: 3000 })],
        expect.any(Function),
      );
    });

    it('does not build a metadata array for image-only selections', async () => {
      const imageFile = createMockFile('pic.jpg', 1024, 'image/jpeg');
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'pic.jpg', 'image/jpeg', 1024)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([imageFile]);
      });

      const callArgs = mockServiceFns.uploadFiles.mock.calls[0];
      expect(callArgs[2]).toBeUndefined();
    });

    it('uploads a video without a duration (never blocks) when extraction errors out', async () => {
      mockMediaElement({ shouldError: true });
      const videoFile = createMockFile('broken.mp4', 2048, 'video/mp4');
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'broken.mp4', 'video/mp4', 2048)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([videoFile]);
      });

      expect(mockServiceFns.uploadFiles).toHaveBeenCalled();
      const [, , metadataArray] = mockServiceFns.uploadFiles.mock.calls[0];
      expect(metadataArray?.[0]?.duration).toBeUndefined();
      expect(result.current.uploadedAttachments).toHaveLength(1);
    });

    it('merges the extracted duration into caller-provided metadata without dropping existing fields', async () => {
      mockMediaElement({ duration: 5 });
      const audioFile = createMockFile('recorded.webm', 512, 'audio/webm');
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'recorded.webm', 'audio/webm', 512)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([audioFile], [{ audioEffectsTimeline: { events: [] } }]);
      });

      const [, , metadataArray] = mockServiceFns.uploadFiles.mock.calls[0];
      expect(metadataArray[0]).toEqual({ audioEffectsTimeline: { events: [] }, duration: 5000 });
    });
  });

  describe('Duplicate Detection', () => {
    it('should filter out duplicate files', async () => {
      const mockFile1 = createMockFile('test.jpg', 1024, 'image/jpeg', 1000);
      const mockAttachment = createMockUploadedAttachment('1', 'test.jpg', 'image/jpeg', 1024);

      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [mockAttachment],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      // First upload
      await act(async () => {
        await result.current.handleFilesSelected([mockFile1]);
      });

      expect(result.current.selectedFiles).toHaveLength(1);

      // Try to upload same file again (same name, size, lastModified)
      const duplicateFile = createMockFile('test.jpg', 1024, 'image/jpeg', 1000);

      await act(async () => {
        await result.current.handleFilesSelected([duplicateFile]);
      });

      // Should show warning for duplicate
      expect(mockToastFns.warning).toHaveBeenCalled();
    });

    it('should show warning toast for duplicate files using translation function', async () => {
      const mockT = jest.fn((key: string) => key);
      const mockFile1 = createMockFile('test.jpg', 1024, 'image/jpeg', 1000);
      const mockAttachment = createMockUploadedAttachment('1', 'test.jpg', 'image/jpeg', 1024);

      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [mockAttachment],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token', t: mockT }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile1]);
      });

      // Try duplicate
      await act(async () => {
        await result.current.handleFilesSelected([createMockFile('test.jpg', 1024, 'image/jpeg', 1000)]);
      });

      expect(mockT).toHaveBeenCalledWith('attachmentDuplicate.single');
    });
  });

  describe('Empty File Handling', () => {
    it('should reject empty files', async () => {
      const emptyFile = createMockFile('empty.jpg', 0, 'image/jpeg');

      const { result } = renderHook(() => useAttachmentUpload());

      await act(async () => {
        await result.current.handleFilesSelected([emptyFile]);
      });

      expect(mockToastFns.error).toHaveBeenCalled();
      expect(mockServiceFns.uploadFiles).not.toHaveBeenCalled();
    });

    it('should filter out empty files and continue with non-empty files', async () => {
      const emptyFile = createMockFile('empty.jpg', 0, 'image/jpeg');
      const validFile = createMockFile('valid.jpg', 1024, 'image/jpeg');

      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'valid.jpg', 'image/jpeg', 1024)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([emptyFile, validFile]);
      });

      expect(mockToastFns.error).toHaveBeenCalled();
      expect(mockServiceFns.uploadFiles).toHaveBeenCalled();
    });
  });

  describe('Attachment Limit', () => {
    it('should show modal when exceeding max attachments', async () => {
      const mockFile = createMockFile('test.jpg', 1024, 'image/jpeg');

      const { result } = renderHook(() =>
        useAttachmentUpload({ maxAttachments: 1 })
      );

      // Fill to max
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'test.jpg', 'image/jpeg', 1024)],
      });

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      // Try to add more
      const anotherFile = createMockFile('test2.jpg', 1024, 'image/jpeg');

      await act(async () => {
        await result.current.handleFilesSelected([anotherFile]);
      });

      expect(result.current.showAttachmentLimitModal).toBe(true);
      // attemptedCount uses selectedFiles as the single source of truth
      // (Task 7, point 2 — no more double-count against uploadedAttachments):
      // 1 already selected + 1 new = 2.
      expect(result.current.attemptedCount).toBe(2);
    });

    it('should close modal and reset count', async () => {
      const mockFile = createMockFile('test.jpg', 1024, 'image/jpeg');

      const { result } = renderHook(() =>
        useAttachmentUpload({ maxAttachments: 1 })
      );

      // Fill to max
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'test.jpg', 'image/jpeg', 1024)],
      });

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      // Try to add more to trigger modal
      await act(async () => {
        await result.current.handleFilesSelected([createMockFile('test2.jpg', 1024, 'image/jpeg')]);
      });

      expect(result.current.showAttachmentLimitModal).toBe(true);

      // Close modal
      act(() => {
        result.current.closeAttachmentLimitModal();
      });

      expect(result.current.showAttachmentLimitModal).toBe(false);
      expect(result.current.attemptedCount).toBe(0);
    });

    it('lets exactly maxAttachments sequential single-file uploads succeed without doubling the count (Task 7, point 2)', async () => {
      const { result } = renderHook(() => useAttachmentUpload({ maxAttachments: 3 }));

      for (let i = 0; i < 3; i += 1) {
        mockServiceFns.uploadFiles.mockResolvedValueOnce({
          success: true,
          attachments: [createMockUploadedAttachment(`${i}`, `img-${i}.jpg`, 'image/jpeg', 1024)],
        });

        await act(async () => {
          await result.current.handleFilesSelected([createMockFile(`img-${i}.jpg`, 1024, 'image/jpeg', 1000 + i)]);
        });
      }

      expect(result.current.showAttachmentLimitModal).toBe(false);
      expect(result.current.uploadedAttachments).toHaveLength(3);

      // A 4th file must now be rejected by the cap — if the hook still
      // double-counted (selectedFiles + uploadedAttachments), the cap would
      // already have been hit after the 2nd file (2 + 2 = 4 > 3).
      await act(async () => {
        await result.current.handleFilesSelected([createMockFile('img-3.jpg', 1024, 'image/jpeg', 2000)]);
      });

      expect(result.current.showAttachmentLimitModal).toBe(true);
    });

    it('should use default max of 50 attachments', async () => {
      const { result } = renderHook(() => useAttachmentUpload());

      // The default is 50, so uploading 51 files should trigger the modal
      // We test this indirectly by checking that 50 files would be accepted
      const files = Array.from({ length: 50 }, (_, i) =>
        createMockFile(`test${i}.jpg`, 100, 'image/jpeg', Date.now() + i)
      );

      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: files.map((f, i) =>
          createMockUploadedAttachment(`${i}`, f.name, 'image/jpeg', 100)
        ),
      });

      await act(async () => {
        await result.current.handleFilesSelected(files);
      });

      expect(result.current.showAttachmentLimitModal).toBe(false);
    });
  });

  describe('Compression', () => {
    it('should compress files that need compression', async () => {
      const mockFile = createMockFile('large.jpg', 10 * 1024 * 1024, 'image/jpeg');
      const compressedFile = createMockFile('large.jpg', 1 * 1024 * 1024, 'image/jpeg');

      mockCompressionFns.needsCompression.mockReturnValue(true);
      mockCompressionFns.compressMultipleFiles.mockResolvedValue([compressedFile]);
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'large.jpg', 'image/jpeg', 1024 * 1024)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(mockCompressionFns.compressMultipleFiles).toHaveBeenCalled();
      expect(mockToastFns.success).toHaveBeenCalled();
    });

    it('should set isCompressing during compression', async () => {
      const mockFile = createMockFile('large.jpg', 10 * 1024 * 1024, 'image/jpeg');

      mockCompressionFns.needsCompression.mockReturnValue(true);

      let resolveCompression: (value: unknown) => void;
      mockCompressionFns.compressMultipleFiles.mockImplementation(() => {
        return new Promise((resolve) => {
          resolveCompression = resolve;
        });
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      // Start selection (which triggers compression)
      let selectPromise: Promise<void>;
      act(() => {
        selectPromise = result.current.handleFilesSelected([mockFile]);
      });

      // Check isCompressing is true
      expect(result.current.isCompressing).toBe(true);

      // Complete compression
      await act(async () => {
        resolveCompression!([mockFile]);
        mockServiceFns.uploadFiles.mockResolvedValue({ success: true, attachments: [] });
        await selectPromise!;
      });

      expect(result.current.isCompressing).toBe(false);
    });

    it('should handle compression failure gracefully', async () => {
      const mockFile = createMockFile('large.jpg', 10 * 1024 * 1024, 'image/jpeg');

      mockCompressionFns.needsCompression.mockReturnValue(true);
      mockCompressionFns.compressMultipleFiles.mockRejectedValue(new Error('Compression failed'));
      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'large.jpg', 'image/jpeg', 10 * 1024 * 1024)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(mockToastFns.error).toHaveBeenCalledWith('Erreur lors de la compression, fichiers originaux utilisés');
    });
  });

  describe('Text Attachment (handleCreateTextAttachment)', () => {
    it('should do nothing for empty text', async () => {
      const { result } = renderHook(() => useAttachmentUpload());

      await act(async () => {
        await result.current.handleCreateTextAttachment('');
      });

      expect(mockServiceFns.uploadText).not.toHaveBeenCalled();
    });

    it('should upload text attachment', async () => {
      const mockTextAttachment = createMockUploadedAttachment(
        '1',
        'presspaper-content-20240101-120000.txt',
        'text/plain',
        100
      );
      mockServiceFns.uploadText.mockResolvedValue({
        success: true,
        attachment: mockTextAttachment,
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleCreateTextAttachment('Test content');
      });

      expect(mockServiceFns.uploadText).toHaveBeenCalledWith('Test content', 'test-token');
      expect(result.current.uploadedAttachments).toHaveLength(1);
    });

    it('should revert selectedFiles on text attachment failure', async () => {
      mockServiceFns.uploadText.mockRejectedValue(new Error('Upload failed'));

      const { result } = renderHook(() => useAttachmentUpload());

      await act(async () => {
        await result.current.handleCreateTextAttachment('Test content');
      });

      // The text file should be removed from selectedFiles on error
      expect(result.current.selectedFiles).toHaveLength(0);
    });
  });

  describe('File Removal (handleRemoveFile)', () => {
    it('should remove file at specified index', async () => {
      const mockFile = createMockFile('test.jpg', 1024, 'image/jpeg');
      const mockAttachment = createMockUploadedAttachment('1', 'test.jpg', 'image/jpeg', 1024);

      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [mockAttachment],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(result.current.uploadedAttachments).toHaveLength(1);

      await act(async () => {
        await result.current.handleRemoveFile(0);
      });

      expect(mockServiceFns.deleteAttachment).toHaveBeenCalledWith('1', 'test-token');
      expect(result.current.selectedFiles).toHaveLength(0);
      expect(result.current.uploadedAttachments).toHaveLength(0);
    });

    it('should show error toast on deletion failure', async () => {
      const mockFile = createMockFile('test.jpg', 1024, 'image/jpeg');
      const mockAttachment = createMockUploadedAttachment('1', 'test.jpg', 'image/jpeg', 1024);

      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [mockAttachment],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      mockServiceFns.deleteAttachment.mockRejectedValue(new Error('Delete failed'));

      await act(async () => {
        await result.current.handleRemoveFile(0);
      });

      expect(mockToastFns.error).toHaveBeenCalledWith('Impossible de supprimer le fichier');
      // Files should still be there since deletion failed
      expect(result.current.uploadedAttachments).toHaveLength(1);
    });
  });

  describe('Clear Attachments', () => {
    it('should clear all state', async () => {
      const mockFile = createMockFile('test.jpg', 1024, 'image/jpeg');
      const mockAttachment = createMockUploadedAttachment('1', 'test.jpg', 'image/jpeg', 1024);

      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [mockAttachment],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      expect(result.current.selectedFiles).toHaveLength(1);
      expect(result.current.uploadedAttachments).toHaveLength(1);

      act(() => {
        result.current.clearAttachments();
      });

      expect(result.current.selectedFiles).toEqual([]);
      expect(result.current.uploadedAttachments).toEqual([]);
      expect(result.current.uploadProgress).toEqual({});
    });
  });

  describe('Drag and Drop Handlers', () => {
    const createDragEvent = (type: string, files: File[] = []) => {
      const event = {
        type,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        dataTransfer: {
          files,
        },
      } as unknown as React.DragEvent;
      return event;
    };

    it('should set isDragOver true on drag enter', () => {
      const { result } = renderHook(() => useAttachmentUpload());

      act(() => {
        result.current.handleDragEnter(createDragEvent('dragenter'));
      });

      expect(result.current.isDragOver).toBe(true);
    });

    it('should set isDragOver false on drag leave', () => {
      const { result } = renderHook(() => useAttachmentUpload());

      act(() => {
        result.current.handleDragEnter(createDragEvent('dragenter'));
      });

      expect(result.current.isDragOver).toBe(true);

      act(() => {
        result.current.handleDragLeave(createDragEvent('dragleave'));
      });

      expect(result.current.isDragOver).toBe(false);
    });

    it('should prevent default on drag over', () => {
      const { result } = renderHook(() => useAttachmentUpload());

      const event = createDragEvent('dragover');

      act(() => {
        result.current.handleDragOver(event);
      });

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('should handle drop and process files', async () => {
      const mockFile = createMockFile('dropped.jpg', 1024, 'image/jpeg');

      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'dropped.jpg', 'image/jpeg', 1024)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      const event = createDragEvent('drop', [mockFile]);

      await act(async () => {
        await result.current.handleDrop(event);
      });

      expect(event.preventDefault).toHaveBeenCalled();
      expect(result.current.isDragOver).toBe(false);
      expect(mockServiceFns.uploadFiles).toHaveBeenCalled();
    });
  });

  describe('File Input Handler', () => {
    it('should process files from input and clear input value', async () => {
      const mockFile = createMockFile('input.jpg', 1024, 'image/jpeg');

      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [createMockUploadedAttachment('1', 'input.jpg', 'image/jpeg', 1024)],
      });

      const { result } = renderHook(() => useAttachmentUpload({ token: 'test-token' }));

      const mockInputEvent = {
        target: {
          files: [mockFile],
          value: 'C:\\fakepath\\input.jpg',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      // Use fake timers to handle setTimeout in handleFileInputChange
      // Use real timers for async operations (promises, setTimeout, etc.)
    jest.useRealTimers();

      act(() => {
        result.current.handleFileInputChange(mockInputEvent);
      });

      // Input value should be cleared
      expect(mockInputEvent.target.value).toBe('');

      // Advance timers to trigger setTimeout
      await act(async () => {
        jest.advanceTimersByTime(0);
      });

      // Wait for upload to complete
      await act(async () => {
        await Promise.resolve();
      });

      jest.useRealTimers();
    });

    it('should handle null files gracefully', () => {
      const { result } = renderHook(() => useAttachmentUpload());

      const mockInputEvent = {
        target: {
          files: null,
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      // Use real timers for async operations (promises, setTimeout, etc.)
    jest.useRealTimers();

      act(() => {
        result.current.handleFileInputChange(mockInputEvent);
      });

      act(() => {
        jest.advanceTimersByTime(0);
      });

      jest.useRealTimers();

      // Should not throw
      expect(mockServiceFns.uploadFiles).not.toHaveBeenCalled();
    });
  });

  describe('Attachment Button Click', () => {
    it('should trigger click on file input ref', () => {
      const { result } = renderHook(() => useAttachmentUpload());

      // Create a mock input element
      const mockClick = jest.fn();
      const mockInput = { click: mockClick } as unknown as HTMLInputElement;

      // Manually set the ref
      (result.current.fileInputRef as any).current = mockInput;

      act(() => {
        result.current.handleAttachmentClick();
      });

      expect(mockClick).toHaveBeenCalled();
    });
  });

  describe('onAttachmentsChange Callback', () => {
    it('should call callback when attachments change', async () => {
      const onAttachmentsChange = jest.fn();
      const mockFile = createMockFile('test.jpg', 1024, 'image/jpeg');
      const mockAttachment = createMockUploadedAttachment('1', 'test.jpg', 'image/jpeg', 1024);

      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [mockAttachment],
      });

      const { result } = renderHook(() =>
        useAttachmentUpload({ token: 'test-token', onAttachmentsChange })
      );

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      await waitFor(() => {
        expect(onAttachmentsChange).toHaveBeenCalledWith(['1'], ['image/jpeg']);
      });
    });

    it('should not call callback if IDs have not changed', async () => {
      const onAttachmentsChange = jest.fn();
      const mockFile = createMockFile('test.jpg', 1024, 'image/jpeg');
      const mockAttachment = createMockUploadedAttachment('1', 'test.jpg', 'image/jpeg', 1024);

      mockServiceFns.uploadFiles.mockResolvedValue({
        success: true,
        attachments: [mockAttachment],
      });

      const { result, rerender } = renderHook(() =>
        useAttachmentUpload({ token: 'test-token', onAttachmentsChange })
      );

      await act(async () => {
        await result.current.handleFilesSelected([mockFile]);
      });

      const callCount = onAttachmentsChange.mock.calls.length;

      // Re-render without changing attachments
      rerender();

      // Callback should not be called again
      expect(onAttachmentsChange.mock.calls.length).toBe(callCount);
    });
  });

  describe('Handler Stability', () => {
    it('should return stable handler references', () => {
      const { result, rerender } = renderHook(() => useAttachmentUpload());

      const firstHandlers = {
        handleFilesSelected: result.current.handleFilesSelected,
        handleRemoveFile: result.current.handleRemoveFile,
        clearAttachments: result.current.clearAttachments,
        handleDragEnter: result.current.handleDragEnter,
        handleDragLeave: result.current.handleDragLeave,
        handleDragOver: result.current.handleDragOver,
        closeAttachmentLimitModal: result.current.closeAttachmentLimitModal,
        handleAttachmentClick: result.current.handleAttachmentClick,
      };

      rerender();

      expect(result.current.handleDragEnter).toBe(firstHandlers.handleDragEnter);
      expect(result.current.handleDragLeave).toBe(firstHandlers.handleDragLeave);
      expect(result.current.handleDragOver).toBe(firstHandlers.handleDragOver);
      expect(result.current.clearAttachments).toBe(firstHandlers.clearAttachments);
      expect(result.current.closeAttachmentLimitModal).toBe(firstHandlers.closeAttachmentLimitModal);
      expect(result.current.handleAttachmentClick).toBe(firstHandlers.handleAttachmentClick);
    });
  });
});

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

      // Check isUploading is true during upload
      expect(result.current.isUploading).toBe(true);

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
      // attemptedCount is total: 1 selected + 1 uploaded + 1 new = 3
      expect(result.current.attemptedCount).toBe(3);
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
      jest.useFakeTimers();

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

      jest.useFakeTimers();

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

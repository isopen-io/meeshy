import { renderHook, act, waitFor } from '@testing-library/react';
import { useAttachmentUpload } from '@/hooks/composer/useAttachmentUpload';
import { AttachmentService } from '@/services/attachmentService';

// Mock dependencies
jest.mock('@/services/attachmentService');
jest.mock('@/utils/media-compression', () => ({
  compressMultipleFiles: jest.fn((files) => Promise.resolve(files)),
  needsCompression: jest.fn(() => false),
}));
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    warning: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
  },
}));

describe('useAttachmentUpload - Batch Upload', () => {
  const mockToken = 'test-token';

  beforeEach(() => {
    jest.clearAllMocks();
    (AttachmentService.validateFiles as jest.Mock).mockReturnValue({ valid: true, errors: [] });
    (AttachmentService.uploadFiles as jest.Mock).mockResolvedValue({
      success: true,
      attachments: [],
    });
  });

  it('should process files in batches when count exceeds batchSize', async () => {
    const { result } = renderHook(() => useAttachmentUpload({
      token: mockToken,
      batchSize: 10,
    }));

    // Create 25 files (should be 3 batches: 10, 10, 5)
    const files = Array.from({ length: 25 }, (_, i) =>
      new File([`content-${i}`], `file-${i}.txt`, { type: 'text/plain' })
    );

    // Mock uploadFiles to return attachments
    (AttachmentService.uploadFiles as jest.Mock).mockImplementation((uploadFiles) =>
      Promise.resolve({
        success: true,
        attachments: uploadFiles.map((f: File, idx: number) => ({
          id: `att-${idx}`,
          originalName: f.name,
          mimeType: f.type,
          fileSize: f.size,
          createdAt: new Date().toISOString(),
        })),
      })
    );

    await act(async () => {
      await result.current.handleFilesSelected(files);
    });

    // Wait for upload to complete
    await waitFor(() => {
      expect(result.current.isUploading).toBe(false);
    }, { timeout: 3000 });

    // Should have called uploadFiles 3 times (3 batches)
    expect(AttachmentService.uploadFiles).toHaveBeenCalledTimes(3);

    // First batch: 10 files
    expect((AttachmentService.uploadFiles as jest.Mock).mock.calls[0][0]).toHaveLength(10);
    // Second batch: 10 files
    expect((AttachmentService.uploadFiles as jest.Mock).mock.calls[1][0]).toHaveLength(10);
    // Third batch: 5 files
    expect((AttachmentService.uploadFiles as jest.Mock).mock.calls[2][0]).toHaveLength(5);

    // After completion, progress should be reset
    expect(result.current.batchProgress.current).toBe(0);
    expect(result.current.batchProgress.total).toBe(0);
    expect(result.current.isUploading).toBe(false);
  });

  it('should call uploadFiles multiple times for batched files', async () => {
    const { result } = renderHook(() => useAttachmentUpload({
      token: mockToken,
      batchSize: 5,
    }));

    const files = Array.from({ length: 12 }, (_, i) =>
      new File([`content-${i}`], `file-${i}.txt`, { type: 'text/plain' })
    );

    (AttachmentService.uploadFiles as jest.Mock).mockImplementation((uploadFiles) =>
      Promise.resolve({
        success: true,
        attachments: uploadFiles.map((f: File) => ({
          id: `att-${f.name}`,
          originalName: f.name,
          mimeType: f.type,
          fileSize: f.size,
          createdAt: new Date().toISOString(),
        })),
      })
    );

    await act(async () => {
      await result.current.handleFilesSelected(files);
    });

    await waitFor(() => {
      expect(result.current.isUploading).toBe(false);
    });

    // Should have called uploadFiles 3 times (5, 5, 2 files)
    expect(AttachmentService.uploadFiles).toHaveBeenCalledTimes(3);

    // After completion, progress should be reset
    expect(result.current.batchProgress.current).toBe(0);
    expect(result.current.batchProgress.total).toBe(0);
  });

  it('should use regular upload when file count is below batchSize', async () => {
    const { result } = renderHook(() => useAttachmentUpload({
      token: mockToken,
      batchSize: 10,
    }));

    const files = Array.from({ length: 5 }, (_, i) =>
      new File([`content-${i}`], `file-${i}.txt`, { type: 'text/plain' })
    );

    (AttachmentService.uploadFiles as jest.Mock).mockResolvedValue({
      success: true,
      attachments: files.map((f, idx) => ({
        id: `att-${idx}`,
        originalName: f.name,
        mimeType: f.type,
        fileSize: f.size,
        createdAt: new Date().toISOString(),
      })),
    });

    await act(async () => {
      await result.current.handleFilesSelected(files);
    });

    // Should call uploadFiles once (no batching)
    expect(AttachmentService.uploadFiles).toHaveBeenCalledTimes(1);
    expect((AttachmentService.uploadFiles as jest.Mock).mock.calls[0][0]).toHaveLength(5);

    // Batch progress should be reset/cleared
    expect(result.current.batchProgress.total).toBe(0);
  });

  it('should reset batch progress after completion', async () => {
    const { result } = renderHook(() => useAttachmentUpload({
      token: mockToken,
      batchSize: 5,
    }));

    const files = Array.from({ length: 15 }, (_, i) =>
      new File([`content-${i}`], `file-${i}.txt`, { type: 'text/plain' })
    );

    (AttachmentService.uploadFiles as jest.Mock).mockResolvedValue({
      success: true,
      attachments: [],
    });

    await act(async () => {
      await result.current.handleFilesSelected(files);
    });

    await waitFor(() => {
      expect(result.current.isUploading).toBe(false);
    });

    // Progress should be reset after completion
    expect(result.current.batchProgress.current).toBe(0);
    expect(result.current.batchProgress.total).toBe(0);
    expect(result.current.batchProgress.currentBatch).toBe(0);
    expect(result.current.batchProgress.totalBatches).toBe(0);
  });

  it('should handle batch upload errors gracefully', async () => {
    const { result } = renderHook(() => useAttachmentUpload({
      token: mockToken,
      batchSize: 5,
    }));

    const files = Array.from({ length: 12 }, (_, i) =>
      new File([`content-${i}`], `file-${i}.txt`, { type: 'text/plain' })
    );

    // First batch succeeds, second fails, third succeeds
    (AttachmentService.uploadFiles as jest.Mock)
      .mockResolvedValueOnce({
        success: true,
        attachments: Array(5).fill(null).map((_, i) => ({
          id: `att-${i}`,
          originalName: `file-${i}.txt`,
          mimeType: 'text/plain',
          fileSize: 100,
          createdAt: new Date().toISOString(),
        })),
      })
      .mockRejectedValueOnce(new Error('Upload failed'))
      .mockResolvedValueOnce({
        success: true,
        attachments: Array(2).fill(null).map((_, i) => ({
          id: `att-${i + 10}`,
          originalName: `file-${i + 10}.txt`,
          mimeType: 'text/plain',
          fileSize: 100,
          createdAt: new Date().toISOString(),
        })),
      });

    await act(async () => {
      await result.current.handleFilesSelected(files);
    });

    await waitFor(() => {
      expect(result.current.isUploading).toBe(false);
    });

    // Should have attempted all 3 batches
    expect(AttachmentService.uploadFiles).toHaveBeenCalledTimes(3);
  });
});

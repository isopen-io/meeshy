import { renderHook, act, waitFor } from '@testing-library/react';
import { useUploadRetry } from '@/hooks/composer/useUploadRetry';

describe('useUploadRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should retry failed upload with exponential backoff', async () => {
    const uploadFn = jest.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ success: true, attachmentId: 'file-123' });

    const { result } = renderHook(() => useUploadRetry({ maxRetries: 3 }));

    const promise = act(() => {
      return result.current.uploadWithRetry('test-file', uploadFn);
    });

    // First attempt fails immediately
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    // Retry 1 after 1s
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });

    // Retry 2 after 2s
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });

    const uploadResult = await promise;

    expect(uploadFn).toHaveBeenCalledTimes(3);
    expect(uploadResult).toEqual({ success: true, attachmentId: 'file-123' });
  });

  it('should fail after max retries', async () => {
    const uploadFn = jest.fn().mockImplementation(() => Promise.reject(new Error('Permanent error')));

    const { result } = renderHook(() => useUploadRetry({ maxRetries: 2 }));

    let didThrow = false;
    let thrownError: Error | null = null;

    // Start the upload and catch errors
    const uploadPromise = (async () => {
      try {
        return await result.current.uploadWithRetry('test-file', uploadFn);
      } catch (error) {
        didThrow = true;
        thrownError = error as Error;
      }
    })();

    // Advance timers to process all retries
    await act(async () => {
      // Initial attempt
      await jest.advanceTimersByTimeAsync(0);
      // Retry 1 after 1s
      await jest.advanceTimersByTimeAsync(1000);
      // Retry 2 after 2s
      await jest.advanceTimersByTimeAsync(2000);
      // Wait for promise to settle
      await uploadPromise;
    });

    expect(didThrow).toBe(true);
    expect(thrownError?.message).toBe('Permanent error');
    expect(uploadFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should track retry attempts', async () => {
    let resolveUpload: (value: any) => void;
    const uploadPromise = new Promise((resolve) => {
      resolveUpload = resolve;
    });

    const uploadFn = jest.fn()
      .mockRejectedValueOnce(new Error('Error'))
      .mockImplementationOnce(() => uploadPromise);

    const { result } = renderHook(() => useUploadRetry({ maxRetries: 3 }));

    let uploadPromiseResult: Promise<any>;

    act(() => {
      uploadPromiseResult = result.current.uploadWithRetry('test-file', uploadFn);
    });

    // First attempt fails immediately
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    // Now advance to first retry (1s) - this triggers the second call
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });

    // Wait for state update
    await act(async () => {
      await Promise.resolve();
    });

    // Verify status during retry
    expect(result.current.retryStatus['test-file']).toEqual({
      attempt: 1,
      maxRetries: 3,
      isRetrying: true
    });

    // Complete the retry
    await act(async () => {
      resolveUpload!({ success: true });
      await uploadPromiseResult!;
    });

    expect(uploadFn).toHaveBeenCalledTimes(2);
    expect(result.current.retryStatus['test-file']).toBeUndefined();
  });

  it('should succeed immediately without retries', async () => {
    const uploadFn = jest.fn().mockResolvedValue({ success: true, attachmentId: 'file-immediate' });

    const { result } = renderHook(() => useUploadRetry());

    const uploadResult = await act(async () => {
      return await result.current.uploadWithRetry('test-file', uploadFn);
    });

    expect(uploadFn).toHaveBeenCalledTimes(1);
    expect(uploadResult).toEqual({ success: true, attachmentId: 'file-immediate' });
    expect(result.current.retryStatus['test-file']).toBeUndefined();
  });
});

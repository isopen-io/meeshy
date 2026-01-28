import { useState, useCallback } from 'react';

interface RetryStatus {
  attempt: number;
  maxRetries: number;
  isRetrying: boolean;
}

interface UseUploadRetryProps {
  maxRetries?: number;
}

type UploadFunction = () => Promise<any>;

export const useUploadRetry = ({ maxRetries = 3 }: UseUploadRetryProps = {}) => {
  const [retryStatus, setRetryStatus] = useState<Record<string, RetryStatus>>({});

  const uploadWithRetry = useCallback(
    async (fileId: string, uploadFn: UploadFunction): Promise<any> => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Update status
          setRetryStatus(prev => ({
            ...prev,
            [fileId]: {
              attempt,
              maxRetries,
              isRetrying: attempt > 0
            }
          }));

          // Attempt upload
          const result = await uploadFn();

          // Success - clear status
          setRetryStatus(prev => {
            const { [fileId]: _, ...rest } = prev;
            return rest;
          });

          return result;

        } catch (error) {
          lastError = error as Error;

          // Don't wait after last attempt
          if (attempt < maxRetries) {
            // Exponential backoff: 1s, 2s, 4s
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // All retries failed - clear status and throw
      setRetryStatus(prev => {
        const { [fileId]: _, ...rest } = prev;
        return rest;
      });

      throw lastError;
    },
    [maxRetries]
  );

  const clearRetryStatus = useCallback((fileId: string) => {
    setRetryStatus(prev => {
      const { [fileId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  return {
    uploadWithRetry,
    retryStatus,
    clearRetryStatus,
  };
};

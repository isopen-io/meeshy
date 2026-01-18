/**
 * Hook for voice quality analysis
 *
 * Provides methods to:
 * - Fetch voice profile analysis
 * - Fetch attachment analysis
 * - Trigger new analysis
 */

import { useState, useCallback } from 'react';
import { apiService } from '@/services/api.service';
import type { VoiceQualityAnalysis } from '@meeshy/shared/types/voice-api';

interface UseVoiceAnalysisReturn {
  analysis: VoiceQualityAnalysis | null;
  isLoading: boolean;
  error: string | null;
  fetchProfileAnalysis: () => Promise<void>;
  fetchAttachmentAnalysis: (attachmentId: string) => Promise<void>;
  analyzeProfile: (audioBase64: string) => Promise<void>;
  clearAnalysis: () => void;
}

export function useVoiceAnalysis(): UseVoiceAnalysisReturn {
  const [analysis, setAnalysis] = useState<VoiceQualityAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch voice profile analysis from API
   */
  const fetchProfileAnalysis = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiService.get<{
        success: boolean;
        data: { analysis: VoiceQualityAnalysis } | null;
      }>('/api/voice-analysis/profile');

      if (response.success && response.data) {
        setAnalysis(response.data.analysis);
      } else {
        setAnalysis(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch voice analysis');
      setAnalysis(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Fetch attachment analysis from API
   */
  const fetchAttachmentAnalysis = useCallback(async (attachmentId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiService.get<{
        success: boolean;
        data: { analysis: VoiceQualityAnalysis } | null;
      }>(`/api/voice-analysis/attachment/${attachmentId}`);

      if (response.success && response.data) {
        setAnalysis(response.data.analysis);
      } else {
        setAnalysis(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch attachment analysis');
      setAnalysis(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Trigger new analysis for voice profile
   */
  const analyzeProfile = useCallback(async (audioBase64: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiService.post<{
        success: boolean;
        data: {
          userId: string;
          analysis: VoiceQualityAnalysis;
          persisted: boolean;
        };
      }>('/api/voice-analysis/profile', {
        audioBase64,
        persist: true
      });

      if (response.success && response.data) {
        setAnalysis(response.data.analysis);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to analyze voice');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Clear current analysis
   */
  const clearAnalysis = useCallback(() => {
    setAnalysis(null);
    setError(null);
  }, []);

  return {
    analysis,
    isLoading,
    error,
    fetchProfileAnalysis,
    fetchAttachmentAnalysis,
    analyzeProfile,
    clearAnalysis
  };
}

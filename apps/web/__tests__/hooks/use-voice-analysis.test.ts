import { renderHook, act } from '@testing-library/react';
import { useVoiceAnalysis } from '@/hooks/use-voice-analysis';

// ─── Mock apiService ──────────────────────────────────────────────────────────

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
  },
}));

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeAnalysis() {
  return {
    pitch: { mean: 200, std: 20, min: 150, max: 250 },
    timbre: { brightness: 0.6, warmth: 0.4 },
    quality: 0.85,
    snr: 25,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useVoiceAnalysis', () => {
  describe('initial state', () => {
    it('starts with null analysis, not loading, no error', () => {
      const { result } = renderHook(() => useVoiceAnalysis());
      expect(result.current.analysis).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('fetchProfileAnalysis', () => {
    it('sets analysis from response.data.data.analysis (nested)', async () => {
      const analysis = makeAnalysis();
      mockGet.mockResolvedValueOnce({ success: true, data: { data: { analysis } } });

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.fetchProfileAnalysis();
      });

      expect(result.current.analysis).toEqual(analysis);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('sets analysis from response.data.analysis (flat)', async () => {
      const analysis = makeAnalysis();
      mockGet.mockResolvedValueOnce({ success: true, data: { analysis } });

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.fetchProfileAnalysis();
      });

      expect(result.current.analysis).toEqual(analysis);
    });

    it('sets analysis to null when success=false', async () => {
      mockGet.mockResolvedValueOnce({ success: false, data: null });

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.fetchProfileAnalysis();
      });

      expect(result.current.analysis).toBeNull();
    });

    it('sets error and null analysis on API failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.fetchProfileAnalysis();
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.analysis).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('uses fallback error message when err.message is missing', async () => {
      mockGet.mockRejectedValueOnce({});

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.fetchProfileAnalysis();
      });

      expect(result.current.error).toBe('Failed to fetch voice analysis');
    });

    it('sets isLoading=false in finally even on success', async () => {
      mockGet.mockResolvedValueOnce({ success: true, data: null });

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.fetchProfileAnalysis();
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('calls correct endpoint', async () => {
      mockGet.mockResolvedValueOnce({ success: true, data: null });

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.fetchProfileAnalysis();
      });

      expect(mockGet).toHaveBeenCalledWith('/api/voice/analysis');
    });
  });

  describe('fetchAttachmentAnalysis', () => {
    it('fetches analysis for a given attachmentId', async () => {
      const analysis = makeAnalysis();
      mockGet.mockResolvedValueOnce({ success: true, data: { data: { analysis } } });

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.fetchAttachmentAnalysis('attach-123');
      });

      expect(mockGet).toHaveBeenCalledWith('/api/attachments/attach-123/analysis');
      expect(result.current.analysis).toEqual(analysis);
    });

    it('sets error on failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Not found'));

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.fetchAttachmentAnalysis('attach-999');
      });

      expect(result.current.error).toBe('Not found');
      expect(result.current.analysis).toBeNull();
    });

    it('uses fallback error message when err.message is missing', async () => {
      mockGet.mockRejectedValueOnce({});

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.fetchAttachmentAnalysis('attach-xyz');
      });

      expect(result.current.error).toBe('Failed to fetch attachment analysis');
    });

    it('handles flat analysis response', async () => {
      const analysis = makeAnalysis();
      mockGet.mockResolvedValueOnce({ success: true, data: { analysis } });

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.fetchAttachmentAnalysis('attach-abc');
      });

      expect(result.current.analysis).toEqual(analysis);
    });

    it('sets analysis to null when success=true but data is null', async () => {
      mockGet.mockResolvedValueOnce({ success: true, data: null });

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.fetchAttachmentAnalysis('attach-xyz');
      });

      expect(result.current.analysis).toBeNull();
    });
  });

  describe('analyzeProfile', () => {
    it('posts audio and sets analysis on success', async () => {
      const analysis = makeAnalysis();
      mockPost.mockResolvedValueOnce({
        success: true,
        data: { data: { analysis, userId: 'u1', persisted: true } },
      });

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.analyzeProfile('base64audiodata==');
      });

      expect(mockPost).toHaveBeenCalledWith('/api/voice/analysis', {
        audioBase64: 'base64audiodata==',
        persist: true,
      });
      expect(result.current.analysis).toEqual(analysis);
      expect(result.current.isLoading).toBe(false);
    });

    it('does not set analysis when success=false', async () => {
      mockPost.mockResolvedValueOnce({ success: false, data: null });

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.analyzeProfile('audio64');
      });

      expect(result.current.analysis).toBeNull();
    });

    it('sets analysis from flat response.data.analysis (not nested)', async () => {
      const analysis = makeAnalysis();
      // Flat response: data.analysis directly (no data.data wrapper)
      mockPost.mockResolvedValueOnce({ success: true, data: { analysis } });

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.analyzeProfile('audio64');
      });

      expect(result.current.analysis).toEqual(analysis);
    });

    it('sets error and rethrows on failure', async () => {
      const error = new Error('Analysis failed');
      mockPost.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await expect(result.current.analyzeProfile('bad64')).rejects.toThrow('Analysis failed');
      });

      expect(result.current.error).toBe('Analysis failed');
      expect(result.current.isLoading).toBe(false);
    });

    it('uses fallback error message when err.message is missing', async () => {
      mockPost.mockRejectedValueOnce({});

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await expect(result.current.analyzeProfile('audio64')).rejects.toEqual({});
      });

      expect(result.current.error).toBe('Failed to analyze voice');
    });
  });

  describe('clearAnalysis', () => {
    it('clears analysis and error', async () => {
      const analysis = makeAnalysis();
      mockGet.mockResolvedValueOnce({ success: true, data: { analysis } });

      const { result } = renderHook(() => useVoiceAnalysis());
      await act(async () => {
        await result.current.fetchProfileAnalysis();
      });
      expect(result.current.analysis).not.toBeNull();

      act(() => {
        result.current.clearAnalysis();
      });

      expect(result.current.analysis).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('can be called when already null without error', () => {
      const { result } = renderHook(() => useVoiceAnalysis());
      act(() => {
        result.current.clearAnalysis();
      });
      expect(result.current.analysis).toBeNull();
    });
  });
});

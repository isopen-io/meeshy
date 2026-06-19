import { renderHook, act } from '@testing-library/react';
import { useVoiceProfileManagement } from '@/hooks/use-voice-profile-management';

// ─── Mock sonner ──────────────────────────────────────────────────────────────

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock('sonner', () => ({
  toast: {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
  },
}));

// ─── Mock apiService ──────────────────────────────────────────────────────────

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
  TIMEOUT_VOICE_PROFILE: 300000,
}));

// ─── Factories ────────────────────────────────────────────────────────────────

function makeProfileData(overrides = {}) {
  return {
    exists: true,
    userId: 'user-1',
    profileId: 'profile-1',
    createdAt: '2026-01-01T00:00:00Z',
    consentStatus: {
      voiceRecordingConsentAt: '2026-01-01T00:00:00Z',
      voiceCloningEnabledAt: null,
    },
    ...overrides,
  };
}

function makeNoProfileData(overrides = {}) {
  return {
    exists: false,
    consentStatus: {
      voiceRecordingConsentAt: null,
      voiceCloningEnabledAt: null,
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Default: loadProfile resolves with no profile
  mockGet.mockResolvedValue({ success: true, data: makeNoProfileData() });
});

describe('useVoiceProfileManagement', () => {
  describe('initial state', () => {
    it('starts with isLoading=true, no profile, no consent', () => {
      const { result } = renderHook(() => useVoiceProfileManagement());
      expect(result.current.isLoading).toBe(true);
      expect(result.current.profile).toBeNull();
      expect(result.current.hasConsent).toBe(false);
      expect(result.current.hasVoiceCloningConsent).toBe(false);
    });
  });

  describe('loadProfile', () => {
    it('sets profile when exists=true', async () => {
      const profileData = makeProfileData();
      mockGet.mockResolvedValueOnce({ success: true, data: profileData });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.profile).toEqual(profileData);
      expect(result.current.isLoading).toBe(false);
    });

    it('sets profile to null when exists=false', async () => {
      mockGet.mockResolvedValueOnce({ success: true, data: makeNoProfileData() });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.profile).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('sets hasConsent=true when voiceRecordingConsentAt is set', async () => {
      const profileData = makeProfileData({
        consentStatus: {
          voiceRecordingConsentAt: '2026-01-01T00:00:00Z',
          voiceCloningEnabledAt: null,
        },
      });
      mockGet.mockResolvedValueOnce({ success: true, data: profileData });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.hasConsent).toBe(true);
      expect(result.current.hasVoiceCloningConsent).toBe(false);
    });

    it('sets hasVoiceCloningConsent=true when voiceCloningEnabledAt is set', async () => {
      const profileData = makeProfileData({
        consentStatus: {
          voiceRecordingConsentAt: '2026-01-01T00:00:00Z',
          voiceCloningEnabledAt: '2026-02-01T00:00:00Z',
        },
      });
      mockGet.mockResolvedValueOnce({ success: true, data: profileData });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.hasConsent).toBe(true);
      expect(result.current.hasVoiceCloningConsent).toBe(true);
    });

    it('handles double-nested response (data.data)', async () => {
      const profileData = makeProfileData();
      mockGet.mockResolvedValueOnce({ success: true, data: { data: profileData } });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.profile).toEqual(profileData);
    });

    it('handles missing consentStatus gracefully', async () => {
      const profileData = makeProfileData({ consentStatus: undefined });
      mockGet.mockResolvedValueOnce({ success: true, data: profileData });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.hasConsent).toBe(false);
      expect(result.current.hasVoiceCloningConsent).toBe(false);
    });

    it('shows error toast on failure and sets isLoading=false', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to load voice profile');
      expect(result.current.isLoading).toBe(false);
    });

    it('handles non-successful response (success=false)', async () => {
      mockGet.mockResolvedValueOnce({ success: false, data: null });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });

      expect(result.current.profile).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('grantConsent', () => {
    it('grants consent and shows success toast', async () => {
      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.grantConsent();
      });

      expect(mockPost).toHaveBeenCalledWith('/voice/consent', { granted: true });
      expect(result.current.hasConsent).toBe(true);
      expect(mockToastSuccess).toHaveBeenCalledWith('Voice recording consent granted');
    });

    it('does not change state when success=false', async () => {
      mockPost.mockResolvedValueOnce({ success: false });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.grantConsent();
      });

      expect(result.current.hasConsent).toBe(false);
    });

    it('shows error toast on exception', async () => {
      mockPost.mockRejectedValueOnce(new Error('Error'));

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.grantConsent();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to grant consent');
    });
  });

  describe('deleteProfile', () => {
    it('deletes profile, clears it locally, and reloads', async () => {
      // First load the profile
      const profileData = makeProfileData();
      mockGet.mockResolvedValueOnce({ success: true, data: profileData });
      mockDelete.mockResolvedValueOnce({ success: true });
      // loadProfile called again after delete
      mockGet.mockResolvedValueOnce({ success: true, data: makeNoProfileData() });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.loadProfile();
      });
      expect(result.current.profile).not.toBeNull();

      await act(async () => {
        await result.current.deleteProfile();
      });

      expect(mockDelete).toHaveBeenCalledWith('/voice/profile');
      expect(mockToastSuccess).toHaveBeenCalledWith('Voice profile deleted');
    });

    it('does not call loadProfile when delete returns success=false', async () => {
      mockDelete.mockResolvedValueOnce({ success: false });

      const { result } = renderHook(() => useVoiceProfileManagement());
      const getCallsBefore = mockGet.mock.calls.length;
      await act(async () => {
        await result.current.deleteProfile();
      });

      // loadProfile was not called again
      expect(mockGet.mock.calls.length).toBe(getCallsBefore);
    });

    it('shows error toast on failure', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Delete error'));

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.deleteProfile();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to delete voice profile');
    });
  });

  describe('grantVoiceCloningConsent', () => {
    it('grants voice cloning consent and reloads profile', async () => {
      mockPost.mockResolvedValueOnce({ success: true });
      // loadProfile() is called after grant; return data with cloning enabled
      mockGet.mockResolvedValueOnce({
        success: true,
        data: makeProfileData({
          consentStatus: {
            voiceRecordingConsentAt: '2026-01-01T00:00:00Z',
            voiceCloningEnabledAt: '2026-02-01T00:00:00Z',
          },
        }),
      });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.grantVoiceCloningConsent();
      });

      expect(mockPost).toHaveBeenCalledWith('/voice/voice-cloning-consent', {
        voiceRecordingConsent: true,
        voiceCloningConsent: true,
      });
      expect(result.current.hasVoiceCloningConsent).toBe(true);
      expect(mockToastSuccess).toHaveBeenCalledWith('Voice cloning enabled');
    });

    it('does not update state when success=false', async () => {
      mockPost.mockResolvedValueOnce({ success: false });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.grantVoiceCloningConsent();
      });

      expect(result.current.hasVoiceCloningConsent).toBe(false);
    });

    it('shows error toast on failure', async () => {
      mockPost.mockRejectedValueOnce(new Error('Consent error'));

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.grantVoiceCloningConsent();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to enable voice cloning');
    });
  });

  describe('revokeVoiceCloningConsent', () => {
    it('revokes voice cloning consent and reloads profile', async () => {
      // Revoke directly (no need to pre-grant in test)
      mockPost.mockResolvedValueOnce({ success: true });
      // loadProfile after revoke returns no cloning consent
      mockGet.mockResolvedValueOnce({ success: true, data: makeNoProfileData() });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.revokeVoiceCloningConsent();
      });

      expect(mockPost).toHaveBeenCalledWith('/voice/voice-cloning-consent', {
        voiceRecordingConsent: true,
        voiceCloningConsent: false,
      });
      // The hook sets hasVoiceCloningConsent=false explicitly before reload
      expect(result.current.hasVoiceCloningConsent).toBe(false);
      expect(mockToastSuccess).toHaveBeenCalledWith('Voice cloning disabled');
    });

    it('does not update state when success=false', async () => {
      mockPost.mockResolvedValueOnce({ success: false });

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.revokeVoiceCloningConsent();
      });

      // Initial value is false, stays false
      expect(result.current.hasVoiceCloningConsent).toBe(false);
    });

    it('shows error toast on failure', async () => {
      mockPost.mockRejectedValueOnce(new Error('Revoke error'));

      const { result } = renderHook(() => useVoiceProfileManagement());
      await act(async () => {
        await result.current.revokeVoiceCloningConsent();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to disable voice cloning');
    });
  });
});

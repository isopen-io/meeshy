'use client';

import { useState, useCallback } from 'react';
import { apiService, TIMEOUT_VOICE_PROFILE } from '@/services/api.service';
import type { VoiceProfileDetails, VoiceCloningConsentRequest } from '@meeshy/shared/types/voice-api';
import { toast } from 'sonner';

interface UseVoiceProfileManagementReturn {
  // State
  isLoading: boolean;
  profile: VoiceProfileDetails | null;
  hasConsent: boolean;
  hasVoiceCloningConsent: boolean;

  // Actions
  loadProfile: () => Promise<void>;
  grantConsent: () => Promise<void>;
  deleteProfile: () => Promise<void>;
  grantVoiceCloningConsent: () => Promise<void>;
  revokeVoiceCloningConsent: () => Promise<void>;
}

/**
 * Hook pour gérer le CRUD du profil vocal
 * Responsabilités:
 * - Chargement du profil existant
 * - Gestion des consentements (recording + cloning)
 * - Suppression du profil
 */
export function useVoiceProfileManagement(): UseVoiceProfileManagementReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<VoiceProfileDetails | null>(null);
  const [hasConsent, setHasConsent] = useState(false);
  const [hasVoiceCloningConsent, setHasVoiceCloningConsent] = useState(false);

  const loadProfile = useCallback(async () => {
    console.log('[VoiceProfile] loadProfile called');
    setIsLoading(true);
    try {
      // Charger le profil (inclut maintenant les consentements)
      const profileRes = await apiService.get<{ success: boolean; data: VoiceProfileDetails }>('/voice/profile');
      console.log('[VoiceProfile] API response:', profileRes);

      // L'API retourne { success, data: { success, data: {...} } }
      // apiService wrappe la réponse, donc on doit accéder à profileRes.data.data
      const rawData = profileRes.data?.data || profileRes.data;
      const profileData = rawData as VoiceProfileDetails;

      if (profileRes.success && profileData) {
        console.log('[VoiceProfile] Profile data:', profileData);
        console.log('[VoiceProfile] consentStatus:', profileData.consentStatus);

        // Set profile only if it exists
        if (profileData.exists) {
          setProfile(profileData);
        } else {
          setProfile(null);
        }

        // Extract consent from profile response
        if (profileData.consentStatus) {
          const hasRecording = !!profileData.consentStatus.voiceRecordingConsentAt;
          const hasCloning = !!profileData.consentStatus.voiceCloningEnabledAt;
          console.log('[VoiceProfile] Setting consents:', { hasRecording, hasCloning });
          setHasConsent(hasRecording);
          setHasVoiceCloningConsent(hasCloning);
        } else {
          console.log('[VoiceProfile] No consentStatus in response!');
        }
      } else {
        console.log('[VoiceProfile] Response not successful or no data:', profileRes);
      }
    } catch (err: any) {
      console.error('[VoiceProfile] Error loading:', err);
      toast.error('Failed to load voice profile');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const grantConsent = useCallback(async () => {
    try {
      const res = await apiService.post<{ success: boolean }>('/voice/consent', { granted: true });
      if (res.success) {
        setHasConsent(true);
        toast.success('Voice recording consent granted');
      }
    } catch (err) {
      console.error('[VoiceProfile] Error granting consent:', err);
      toast.error('Failed to grant consent');
    }
  }, []);

  const deleteProfile = useCallback(async () => {
    try {
      const res = await apiService.delete<{ success: boolean }>('/voice/profile');
      if (res.success) {
        setProfile(null);
        toast.success('Voice profile deleted');
        await loadProfile();
      }
    } catch (err) {
      console.error('[VoiceProfile] Error deleting profile:', err);
      toast.error('Failed to delete voice profile');
    }
  }, [loadProfile]);

  const grantVoiceCloningConsent = useCallback(async () => {
    try {
      const payload: VoiceCloningConsentRequest = { enabled: true };
      const res = await apiService.post<{ success: boolean }>('/voice/voice-cloning-consent', payload);
      if (res.success) {
        setHasVoiceCloningConsent(true);
        toast.success('Voice cloning enabled');
        await loadProfile();
      }
    } catch (err) {
      console.error('[VoiceProfile] Error enabling voice cloning:', err);
      toast.error('Failed to enable voice cloning');
    }
  }, [loadProfile]);

  const revokeVoiceCloningConsent = useCallback(async () => {
    try {
      const payload: VoiceCloningConsentRequest = { enabled: false };
      const res = await apiService.post<{ success: boolean }>('/voice/voice-cloning-consent', payload);
      if (res.success) {
        setHasVoiceCloningConsent(false);
        toast.success('Voice cloning disabled');
        await loadProfile();
      }
    } catch (err) {
      console.error('[VoiceProfile] Error disabling voice cloning:', err);
      toast.error('Failed to disable voice cloning');
    }
  }, [loadProfile]);

  return {
    isLoading,
    profile,
    hasConsent,
    hasVoiceCloningConsent,
    loadProfile,
    grantConsent,
    deleteProfile,
    grantVoiceCloningConsent,
    revokeVoiceCloningConsent,
  };
}

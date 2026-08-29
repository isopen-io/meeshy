'use client';

import { useState, useCallback } from 'react';
import { apiService, TIMEOUT_VOICE_PROFILE } from '@/services/api.service';
import type { VoiceProfileDetails, VoiceProfileConsentRequest } from '@meeshy/shared/types/voice-api';
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
      // #4180 — `/voice/consent` n'existe PAS (404 systématique avant ce
      // correctif : voir services/gateway/src/routes/voice-profile.ts, monté
      // sous `/voice/profile`). La route RÉELLE et SEULE écrivaine légitime
      // du consentement est `POST /voice/profile/consent` : elle horodate
      // `User.voiceProfileConsentAt` côté SERVEUR
      // (`VoiceProfileService.updateConsent`), jamais depuis une date que
      // le client fournirait — c'est la propriété que #4180 exige d'un
      // consentement opposable.
      const payload: VoiceProfileConsentRequest = { voiceRecordingConsent: true };
      const res = await apiService.post<{ success: boolean }>('/voice/profile/consent', payload);
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
      // #4180 — `/voice/voice-cloning-consent` n'existe pas davantage : le
      // web n'avait AUCUN moyen d'accorder le clonage vocal (404 muet, pas
      // de fausse assurance, mais aucun consentement enregistrable non
      // plus — un trou fonctionnel RGPD réel). Même route unique que
      // grantConsent ci-dessus ; `voiceRecordingConsent: true` est envoyé
      // avec pour respecter la dépendance que la route applique déjà
      // (le clonage EXIGE le consentement d'enregistrement — voir la chaîne
      // dans VoiceProfileService.updateConsent).
      const payload: VoiceProfileConsentRequest = { voiceRecordingConsent: true, voiceCloningConsent: true };
      const res = await apiService.post<{ success: boolean }>('/voice/profile/consent', payload);
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
      // #4180 — même route que ci-dessus. `voiceCloningConsent: false` fait
      // écrire `User.voiceCloningEnabledAt = null` côté serveur
      // (VoiceProfileService.updateConsent) : la RÉVOCATION a désormais un
      // effet SERVEUR observable, que `ConsentValidationService` lit sans
      // plus jamais le contredire via un blob de préférences périmé.
      const payload: VoiceProfileConsentRequest = { voiceRecordingConsent: true, voiceCloningConsent: false };
      const res = await apiService.post<{ success: boolean }>('/voice/profile/consent', payload);
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

'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { apiService, TIMEOUT_VOICE_PROFILE } from '@/services/api.service';
import { useVoiceProfileManagement } from '@/hooks/use-voice-profile-management';
import { MIN_RECORDING_SECONDS } from '@/hooks/use-voice-recording';
import { useVoiceAnalysis } from '@/hooks/use-voice-analysis';
import {
  saveRecordingToStorage,
  loadRecordingFromStorage,
  clearRecordingFromStorage,
  saveVoicePreviewsToStorage,
  type StoredRecording,
} from '@/lib/voice-profile-utils';
import type {
  BrowserTranscription,
  VoiceProfileSegment,
  VoicePreviewSample,
  VoiceProfileDetails,
} from '@meeshy/shared/types/voice-api';

// Dynamic imports for code splitting
import dynamic from 'next/dynamic';

const VoiceProfileConsent = dynamic(() =>
  import('./voice/VoiceProfileConsent').then(m => ({ default: m.VoiceProfileConsent })),
  { loading: () => <CardSkeleton /> }
);

const VoiceProfileInfo = dynamic(() =>
  import('./voice/VoiceProfileInfo').then(m => ({ default: m.VoiceProfileInfo })),
  { loading: () => <CardSkeleton /> }
);

const VoiceSettingsPanel = dynamic(() =>
  import('./voice/VoiceSettingsPanel').then(m => ({ default: m.VoiceSettingsPanel })),
  { loading: () => <CardSkeleton /> }
);

const VoiceRecorder = dynamic(() =>
  import('./voice/VoiceRecorder').then(m => ({ default: m.VoiceRecorder })),
  { loading: () => <CardSkeleton /> }
);

const VoiceQualityConfig = dynamic(() =>
  import('./voice/VoiceQualityConfig').then(m => ({ default: m.VoiceQualityConfig })),
  { loading: () => <CardSkeleton /> }
);

// Loading skeleton component
function CardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
      </CardContent>
    </Card>
  );
}

/**
 * VoiceProfileSettings - Main component for voice profile management
 *
 * Refactored Architecture:
 * - Hooks: useVoiceProfileManagement, useVoiceRecording, useVoiceSettings
 * - Child Components: VoiceProfileConsent, VoiceProfileInfo, VoiceRecorder, VoiceSettingsPanel
 * - Utils: voice-profile-utils.ts (storage, constants)
 * - Dynamic imports for code splitting
 *
 * Features:
 * - Voice profile creation with recording
 * - Voice cloning settings management
 * - Consent management
 * - IndexedDB persistence
 * - Accessibility support
 */
export function VoiceProfileSettings() {
  const { t, locale } = useI18n('settings');
  const reducedMotion = useReducedMotion();

  // Hooks
  const {
    isLoading,
    profile,
    hasConsent,
    hasVoiceCloningConsent,
    loadProfile,
    grantConsent,
    deleteProfile,
    grantVoiceCloningConsent,
    revokeVoiceCloningConsent,
  } = useVoiceProfileManagement();

  // Voice analysis hook
  const {
    analysis: voiceAnalysis,
    isLoading: isLoadingAnalysis,
    fetchProfileAnalysis
  } = useVoiceAnalysis();

  // Recording state
  const [sourceLanguage, setSourceLanguage] = useState<string>(locale || 'fr');
  const [selectedPreviewLanguages, setSelectedPreviewLanguages] = useState<string[]>(
    ['en', 'es', 'fr'].filter(l => l !== (locale || 'fr'))
  );
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [browserTranscription, setBrowserTranscription] = useState<BrowserTranscription | null>(null);
  const [hasRestoredRecording, setHasRestoredRecording] = useState(false);

  // Load profile on mount
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Load voice analysis when profile exists
  useEffect(() => {
    if (profile?.exists) {
      fetchProfileAnalysis();
    }
  }, [profile?.exists, fetchProfileAnalysis]);

  // Restore recording from IndexedDB
  useEffect(() => {
    if (hasRestoredRecording) return;

    const loadStoredRecording = async () => {
      const stored = await loadRecordingFromStorage();
      if (stored && !hasRestoredRecording) {
        setHasRestoredRecording(true);
        setRecordedBlob(stored.audioBlob);
        setRecordedUrl(URL.createObjectURL(stored.audioBlob));
        setBrowserTranscription(stored.browserTranscription);
        toast.info('Enregistrement précédent restauré');
      }
    };
    loadStoredRecording();
  }, [hasRestoredRecording]);

  // Consent change handler
  const handleConsentChange = useCallback(async (type: 'recording' | 'cloning', granted: boolean) => {
    if (type === 'recording') {
      if (granted) {
        await grantConsent();
      } else {
        // Revoking recording consent should also revoke cloning
        if (hasVoiceCloningConsent) {
          await revokeVoiceCloningConsent();
        }
      }
    } else {
      if (granted) {
        await grantVoiceCloningConsent();
      } else {
        await revokeVoiceCloningConsent();
      }
    }
  }, [grantConsent, grantVoiceCloningConsent, revokeVoiceCloningConsent, hasVoiceCloningConsent]);

  // Recording completion handler
  const handleRecordingComplete = useCallback(async (blob: Blob, url: string) => {
    setRecordedBlob(blob);
    setRecordedUrl(url);

    // Persist to IndexedDB
    const stored: StoredRecording = {
      audioBlob: blob,
      recordingTime: blob.size / 1000, // Approximate
      browserTranscription: null,
      liveTranscript: '',
      transcriptSegments: [],
      savedAt: new Date().toISOString(),
    };
    await saveRecordingToStorage(stored);
  }, []);

  // Create profile handler
  const handleCreateProfile = useCallback(async () => {
    if (!recordedBlob) {
      toast.error('Aucun enregistrement disponible');
      return;
    }

    setIsCreatingProfile(true);
    try {
      // Convert to base64
      const arrayBuffer = await recordedBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      interface ProfileResponse extends VoiceProfileDetails {
        transcription?: {
          text: string;
          language: string;
          confidence: number;
          durationMs: number;
          source: string;
          segments?: VoiceProfileSegment[];
        };
        voicePreviews?: VoicePreviewSample[];
      }

      const requestBody: {
        audioData: string;
        audioFormat: string;
        includeTranscription: boolean;
        browserTranscription?: BrowserTranscription;
        generateVoicePreviews?: boolean;
        previewLanguages?: string[];
        previewText?: string;
      } = {
        audioData: base64,
        audioFormat: recordedBlob.type.includes('webm') ? 'webm' : 'mp4',
        includeTranscription: !browserTranscription,
        generateVoicePreviews: hasVoiceCloningConsent && selectedPreviewLanguages.length > 0,
        previewLanguages: selectedPreviewLanguages,
        previewText: browserTranscription?.text || undefined,
      };

      if (browserTranscription) {
        requestBody.browserTranscription = browserTranscription;
      }

      const response = await apiService.post<ProfileResponse>(
        '/voice/profile/register',
        requestBody,
        { timeout: TIMEOUT_VOICE_PROFILE }
      );

      if (response.success) {
        toast.success(t('voiceProfile.create.success', 'Profil vocal créé avec succès'));

        // Save voice previews to IndexedDB if available
        if (response.data.voicePreviews && response.data.voicePreviews.length > 0 && response.data.userId) {
          await saveVoicePreviewsToStorage(
            response.data.userId,
            response.data.voicePreviews,
            response.data.version
          );
        }

        // Clear recording from IndexedDB
        await clearRecordingFromStorage();
        setRecordedBlob(null);
        setRecordedUrl(null);
        setBrowserTranscription(null);

        // Reload profile
        await loadProfile();
      }
    } catch (err: any) {
      console.error('[VoiceProfile] Error creating profile:', err);
      toast.error(t('voiceProfile.create.error', 'Erreur lors de la création du profil'));
    } finally {
      setIsCreatingProfile(false);
    }
  }, [recordedBlob, browserTranscription, hasVoiceCloningConsent, selectedPreviewLanguages, t, loadProfile]);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className={cn("h-8 w-8 text-muted-foreground", !reducedMotion && "animate-spin")} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Consent Management */}
      <VoiceProfileConsent
        hasConsent={hasConsent}
        hasVoiceCloningConsent={hasVoiceCloningConsent}
        onConsentChange={handleConsentChange}
      />

      {/* Existing Profile Info */}
      {profile && (
        <VoiceProfileInfo
          profile={profile}
          onDelete={deleteProfile}
        />
      )}

      {/* Voice Cloning Settings */}
      {profile?.exists && hasVoiceCloningConsent && (
        <VoiceSettingsPanel
          profileExists={profile.exists}
          reducedMotion={reducedMotion}
        />
      )}

      {/* Voice Quality Analysis */}
      {profile?.exists && hasVoiceCloningConsent && (
        <VoiceQualityConfig
          analysis={voiceAnalysis}
          isLoading={isLoadingAnalysis}
        />
      )}

      {/* Profile Creation */}
      {!profile && hasConsent && (
        <>
          <VoiceRecorder
            sourceLanguage={sourceLanguage}
            onSourceLanguageChange={setSourceLanguage}
            selectedPreviewLanguages={selectedPreviewLanguages}
            onPreviewLanguagesChange={setSelectedPreviewLanguages}
            hasVoiceCloningConsent={hasVoiceCloningConsent}
            onRecordingComplete={handleRecordingComplete}
            reducedMotion={reducedMotion}
          />

          {/* Create Profile Button */}
          {recordedBlob && (
            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={handleCreateProfile}
                disabled={isCreatingProfile}
              >
                {isCreatingProfile ? (
                  <>
                    <Loader2 className={cn("h-5 w-5 mr-2", !reducedMotion && "animate-spin")} />
                    {t('voiceProfile.create.creating', 'Création en cours...')}
                  </>
                ) : (
                  t('voiceProfile.create.submit', 'Créer le profil vocal')
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

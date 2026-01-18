'use client';

import { memo, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, Volume2, Languages, Loader2, AlertCircle, User, Settings2 } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { usePreferences } from '@/hooks/use-preferences';
import type { AudioPreference } from '@meeshy/shared/types/preferences';

// Dynamic import for VoiceProfileSettings (code splitting)
const VoiceProfileSettings = dynamic(
  () => import('./voice-profile-settings').then(m => ({ default: m.VoiceProfileSettings })),
  {
    loading: () => (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
    ssr: false,
  }
);

/**
 * AudioSettings Component
 * Refactored to use the new /api/v1/me/preferences/audio endpoint
 *
 * Features:
 * - usePreferences<AudioPreference>('audio') hook
 * - Optimistic updates for all fields
 * - Lazy loading with dynamic() from next/dynamic
 * - Full memoization (memo, useMemo)
 * - No manual consent management (handled by ConsentDialog)
 * - All 15+ audio preference fields
 *
 * Structure:
 * - Transcription Settings
 * - Translation Settings
 * - Text-to-Speech Settings
 * - Audio Quality Settings
 * - Voice Profile Settings
 */
export const AudioSettings = memo(function AudioSettings() {
  const { t } = useI18n('settings');
  const reducedMotion = useReducedMotion();

  // Use the new preferences hook
  const {
    preferences,
    isLoading,
    isSaving,
    error,
    updateField,
  } = usePreferences<AudioPreference>('audio');

  // Memoize loading state
  const LoadingState = useMemo(() => (
    <div
      className="flex items-center justify-center py-12"
      role="status"
      aria-label={t('audio.loading', 'Chargement des paramètres audio')}
    >
      <Loader2 className={`h-8 w-8 ${reducedMotion ? '' : 'animate-spin'} text-muted-foreground`} />
      <span className="sr-only">{t('audio.loading', 'Chargement...')}</span>
    </div>
  ), [t, reducedMotion]);

  // Memoize error state
  const ErrorState = useMemo(() => (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ), [error]);

  if (isLoading) {
    return LoadingState;
  }

  if (error) {
    return ErrorState;
  }

  if (!preferences) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {t('audio.noData', 'Impossible de charger les préférences audio')}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Transcription Settings */}
      <TranscriptionSection
        preferences={preferences}
        isSaving={isSaving}
        updateField={updateField}
        t={t}
      />

      {/* Translation Settings */}
      <TranslationSection
        preferences={preferences}
        isSaving={isSaving}
        updateField={updateField}
        t={t}
      />

      {/* Text-to-Speech Settings */}
      <TTSSection
        preferences={preferences}
        isSaving={isSaving}
        updateField={updateField}
        t={t}
      />

      {/* Audio Quality Settings */}
      <AudioQualitySection
        preferences={preferences}
        isSaving={isSaving}
        updateField={updateField}
        t={t}
      />

      {/* Voice Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t('audio.voiceProfile.title', 'Profil vocal')}
          </CardTitle>
          <CardDescription>
            {t('audio.voiceProfile.description', 'Créez votre profil vocal pour cloner votre voix dans différentes langues')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VoiceProfileSettings />
        </CardContent>
      </Card>

      {/* GDPR Information */}
      <Card>
        <CardHeader>
          <CardTitle>{t('audio.gdpr.title', 'Informations sur vos données')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t('audio.gdpr.info', 'Vos données audio sont traitées conformément au RGPD. La transcription est effectuée sur nos serveurs sécurisés et les données sont supprimées selon vos préférences de rétention.')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
});

// ============================================================================
// Transcription Section
// ============================================================================
interface SectionProps {
  preferences: AudioPreference;
  isSaving: boolean;
  updateField: <K extends keyof AudioPreference>(
    field: K,
    value: AudioPreference[K],
    options?: { skipOptimistic?: boolean; skipToast?: boolean }
  ) => Promise<boolean>;
  t: (key: string, fallback?: string) => string;
}

const TranscriptionSection = memo(function TranscriptionSection({
  preferences,
  isSaving,
  updateField,
  t,
}: SectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          {t('audio.transcription.title', 'Transcription audio')}
        </CardTitle>
        <CardDescription>
          {t('audio.transcription.description', 'Convertir vos messages audio en texte')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6">
        {/* Transcription Enabled */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 flex-1">
            <Label className="text-sm sm:text-base">
              {t('audio.transcription.enable', 'Activer la transcription')}
            </Label>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('audio.transcription.enableDesc', 'Permet de transcrire les messages audio en texte')}
            </p>
          </div>
          <Switch
            checked={preferences.transcriptionEnabled}
            onCheckedChange={(checked) => updateField('transcriptionEnabled', checked)}
            disabled={isSaving}
            aria-label={t('audio.transcription.enable', 'Activer la transcription')}
          />
        </div>

        {/* Transcription Source */}
        {preferences.transcriptionEnabled && (
          <div className="space-y-2">
            <Label>{t('audio.transcription.source', 'Source de transcription')}</Label>
            <Select
              value={preferences.transcriptionSource}
              onValueChange={(value) => updateField('transcriptionSource', value as 'auto' | 'mobile' | 'server')}
              disabled={isSaving}
            >
              <SelectTrigger aria-label={t('audio.transcription.source', 'Source de transcription')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  {t('audio.transcription.sourceAuto', 'Automatique (recommandé)')}
                </SelectItem>
                <SelectItem value="server">
                  {t('audio.transcription.sourceServer', 'Serveur (meilleure qualité)')}
                </SelectItem>
                <SelectItem value="mobile">
                  {t('audio.transcription.sourceMobile', 'Appareil (plus rapide)')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Auto Transcribe Incoming */}
        {preferences.transcriptionEnabled && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">
                {t('audio.transcription.autoIncoming', 'Transcription automatique')}
              </Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('audio.transcription.autoIncomingDesc', 'Transcrire automatiquement les messages audio entrants')}
              </p>
            </div>
            <Switch
              checked={preferences.autoTranscribeIncoming}
              onCheckedChange={(checked) => updateField('autoTranscribeIncoming', checked)}
              disabled={isSaving}
              aria-label={t('audio.transcription.autoIncoming', 'Transcription automatique')}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// ============================================================================
// Translation Section
// ============================================================================
const TranslationSection = memo(function TranslationSection({
  preferences,
  isSaving,
  updateField,
  t,
}: SectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          {t('audio.translation.title', 'Traduction audio')}
        </CardTitle>
        <CardDescription>
          {t('audio.translation.description', 'Traduire automatiquement les messages audio')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6">
        {/* Audio Translation Enabled */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 flex-1">
            <Label className="text-sm sm:text-base">
              {t('audio.translation.enable', 'Activer la traduction audio')}
            </Label>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('audio.translation.enableDesc', 'Traduire les messages audio dans votre langue')}
            </p>
          </div>
          <Switch
            checked={preferences.audioTranslationEnabled}
            onCheckedChange={(checked) => updateField('audioTranslationEnabled', checked)}
            disabled={isSaving}
            aria-label={t('audio.translation.enable', 'Activer la traduction audio')}
          />
        </div>

        {/* Translated Audio Format */}
        {preferences.audioTranslationEnabled && (
          <div className="space-y-2">
            <Label>{t('audio.translation.format', 'Format audio traduit')}</Label>
            <Select
              value={preferences.translatedAudioFormat}
              onValueChange={(value) => updateField('translatedAudioFormat', value as 'mp3' | 'wav' | 'ogg')}
              disabled={isSaving}
            >
              <SelectTrigger aria-label={t('audio.translation.format', 'Format audio traduit')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mp3">MP3 (recommandé)</SelectItem>
                <SelectItem value="ogg">OGG (meilleure qualité)</SelectItem>
                <SelectItem value="wav">WAV (non compressé)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// ============================================================================
// Text-to-Speech Section
// ============================================================================
const TTSSection = memo(function TTSSection({
  preferences,
  isSaving,
  updateField,
  t,
}: SectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5" />
          {t('audio.tts.title', 'Synthèse vocale (TTS)')}
        </CardTitle>
        <CardDescription>
          {t('audio.tts.description', 'Convertir le texte en parole avec des voix naturelles')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6">
        {/* TTS Enabled */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 flex-1">
            <Label className="text-sm sm:text-base">
              {t('audio.tts.enable', 'Activer la synthèse vocale')}
            </Label>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('audio.tts.enableDesc', 'Convertir les messages texte en audio')}
            </p>
          </div>
          <Switch
            checked={preferences.ttsEnabled}
            onCheckedChange={(checked) => updateField('ttsEnabled', checked)}
            disabled={isSaving}
            aria-label={t('audio.tts.enable', 'Activer la synthèse vocale')}
          />
        </div>

        {preferences.ttsEnabled && (
          <>
            {/* TTS Voice */}
            {preferences.ttsVoice !== undefined && (
              <div className="space-y-2">
                <Label>{t('audio.tts.voice', 'Voix TTS')}</Label>
                <Select
                  value={preferences.ttsVoice || 'default'}
                  onValueChange={(value) => updateField('ttsVoice', value)}
                  disabled={isSaving}
                >
                  <SelectTrigger aria-label={t('audio.tts.voice', 'Voix TTS')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{t('audio.tts.voiceDefault', 'Voix par défaut')}</SelectItem>
                    <SelectItem value="male">{t('audio.tts.voiceMale', 'Voix masculine')}</SelectItem>
                    <SelectItem value="female">{t('audio.tts.voiceFemale', 'Voix féminine')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* TTS Speed */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('audio.tts.speed', 'Vitesse de lecture')}</Label>
                <span className="text-sm text-muted-foreground">{preferences.ttsSpeed}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={preferences.ttsSpeed}
                onChange={(e) => updateField('ttsSpeed', parseFloat(e.target.value))}
                disabled={isSaving}
                className="w-full"
                aria-label={t('audio.tts.speed', 'Vitesse de lecture')}
              />
            </div>

            {/* TTS Pitch */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('audio.tts.pitch', 'Tonalité')}</Label>
                <span className="text-sm text-muted-foreground">{preferences.ttsPitch}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={preferences.ttsPitch}
                onChange={(e) => updateField('ttsPitch', parseFloat(e.target.value))}
                disabled={isSaving}
                className="w-full"
                aria-label={t('audio.tts.pitch', 'Tonalité')}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
});

// ============================================================================
// Audio Quality Section
// ============================================================================
const AudioQualitySection = memo(function AudioQualitySection({
  preferences,
  isSaving,
  updateField,
  t,
}: SectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          {t('audio.quality.title', 'Qualité audio')}
        </CardTitle>
        <CardDescription>
          {t('audio.quality.description', 'Ajustez les paramètres de qualité audio')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6">
        {/* Audio Quality */}
        <div className="space-y-2">
          <Label>{t('audio.quality.level', 'Niveau de qualité')}</Label>
          <Select
            value={preferences.audioQuality}
            onValueChange={(value) => updateField('audioQuality', value as 'low' | 'medium' | 'high' | 'lossless')}
            disabled={isSaving}
          >
            <SelectTrigger aria-label={t('audio.quality.level', 'Niveau de qualité')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{t('audio.quality.low', 'Basse (économie de données)')}</SelectItem>
              <SelectItem value="medium">{t('audio.quality.medium', 'Moyenne')}</SelectItem>
              <SelectItem value="high">{t('audio.quality.high', 'Haute (recommandé)')}</SelectItem>
              <SelectItem value="lossless">{t('audio.quality.lossless', 'Sans perte (meilleure qualité)')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Noise Suppression */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 flex-1">
            <Label className="text-sm sm:text-base">
              {t('audio.quality.noiseSuppression', 'Suppression du bruit')}
            </Label>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('audio.quality.noiseSuppressionDesc', 'Réduit le bruit de fond lors de l\'enregistrement')}
            </p>
          </div>
          <Switch
            checked={preferences.noiseSuppression}
            onCheckedChange={(checked) => updateField('noiseSuppression', checked)}
            disabled={isSaving}
            aria-label={t('audio.quality.noiseSuppression', 'Suppression du bruit')}
          />
        </div>

        {/* Echo Cancellation */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 flex-1">
            <Label className="text-sm sm:text-base">
              {t('audio.quality.echoCancellation', 'Annulation d\'écho')}
            </Label>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('audio.quality.echoCancellationDesc', 'Élimine l\'écho lors des appels audio')}
            </p>
          </div>
          <Switch
            checked={preferences.echoCancellation}
            onCheckedChange={(checked) => updateField('echoCancellation', checked)}
            disabled={isSaving}
            aria-label={t('audio.quality.echoCancellation', 'Annulation d\'écho')}
          />
        </div>

        {/* Voice Profile Enabled */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 flex-1">
            <Label className="text-sm sm:text-base">
              {t('audio.quality.voiceProfile', 'Profil vocal actif')}
            </Label>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('audio.quality.voiceProfileDesc', 'Utiliser votre profil vocal pour la synthèse')}
            </p>
          </div>
          <Switch
            checked={preferences.voiceProfileEnabled}
            onCheckedChange={(checked) => updateField('voiceProfileEnabled', checked)}
            disabled={isSaving}
            aria-label={t('audio.quality.voiceProfile', 'Profil vocal actif')}
          />
        </div>

        {/* Voice Clone Quality */}
        {preferences.voiceProfileEnabled && (
          <div className="space-y-2">
            <Label>{t('audio.quality.voiceClone', 'Qualité du clonage vocal')}</Label>
            <Select
              value={preferences.voiceCloneQuality}
              onValueChange={(value) => updateField('voiceCloneQuality', value as 'fast' | 'balanced' | 'quality')}
              disabled={isSaving}
            >
              <SelectTrigger aria-label={t('audio.quality.voiceClone', 'Qualité du clonage vocal')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fast">{t('audio.quality.voiceCloneFast', 'Rapide (temps réel)')}</SelectItem>
                <SelectItem value="balanced">{t('audio.quality.voiceCloneBalanced', 'Équilibré (recommandé)')}</SelectItem>
                <SelectItem value="quality">{t('audio.quality.voiceCloneQuality', 'Qualité (plus lent)')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

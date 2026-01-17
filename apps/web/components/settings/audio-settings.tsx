'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, Volume2, Languages, Loader2, AlertCircle, User } from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '@/services/api.service';
import { useI18n } from '@/hooks/use-i18n';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { VoiceProfileSettings } from './voice-profile-settings';
import { useReducedMotion, SoundFeedback } from '@/hooks/use-accessibility';

interface UserFeatureStatus {
  hasVoiceDataConsent: boolean;
  hasDataProcessingConsent: boolean;
  canTranscribeAudio: boolean;
  canTranslateText: boolean;
  canTranslateAudio: boolean;
  canGenerateTranslatedAudio: boolean;
}

interface UserConfiguration {
  transcriptionSource: 'auto' | 'mobile' | 'server';
  translatedAudioFormat: 'mp3' | 'wav' | 'ogg';
}

export function AudioSettings() {
  const { t } = useI18n('settings');
  const reducedMotion = useReducedMotion();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [featureStatus, setFeatureStatus] = useState<UserFeatureStatus | null>(null);
  const [configuration, setConfiguration] = useState<UserConfiguration>({
    transcriptionSource: 'auto',
    translatedAudioFormat: 'mp3',
  });

  // Charger le statut des features et la configuration
  // showLoader = false pour les rafraîchissements silencieux (pas de scintillement)
  const loadData = useCallback(async (showLoader: boolean = true) => {
    if (showLoader) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [statusRes, configRes] = await Promise.all([
        apiService.get<{ success: boolean; data: UserFeatureStatus }>('/user-features'),
        apiService.get<{ success: boolean; data: UserConfiguration }>('/user-features/configuration'),
      ]);

      // Note: apiService wrappe la réponse, donc statusRes.data contient { success, data }
      const featureData = (statusRes.data as any)?.data || statusRes.data;
      if (statusRes.success && featureData) {
        console.log('[AudioSettings] Feature status loaded:', featureData);
        setFeatureStatus(featureData);
      }

      const configData = (configRes.data as any)?.data || configRes.data;
      if (configRes.success && configData) {
        setConfiguration({
          transcriptionSource: configData.transcriptionSource || 'auto',
          translatedAudioFormat: configData.translatedAudioFormat || 'mp3',
        });
      }
    } catch (err: any) {
      console.error('[AudioSettings] Error loading data:', err);
      setError(err.message || 'Erreur lors du chargement des paramètres');
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Activer/désactiver une feature
  const toggleFeature = async (feature: string, enable: boolean) => {
    setIsSaving(true);
    try {
      const endpoint = `/user-features/${feature}/${enable ? 'enable' : 'disable'}`;
      const response = await apiService.post<{ success: boolean; message?: string }>(endpoint, {});

      if (response.success) {
        toast.success(enable ? 'Fonctionnalité activée' : 'Fonctionnalité désactivée');
        // Rafraîchissement silencieux (pas de loader)
        await loadData(false);
      } else {
        throw new Error(response.message || 'Erreur');
      }
    } catch (err: any) {
      console.error('[AudioSettings] Error toggling feature:', err);
      toast.error(err.message || 'Erreur lors de la mise à jour');
    } finally {
      setIsSaving(false);
    }
  };

  // Accorder/révoquer un consentement
  const toggleConsent = async (consentType: string, grant: boolean) => {
    setIsSaving(true);
    try {
      const endpoint = `/user-features/consent/${consentType}`;

      const response = grant
        ? await apiService.post<{ success: boolean; message?: string }>(endpoint, {})
        : await apiService.delete<{ success: boolean; message?: string }>(endpoint);

      if (response.success) {
        toast.success(grant ? 'Consentement accordé' : 'Consentement révoqué');
        // Rafraîchissement silencieux (pas de loader)
        console.log('[AudioSettings] Consent updated, reloading data...');
        await loadData(false);
        console.log('[AudioSettings] Data reloaded');
      } else {
        throw new Error(response.message || 'Erreur');
      }
    } catch (err: any) {
      console.error('[AudioSettings] Error toggling consent:', err);
      toast.error(err.message || 'Erreur lors de la mise à jour');
    } finally {
      setIsSaving(false);
    }
  };

  // Mettre à jour la configuration
  const updateConfiguration = async (key: keyof UserConfiguration, value: string) => {
    setIsSaving(true);
    try {
      const response = await apiService.put<{ success: boolean; message?: string }>(
        '/user-features/configuration',
        { [key]: value }
      );

      if (response.success) {
        setConfiguration(prev => ({ ...prev, [key]: value }));
        toast.success('Configuration mise à jour');
      } else {
        throw new Error(response.message || 'Erreur');
      }
    } catch (err: any) {
      console.error('[AudioSettings] Error updating configuration:', err);
      toast.error(err.message || 'Erreur lors de la mise à jour');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={t('audio.loading', 'Chargement des paramètres audio')}>
        <Loader2 className={`h-8 w-8 ${reducedMotion ? '' : 'animate-spin'} text-muted-foreground`} />
        <span className="sr-only">{t('audio.loading', 'Chargement...')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Consentements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('audio.consents.title', 'Consentements audio')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('audio.consents.description', 'Autorisations nécessaires pour les fonctionnalités audio')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* dataProcessingConsentAt doit être en premier (c'est la base) */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">
                {t('audio.consents.dataProcessing', 'Traitement général des données')}
              </Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('audio.consents.dataProcessingDesc', 'Autorise le traitement de vos données pour les traductions')}
              </p>
            </div>
            <Switch
              checked={featureStatus?.hasDataProcessingConsent || false}
              onCheckedChange={(checked) => toggleConsent('dataProcessingConsentAt', checked)}
              disabled={isSaving}
            />
          </div>

          {/* voiceDataConsentAt nécessite dataProcessingConsentAt */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">
                {t('audio.consents.voiceData', 'Traitement des données vocales')}
              </Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('audio.consents.voiceDataDesc', 'Autorise le traitement de vos messages audio pour la transcription')}
              </p>
            </div>
            <Switch
              checked={featureStatus?.hasVoiceDataConsent || false}
              onCheckedChange={(checked) => toggleConsent('voiceDataConsentAt', checked)}
              disabled={isSaving || !featureStatus?.hasDataProcessingConsent}
            />
          </div>
        </CardContent>
      </Card>

      {/* Fonctionnalités de transcription */}
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
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>{t('audio.transcription.enable', 'Activer la transcription')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('audio.transcription.enableDesc', 'Permet de transcrire les messages audio en texte')}
              </p>
            </div>
            <Switch
              checked={featureStatus?.canTranscribeAudio || false}
              onCheckedChange={(checked) => toggleFeature('audioTranscriptionEnabledAt', checked)}
              disabled={isSaving || !featureStatus?.hasVoiceDataConsent}
            />
          </div>

          {featureStatus?.canTranscribeAudio && (
            <div className="space-y-2">
              <Label>{t('audio.transcription.source', 'Source de transcription')}</Label>
              <Select
                value={configuration.transcriptionSource}
                onValueChange={(value) => updateConfiguration('transcriptionSource', value)}
                disabled={isSaving}
              >
                <SelectTrigger>
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
        </CardContent>
      </Card>

      {/* Traduction audio */}
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
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>{t('audio.translation.text', 'Traduction du texte')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('audio.translation.textDesc', 'Traduire les messages texte dans votre langue')}
              </p>
            </div>
            <Switch
              checked={featureStatus?.canTranslateText || false}
              onCheckedChange={(checked) => toggleFeature('textTranslationEnabledAt', checked)}
              disabled={isSaving || !featureStatus?.hasDataProcessingConsent}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>{t('audio.translation.audio', 'Traduction des audios')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('audio.translation.audioDesc', 'Transcrire et traduire les messages audio')}
              </p>
            </div>
            <Switch
              checked={featureStatus?.canTranslateAudio || false}
              onCheckedChange={(checked) => toggleFeature('audioTranslationEnabledAt', checked)}
              disabled={isSaving || !featureStatus?.canTranscribeAudio || !featureStatus?.canTranslateText}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>{t('audio.translation.generateAudio', 'Générer audio traduit')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('audio.translation.generateAudioDesc', 'Créer une version audio de la traduction')}
              </p>
            </div>
            <Switch
              checked={featureStatus?.canGenerateTranslatedAudio || false}
              onCheckedChange={(checked) => toggleFeature('translatedAudioGenerationEnabledAt', checked)}
              disabled={isSaving || !featureStatus?.canTranslateAudio}
            />
          </div>

          {featureStatus?.canGenerateTranslatedAudio && (
            <div className="space-y-2">
              <Label>{t('audio.translation.format', 'Format audio')}</Label>
              <Select
                value={configuration.translatedAudioFormat}
                onValueChange={(value) => updateConfiguration('translatedAudioFormat', value)}
                disabled={isSaving}
              >
                <SelectTrigger>
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

      {/* Info RGPD */}
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

      {/* Profil vocal */}
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
    </div>
  );
}

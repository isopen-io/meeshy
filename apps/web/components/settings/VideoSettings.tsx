'use client';

/**
 * Video Settings Component
 * Configuration des préférences vidéo
 * Synchronisé avec l'API backend /me/preferences/video
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Video,
  Camera,
  Settings,
  Sparkles,
  Zap,
  Loader2,
  AlertCircle,
  Monitor
} from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '@/services/api.service';
import { useI18n } from '@/hooks/use-i18n';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { VideoPreference } from '@meeshy/shared/types/preferences';

const DEFAULT_PREFERENCES: VideoPreference = {
  videoQuality: 'auto',
  videoFrameRate: '30',
  videoResolution: 'auto',
  videoCodec: 'VP8',
  mirrorLocalVideo: true,
  videoLayout: 'speaker',
  showSelfView: true,
  selfViewPosition: 'bottom-right',
  backgroundBlurEnabled: false,
  virtualBackgroundEnabled: false,
  hardwareAccelerationEnabled: true,
  adaptiveBitrateEnabled: true,
  autoStartVideo: true,
  autoMuteOnJoin: false
};

export function VideoSettings() {
  const { t } = useI18n('settings');
  const reducedMotion = useReducedMotion();

  const [preferences, setPreferences] = useState<VideoPreference>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load preferences from API
  const loadPreferences = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiService.get<{ success: boolean; data: VideoPreference }>(
        '/me/preferences/video'
      );

      if (response.success && response.data) {
        const { data } = response;
        const prefs = 'data' in data ? data.data : data;
        setPreferences(prev => ({ ...prev, ...prefs }));
      }
    } catch (err: any) {
      console.error('[VideoSettings] Error loading preferences:', err);
      setError(err.message || t('video.loadError', 'Erreur lors du chargement des préférences'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Save preferences with optimistic updates
  const savePreferences = async () => {
    setSaving(true);
    const previousPrefs = { ...preferences };

    try {
      const response = await apiService.put<{ success: boolean; data: VideoPreference }>(
        '/me/preferences/video',
        preferences
      );

      if (response.success) {
        toast.success(t('video.saveSuccess', 'Préférences vidéo enregistrées'));
        setHasChanges(false);
      } else {
        setPreferences(previousPrefs);
        throw new Error(response.message || 'Erreur lors de l\'enregistrement');
      }
    } catch (err: any) {
      console.error('[VideoSettings] Error saving preferences:', err);
      setPreferences(previousPrefs);
      toast.error(err.message || t('video.saveError', 'Erreur lors de l\'enregistrement'));
    } finally {
      setSaving(false);
    }
  };

  const handlePreferenceChange = <K extends keyof VideoPreference>(
    key: K,
    value: VideoPreference[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  // Loading skeleton
  if (loading) {
    return (
      <div
        className="flex items-center justify-center min-h-[400px]"
        role="status"
        aria-label={t('video.loading', 'Chargement des préférences vidéo')}
      >
        <Loader2 className={`h-8 w-8 ${reducedMotion ? '' : 'animate-spin'} text-primary`} />
        <span className="sr-only">{t('video.loading', 'Chargement...')}</span>
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
      {/* Video Quality */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Video className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('video.quality.title', 'Qualité vidéo')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('video.quality.description', 'Paramètres de qualité et performance')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <Label htmlFor="videoQuality" className="text-sm font-medium">
              {t('video.quality.preset', 'Qualité générale')}
            </Label>
            <Select
              value={preferences.videoQuality}
              onValueChange={(value: 'low' | 'medium' | 'high' | 'auto') =>
                handlePreferenceChange('videoQuality', value)
              }
              disabled={saving}
            >
              <SelectTrigger id="videoQuality" aria-label={t('video.quality.preset', 'Qualité générale')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('video.quality.auto', 'Automatique (recommandé)')}</SelectItem>
                <SelectItem value="low">{t('video.quality.low', 'Basse (économie de bande passante)')}</SelectItem>
                <SelectItem value="medium">{t('video.quality.medium', 'Moyenne')}</SelectItem>
                <SelectItem value="high">{t('video.quality.high', 'Haute')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="videoResolution" className="text-sm font-medium">
              {t('video.resolution', 'Résolution')}
            </Label>
            <Select
              value={preferences.videoResolution}
              onValueChange={(value: '480p' | '720p' | '1080p' | 'auto') =>
                handlePreferenceChange('videoResolution', value)
              }
              disabled={saving}
            >
              <SelectTrigger id="videoResolution" aria-label={t('video.resolution', 'Résolution')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('video.resolutionAuto', 'Automatique')}</SelectItem>
                <SelectItem value="480p">480p (SD)</SelectItem>
                <SelectItem value="720p">720p (HD)</SelectItem>
                <SelectItem value="1080p">1080p (Full HD)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="frameRate" className="text-sm font-medium">
              {t('video.frameRate', 'Fréquence d\'images')}
            </Label>
            <Select
              value={preferences.videoFrameRate}
              onValueChange={(value: '15' | '24' | '30' | '60') =>
                handlePreferenceChange('videoFrameRate', value)
              }
              disabled={saving}
            >
              <SelectTrigger id="frameRate" aria-label={t('video.frameRate', 'Fréquence d\'images')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 FPS</SelectItem>
                <SelectItem value="24">24 FPS</SelectItem>
                <SelectItem value="30">30 FPS (recommandé)</SelectItem>
                <SelectItem value="60">60 FPS (fluide)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {preferences.videoBitrate !== undefined && (
            <div className="space-y-2">
              <Label htmlFor="bitrate" className="text-sm font-medium">
                {t('video.bitrate', 'Débit vidéo')} ({preferences.videoBitrate} kbps)
              </Label>
              <Slider
                id="bitrate"
                min={100}
                max={5000}
                step={100}
                value={[preferences.videoBitrate]}
                onValueChange={([value]) => handlePreferenceChange('videoBitrate', value)}
                disabled={saving}
                className="w-full"
                aria-label={t('video.bitrate', 'Débit vidéo')}
              />
              <p className="text-xs text-muted-foreground">
                {t('video.bitrateDesc', 'Ajustez le débit pour optimiser qualité et bande passante')}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="codec" className="text-sm font-medium">
              {t('video.codec', 'Codec vidéo')}
            </Label>
            <Select
              value={preferences.videoCodec}
              onValueChange={(value: 'VP8' | 'VP9' | 'H264' | 'H265' | 'AV1') =>
                handlePreferenceChange('videoCodec', value)
              }
              disabled={saving}
            >
              <SelectTrigger id="codec" aria-label={t('video.codec', 'Codec vidéo')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VP8">VP8 (recommandé)</SelectItem>
                <SelectItem value="VP9">VP9 (meilleure qualité)</SelectItem>
                <SelectItem value="H264">H264 (compatible)</SelectItem>
                <SelectItem value="H265">H265 (efficace)</SelectItem>
                <SelectItem value="AV1">AV1 (moderne)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Camera Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('video.camera.title', 'Caméra')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('video.camera.description', 'Paramètres de la caméra')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Camera className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="mirrorVideo" className="text-sm sm:text-base">
                  {t('video.mirrorVideo', 'Effet miroir')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('video.mirrorVideoDesc', 'Inverser horizontalement votre vidéo locale')}
                </p>
              </div>
            </div>
            <Switch
              id="mirrorVideo"
              checked={preferences.mirrorLocalVideo}
              onCheckedChange={(checked) => handlePreferenceChange('mirrorLocalVideo', checked)}
              disabled={saving}
              aria-label={t('video.mirrorVideo', 'Effet miroir')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Layout Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Monitor className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('video.layout.title', 'Disposition')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('video.layout.description', 'Agencement de l\'interface vidéo')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <Label htmlFor="videoLayout" className="text-sm font-medium">
              {t('video.layout.mode', 'Mode d\'affichage')}
            </Label>
            <Select
              value={preferences.videoLayout}
              onValueChange={(value: 'grid' | 'speaker' | 'sidebar') =>
                handlePreferenceChange('videoLayout', value)
              }
              disabled={saving}
            >
              <SelectTrigger id="videoLayout" aria-label={t('video.layout.mode', 'Mode d\'affichage')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grid">{t('video.layout.grid', 'Grille (tous égaux)')}</SelectItem>
                <SelectItem value="speaker">{t('video.layout.speaker', 'Locuteur (focus actif)')}</SelectItem>
                <SelectItem value="sidebar">{t('video.layout.sidebar', 'Barre latérale')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Camera className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="showSelfView" className="text-sm sm:text-base">
                  {t('video.showSelfView', 'Afficher ma vidéo')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('video.showSelfViewDesc', 'Voir votre propre flux vidéo pendant l\'appel')}
                </p>
              </div>
            </div>
            <Switch
              id="showSelfView"
              checked={preferences.showSelfView}
              onCheckedChange={(checked) => handlePreferenceChange('showSelfView', checked)}
              disabled={saving}
              aria-label={t('video.showSelfView', 'Afficher ma vidéo')}
            />
          </div>

          {preferences.showSelfView && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <Label htmlFor="selfViewPosition" className="text-sm font-medium">
                {t('video.selfViewPosition', 'Position de ma vidéo')}
              </Label>
              <Select
                value={preferences.selfViewPosition}
                onValueChange={(value: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') =>
                  handlePreferenceChange('selfViewPosition', value)
                }
                disabled={saving}
              >
                <SelectTrigger id="selfViewPosition" aria-label={t('video.selfViewPosition', 'Position de ma vidéo')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top-left">{t('video.position.topLeft', 'Haut gauche')}</SelectItem>
                  <SelectItem value="top-right">{t('video.position.topRight', 'Haut droite')}</SelectItem>
                  <SelectItem value="bottom-left">{t('video.position.bottomLeft', 'Bas gauche')}</SelectItem>
                  <SelectItem value="bottom-right">{t('video.position.bottomRight', 'Bas droite')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visual Effects */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('video.effects.title', 'Effets visuels')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('video.effects.description', 'Filtres et arrière-plans')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Sparkles className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="backgroundBlur" className="text-sm sm:text-base">
                  {t('video.backgroundBlur', 'Flou d\'arrière-plan')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('video.backgroundBlurDesc', 'Flouter l\'arrière-plan automatiquement')}
                </p>
              </div>
            </div>
            <Switch
              id="backgroundBlur"
              checked={preferences.backgroundBlurEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('backgroundBlurEnabled', checked)}
              disabled={saving}
              aria-label={t('video.backgroundBlur', 'Flou d\'arrière-plan')}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Sparkles className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="virtualBackground" className="text-sm sm:text-base">
                  {t('video.virtualBackground', 'Arrière-plan virtuel')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('video.virtualBackgroundDesc', 'Remplacer votre arrière-plan par une image')}
                </p>
              </div>
            </div>
            <Switch
              id="virtualBackground"
              checked={preferences.virtualBackgroundEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('virtualBackgroundEnabled', checked)}
              disabled={saving}
              aria-label={t('video.virtualBackground', 'Arrière-plan virtuel')}
            />
          </div>

          {preferences.virtualBackgroundEnabled && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <Label htmlFor="backgroundUrl" className="text-sm font-medium">
                {t('video.backgroundUrl', 'URL de l\'image')}
              </Label>
              <Input
                id="backgroundUrl"
                type="url"
                placeholder="https://example.com/background.jpg"
                value={preferences.virtualBackgroundUrl || ''}
                onChange={(e) => handlePreferenceChange('virtualBackgroundUrl', e.target.value)}
                disabled={saving}
                aria-label={t('video.backgroundUrl', 'URL de l\'image d\'arrière-plan')}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('video.performance.title', 'Performance')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('video.performance.description', 'Optimisations et accélération')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Zap className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="hwAcceleration" className="text-sm sm:text-base">
                  {t('video.hwAcceleration', 'Accélération matérielle')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('video.hwAccelerationDesc', 'Utiliser le GPU pour le traitement vidéo')}
                </p>
              </div>
            </div>
            <Switch
              id="hwAcceleration"
              checked={preferences.hardwareAccelerationEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('hardwareAccelerationEnabled', checked)}
              disabled={saving}
              aria-label={t('video.hwAcceleration', 'Accélération matérielle')}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Settings className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="adaptiveBitrate" className="text-sm sm:text-base">
                  {t('video.adaptiveBitrate', 'Débit adaptatif')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('video.adaptiveBitrateDesc', 'Ajuster automatiquement la qualité selon la connexion')}
                </p>
              </div>
            </div>
            <Switch
              id="adaptiveBitrate"
              checked={preferences.adaptiveBitrateEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('adaptiveBitrateEnabled', checked)}
              disabled={saving}
              aria-label={t('video.adaptiveBitrate', 'Débit adaptatif')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Auto Behaviors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('video.auto.title', 'Comportements automatiques')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('video.auto.description', 'Actions par défaut lors des appels')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Video className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="autoStartVideo" className="text-sm sm:text-base">
                  {t('video.autoStartVideo', 'Démarrer la vidéo automatiquement')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('video.autoStartVideoDesc', 'Activer votre caméra en rejoignant un appel')}
                </p>
              </div>
            </div>
            <Switch
              id="autoStartVideo"
              checked={preferences.autoStartVideo}
              onCheckedChange={(checked) => handlePreferenceChange('autoStartVideo', checked)}
              disabled={saving}
              aria-label={t('video.autoStartVideo', 'Démarrer la vidéo automatiquement')}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Video className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="autoMuteVideo" className="text-sm sm:text-base">
                  {t('video.autoMuteVideo', 'Couper le micro en rejoignant')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('video.autoMuteVideoDesc', 'Désactiver le micro automatiquement au début de l\'appel')}
                </p>
              </div>
            </div>
            <Switch
              id="autoMuteVideo"
              checked={preferences.autoMuteOnJoin}
              onCheckedChange={(checked) => handlePreferenceChange('autoMuteOnJoin', checked)}
              disabled={saving}
              aria-label={t('video.autoMuteVideo', 'Couper le micro en rejoignant')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button
            onClick={savePreferences}
            disabled={saving}
            className="shadow-lg"
            aria-label={t('video.save', 'Enregistrer les modifications')}
          >
            {saving ? (
              <>
                <Loader2 className={`mr-2 h-4 w-4 ${reducedMotion ? '' : 'animate-spin'}`} />
                {t('video.saving', 'Enregistrement...')}
              </>
            ) : (
              t('video.save', 'Enregistrer les modifications')
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

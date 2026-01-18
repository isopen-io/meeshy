'use client';

/**
 * Document Settings Component
 * Configuration des préférences de documents et fichiers
 * Synchronisé avec l'API backend /user-preferences/documents
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
  FileText,
  Download,
  Eye,
  HardDrive,
  Shield,
  Loader2,
  AlertCircle,
  Trash2,
  FileImage
} from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '@/services/api.service';
import { useI18n } from '@/hooks/use-i18n';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { DocumentPreference } from '@meeshy/shared/types/preferences';

const DEFAULT_PREFERENCES: DocumentPreference = {
  autoDownloadEnabled: false,
  autoDownloadOnWifi: true,
  autoDownloadMaxSize: 10,
  inlinePreviewEnabled: true,
  previewPdfEnabled: true,
  previewImagesEnabled: true,
  previewVideosEnabled: true,
  storageQuota: 5000,
  autoDeleteOldFiles: false,
  fileRetentionDays: 90,
  compressImagesOnUpload: false,
  imageCompressionQuality: 85,
  allowedFileTypes: [
    'image/*',
    'video/*',
    'audio/*',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.*'
  ],
  scanFilesForMalware: true,
  allowExternalLinks: true
};

export function DocumentSettings() {
  const { t } = useI18n('settings');
  const reducedMotion = useReducedMotion();

  const [preferences, setPreferences] = useState<DocumentPreference>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load preferences from API
  const loadPreferences = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiService.get<{ success: boolean; data: DocumentPreference }>(
        '/user-preferences/documents'
      );

      if (response.success && response.data) {
        const { data } = response;
        const prefs = 'data' in data ? data.data : data;
        setPreferences(prev => ({ ...prev, ...prefs }));
      }
    } catch (err: any) {
      console.error('[DocumentSettings] Error loading preferences:', err);
      setError(err.message || t('documents.loadError', 'Erreur lors du chargement des préférences'));
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
      const response = await apiService.put<{ success: boolean; data: DocumentPreference }>(
        '/user-preferences/documents',
        preferences
      );

      if (response.success) {
        toast.success(t('documents.saveSuccess', 'Préférences de documents enregistrées'));
        setHasChanges(false);
      } else {
        setPreferences(previousPrefs);
        throw new Error(response.message || 'Erreur lors de l\'enregistrement');
      }
    } catch (err: any) {
      console.error('[DocumentSettings] Error saving preferences:', err);
      setPreferences(previousPrefs);
      toast.error(err.message || t('documents.saveError', 'Erreur lors de l\'enregistrement'));
    } finally {
      setSaving(false);
    }
  };

  const handlePreferenceChange = <K extends keyof DocumentPreference>(
    key: K,
    value: DocumentPreference[K]
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
        aria-label={t('documents.loading', 'Chargement des préférences de documents')}
      >
        <Loader2 className={`h-8 w-8 ${reducedMotion ? '' : 'animate-spin'} text-primary`} />
        <span className="sr-only">{t('documents.loading', 'Chargement...')}</span>
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
      {/* Download Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Download className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('documents.download.title', 'Téléchargements')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('documents.download.description', 'Gestion des téléchargements automatiques')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Download className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="autoDownload" className="text-sm sm:text-base">
                  {t('documents.autoDownload', 'Téléchargement automatique')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('documents.autoDownloadDesc', 'Télécharger automatiquement les fichiers reçus')}
                </p>
              </div>
            </div>
            <Switch
              id="autoDownload"
              checked={preferences.autoDownloadEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('autoDownloadEnabled', checked)}
              disabled={saving}
              aria-label={t('documents.autoDownload', 'Téléchargement automatique')}
            />
          </div>

          {preferences.autoDownloadEnabled && (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <Download className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <Label htmlFor="wifiOnly" className="text-sm sm:text-base">
                      {t('documents.wifiOnly', 'Wi-Fi uniquement')}
                    </Label>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {t('documents.wifiOnlyDesc', 'Télécharger uniquement en Wi-Fi pour économiser les données')}
                    </p>
                  </div>
                </div>
                <Switch
                  id="wifiOnly"
                  checked={preferences.autoDownloadOnWifi}
                  onCheckedChange={(checked) => handlePreferenceChange('autoDownloadOnWifi', checked)}
                  disabled={saving}
                  aria-label={t('documents.wifiOnly', 'Wi-Fi uniquement')}
                />
              </div>

              <div className="p-4 bg-muted rounded-lg space-y-2">
                <Label htmlFor="maxDownloadSize" className="text-sm font-medium">
                  {t('documents.maxDownloadSize', 'Taille maximale')} ({preferences.autoDownloadMaxSize} MB)
                </Label>
                <Slider
                  id="maxDownloadSize"
                  min={1}
                  max={100}
                  step={1}
                  value={[preferences.autoDownloadMaxSize]}
                  onValueChange={([value]) => handlePreferenceChange('autoDownloadMaxSize', value)}
                  disabled={saving}
                  className="w-full"
                  aria-label={t('documents.maxDownloadSize', 'Taille maximale de téléchargement')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('documents.maxDownloadSizeDesc', 'Ne télécharger que les fichiers plus petits que cette taille')}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Preview Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('documents.preview.title', 'Prévisualisations')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('documents.preview.description', 'Aperçu des fichiers dans les conversations')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="inlinePreview" className="text-sm sm:text-base">
                  {t('documents.inlinePreview', 'Aperçu intégré')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('documents.inlinePreviewDesc', 'Afficher les fichiers directement dans les messages')}
                </p>
              </div>
            </div>
            <Switch
              id="inlinePreview"
              checked={preferences.inlinePreviewEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('inlinePreviewEnabled', checked)}
              disabled={saving}
              aria-label={t('documents.inlinePreview', 'Aperçu intégré')}
            />
          </div>

          {preferences.inlinePreviewEnabled && (
            <div className="p-4 bg-muted rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="pdfPreview" className="text-sm">
                    {t('documents.pdfPreview', 'Documents PDF')}
                  </Label>
                </div>
                <Switch
                  id="pdfPreview"
                  checked={preferences.previewPdfEnabled}
                  onCheckedChange={(checked) => handlePreferenceChange('previewPdfEnabled', checked)}
                  disabled={saving}
                  aria-label={t('documents.pdfPreview', 'Prévisualisation PDF')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileImage className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="imagePreview" className="text-sm">
                    {t('documents.imagePreview', 'Images')}
                  </Label>
                </div>
                <Switch
                  id="imagePreview"
                  checked={preferences.previewImagesEnabled}
                  onCheckedChange={(checked) => handlePreferenceChange('previewImagesEnabled', checked)}
                  disabled={saving}
                  aria-label={t('documents.imagePreview', 'Prévisualisation images')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="videoPreview" className="text-sm">
                    {t('documents.videoPreview', 'Vidéos')}
                  </Label>
                </div>
                <Switch
                  id="videoPreview"
                  checked={preferences.previewVideosEnabled}
                  onCheckedChange={(checked) => handlePreferenceChange('previewVideosEnabled', checked)}
                  disabled={saving}
                  aria-label={t('documents.videoPreview', 'Prévisualisation vidéos')}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Storage Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <HardDrive className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('documents.storage.title', 'Stockage')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('documents.storage.description', 'Gestion de l\'espace de stockage')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <Label htmlFor="storageQuota" className="text-sm font-medium">
              {t('documents.storageQuota', 'Quota de stockage')} ({preferences.storageQuota} MB)
            </Label>
            <Slider
              id="storageQuota"
              min={100}
              max={100000}
              step={100}
              value={[preferences.storageQuota]}
              onValueChange={([value]) => handlePreferenceChange('storageQuota', value)}
              disabled={saving}
              className="w-full"
              aria-label={t('documents.storageQuota', 'Quota de stockage')}
            />
            <p className="text-xs text-muted-foreground">
              {t('documents.storageQuotaDesc', 'Espace maximum alloué aux fichiers téléchargés')}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Trash2 className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="autoDelete" className="text-sm sm:text-base">
                  {t('documents.autoDelete', 'Suppression automatique')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('documents.autoDeleteDesc', 'Supprimer automatiquement les anciens fichiers')}
                </p>
              </div>
            </div>
            <Switch
              id="autoDelete"
              checked={preferences.autoDeleteOldFiles}
              onCheckedChange={(checked) => handlePreferenceChange('autoDeleteOldFiles', checked)}
              disabled={saving}
              aria-label={t('documents.autoDelete', 'Suppression automatique')}
            />
          </div>

          {preferences.autoDeleteOldFiles && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <Label htmlFor="retentionDays" className="text-sm font-medium">
                {t('documents.retentionDays', 'Période de conservation')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="retentionDays"
                  type="number"
                  min={7}
                  max={365}
                  value={preferences.fileRetentionDays}
                  onChange={(e) => handlePreferenceChange('fileRetentionDays', parseInt(e.target.value) || 90)}
                  className="w-24"
                  disabled={saving}
                  aria-label={t('documents.retentionDays', 'Nombre de jours')}
                />
                <span className="text-sm text-muted-foreground">
                  {t('documents.retentionDaysUnit', 'jours')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('documents.retentionDaysDesc', 'Les fichiers plus anciens seront automatiquement supprimés')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Compression */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <FileImage className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('documents.compression.title', 'Compression d\'images')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('documents.compression.description', 'Optimiser les images avant l\'envoi')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <FileImage className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="compressImages" className="text-sm sm:text-base">
                  {t('documents.compressImages', 'Compresser les images')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('documents.compressImagesDesc', 'Réduire la taille des images automatiquement')}
                </p>
              </div>
            </div>
            <Switch
              id="compressImages"
              checked={preferences.compressImagesOnUpload}
              onCheckedChange={(checked) => handlePreferenceChange('compressImagesOnUpload', checked)}
              disabled={saving}
              aria-label={t('documents.compressImages', 'Compresser les images')}
            />
          </div>

          {preferences.compressImagesOnUpload && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <Label htmlFor="imageQuality" className="text-sm font-medium">
                {t('documents.imageQuality', 'Qualité de compression')} ({preferences.imageCompressionQuality}%)
              </Label>
              <Slider
                id="imageQuality"
                min={10}
                max={100}
                step={5}
                value={[preferences.imageCompressionQuality]}
                onValueChange={([value]) => handlePreferenceChange('imageCompressionQuality', value)}
                disabled={saving}
                className="w-full"
                aria-label={t('documents.imageQuality', 'Qualité de compression')}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t('documents.qualityLow', 'Petite taille')}</span>
                <span>{t('documents.qualityHigh', 'Haute qualité')}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('documents.security.title', 'Sécurité')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('documents.security.description', 'Protection et analyse des fichiers')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Shield className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="scanMalware" className="text-sm sm:text-base">
                  {t('documents.scanMalware', 'Analyser les fichiers')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('documents.scanMalwareDesc', 'Vérifier les fichiers pour détecter les malwares')}
                </p>
              </div>
            </div>
            <Switch
              id="scanMalware"
              checked={preferences.scanFilesForMalware}
              onCheckedChange={(checked) => handlePreferenceChange('scanFilesForMalware', checked)}
              disabled={saving}
              aria-label={t('documents.scanMalware', 'Analyser les fichiers')}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Shield className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="externalLinks" className="text-sm sm:text-base">
                  {t('documents.externalLinks', 'Liens externes')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('documents.externalLinksDesc', 'Autoriser l\'ouverture de liens externes')}
                </p>
              </div>
            </div>
            <Switch
              id="externalLinks"
              checked={preferences.allowExternalLinks}
              onCheckedChange={(checked) => handlePreferenceChange('allowExternalLinks', checked)}
              disabled={saving}
              aria-label={t('documents.externalLinks', 'Liens externes')}
            />
          </div>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription className="text-xs sm:text-sm">
              {t(
                'documents.securityInfo',
                'Vos fichiers sont analysés automatiquement pour votre sécurité. Les fichiers suspects seront bloqués.'
              )}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Save Button */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button
            onClick={savePreferences}
            disabled={saving}
            className="shadow-lg"
            aria-label={t('documents.save', 'Enregistrer les modifications')}
          >
            {saving ? (
              <>
                <Loader2 className={`mr-2 h-4 w-4 ${reducedMotion ? '' : 'animate-spin'}`} />
                {t('documents.saving', 'Enregistrement...')}
              </>
            ) : (
              t('documents.save', 'Enregistrer les modifications')
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

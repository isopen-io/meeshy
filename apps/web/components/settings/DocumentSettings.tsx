'use client';

/**
 * Document Settings Component
 * Configuration des préférences de documents et fichiers avec auto-save
 * Utilise le hook usePreferences pour les mises à jour automatiques
 */

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { useI18n } from '@/hooks/use-i18n';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePreferences } from '@/hooks/use-preferences';
import type { DocumentPreference } from '@meeshy/shared/types/preferences';

export function DocumentSettings() {
  const { t } = useI18n('settings');
  const reducedMotion = useReducedMotion();

  // Hook usePreferences avec auto-save
  const {
    preferences,
    isLoading,
    isSaving,
    error,
    updateField,
  } = usePreferences<DocumentPreference>('document');

  // Memoize loading state
  const LoadingState = useMemo(() => (
    <div
      className="flex items-center justify-center py-12"
      role="status"
      aria-label={t('documents.loading', 'Chargement des préférences de documents')}
    >
      <Loader2 className={`h-8 w-8 ${reducedMotion ? '' : 'animate-spin'} text-muted-foreground`} />
      <span className="sr-only">{t('documents.loading', 'Chargement...')}</span>
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
          {t('documents.noData', 'Impossible de charger les préférences de documents')}
        </AlertDescription>
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
              onCheckedChange={(checked) => updateField('autoDownloadEnabled', checked)}
              disabled={isSaving}
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
                  onCheckedChange={(checked) => updateField('autoDownloadOnWifi', checked)}
                  disabled={isSaving}
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
                  onValueChange={([value]) => updateField('autoDownloadMaxSize', value)}
                  disabled={isSaving}
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
              onCheckedChange={(checked) => updateField('inlinePreviewEnabled', checked)}
              disabled={isSaving}
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
                  onCheckedChange={(checked) => updateField('previewPdfEnabled', checked)}
                  disabled={isSaving}
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
                  onCheckedChange={(checked) => updateField('previewImagesEnabled', checked)}
                  disabled={isSaving}
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
                  onCheckedChange={(checked) => updateField('previewVideosEnabled', checked)}
                  disabled={isSaving}
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
              onValueChange={([value]) => updateField('storageQuota', value)}
              disabled={isSaving}
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
              onCheckedChange={(checked) => updateField('autoDeleteOldFiles', checked)}
              disabled={isSaving}
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
                  onChange={(e) => updateField('fileRetentionDays', parseInt(e.target.value) || 90)}
                  className="w-24"
                  disabled={isSaving}
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
              onCheckedChange={(checked) => updateField('compressImagesOnUpload', checked)}
              disabled={isSaving}
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
                onValueChange={([value]) => updateField('imageCompressionQuality', value)}
                disabled={isSaving}
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
              onCheckedChange={(checked) => updateField('scanFilesForMalware', checked)}
              disabled={isSaving}
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
              onCheckedChange={(checked) => updateField('allowExternalLinks', checked)}
              disabled={isSaving}
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
    </div>
  );
}

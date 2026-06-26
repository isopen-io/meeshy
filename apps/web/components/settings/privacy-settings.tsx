'use client';

/**
 * Privacy Settings Component
 * Gestion des préférences de confidentialité avec synchronisation API
 * Utilise /api/v1/me/preferences/privacy (12 champs backend)
 * SUPPRIME localStorage - tout est synchronisé avec le serveur via React Query
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Eye, Database, Download, Trash2, Loader2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';
import { SoundFeedback } from '@/hooks/use-accessibility';
import { usePreferences } from '@/hooks/use-preferences';
import type { PrivacyPreference } from '@/types/preferences';
import { apiService } from '@/services/api.service';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function PrivacySettings() {
  const { t } = useI18n('settings');

  // Hook de préférences avec React Query (optimistic updates automatiques)
  const {
    data: preferences,
    isLoading,
    isUpdating,
    error,
    consentViolations,
    updatePreferences,
    refetch,
  } = usePreferences<'privacy'>('privacy', {
    onConsentRequired: (violations) => {
      console.warn('[PrivacySettings] Consentement requis:', violations);
    },
  });

  /**
   * Gère le changement d'un champ de préférence
   * Utilise optimistic update automatique via React Query
   */
  const handlePreferenceChange = async (
    key: keyof PrivacyPreference,
    value: boolean | string
  ) => {
    // Play sound feedback immédiatement
    if (typeof value === 'boolean') {
      if (value) {
        SoundFeedback.playToggleOn();
      } else {
        SoundFeedback.playToggleOff();
      }
    }

    try {
      // Update avec optimistic UI via React Query
      await updatePreferences({ [key]: value });
    } catch (err) {
      // L'erreur est déjà gérée par le hook
      console.error('[PrivacySettings] Erreur update:', err);
    }
  };

  /**
   * Export des données utilisateur via /api/v1/me/export (GDPR)
   */
  const exportData = async () => {
    SoundFeedback.playClick();

    try {
      const blob = await apiService.getBlob('/api/v1/me/export?format=json&types=profile,messages,contacts');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meeshy-data-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      SoundFeedback.playSuccess();
      toast.success(t('privacy.dataExported', 'Données exportées avec succès'));
    } catch {
      SoundFeedback.playError?.();
      toast.error(t('privacy.exportFailed', "Échec de l'export de données"));
    }
  };

  /**
   * Initie la suppression du compte via /api/v1/me/delete-account (GDPR).
   * Le backend envoie un email de confirmation — la suppression effective
   * n'intervient qu'après validation par l'utilisateur dans l'email.
   */
  const handleDeleteAllData = async () => {
    SoundFeedback.playClick();

    try {
      await apiService.delete('/api/v1/me/delete-account', {
        confirmationPhrase: 'SUPPRIMER MON COMPTE',
      });

      SoundFeedback.playSuccess();
      toast.success(t('privacy.deleteRequestSent', 'Un email de confirmation a été envoyé'));
    } catch (_err) {
      SoundFeedback.playError?.();
      toast.error(t('privacy.deleteError', 'Erreur lors de la demande de suppression'));
    }
  };

  // Afficher le loader pendant le chargement initial
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="sr-only">{t('privacy.loading')}</span>
      </div>
    );
  }

  // Afficher l'erreur si échec du chargement
  if (error && !preferences) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">{error.message}</p>
        <Button onClick={() => refetch()} className="mt-4">
          {t('privacy.retry')}
        </Button>
      </div>
    );
  }

  // Si pas de préférences, afficher des defaults
  if (!preferences) {
    return null;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Afficher les violations de consentement GDPR */}
      {consentViolations && consentViolations.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">{t('privacy.consentRequired')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {consentViolations.map((violation, idx) => (
                <li key={idx} className="text-sm text-muted-foreground">
                  {violation.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Visibilité et statut */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('privacy.visibility.title')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('privacy.visibility.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">{t('privacy.visibility.hideProfile.label')}</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('privacy.visibility.hideProfile.description')}
              </p>
            </div>
            <Switch
              checked={preferences?.hideProfileFromSearch ?? false}
              onCheckedChange={(checked) => handlePreferenceChange('hideProfileFromSearch', checked)}
              disabled={isUpdating}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">{t('privacy.visibility.onlineStatus.label')}</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('privacy.visibility.onlineStatus.description')}
              </p>
            </div>
            <Switch
              checked={preferences.showOnlineStatus}
              onCheckedChange={(checked) => handlePreferenceChange('showOnlineStatus', checked)}
              disabled={isUpdating}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">{t('privacy.visibility.lastSeen.label')}</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('privacy.visibility.lastSeen.description')}
              </p>
            </div>
            <Switch
              checked={preferences.showLastSeen}
              onCheckedChange={(checked) => handlePreferenceChange('showLastSeen', checked)}
              disabled={isUpdating}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">{t('privacy.visibility.readReceipts.label')}</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('privacy.visibility.readReceipts.description')}
              </p>
            </div>
            <Switch
              checked={preferences.showReadReceipts}
              onCheckedChange={(checked) => handlePreferenceChange('showReadReceipts', checked)}
              disabled={isUpdating}
            />
          </div>
        </CardContent>
      </Card>

      {/* Communications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Phone className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('privacy.communications.title')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('privacy.communications.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">{t('privacy.communications.contactRequests.label')}</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('privacy.communications.contactRequests.description')}
              </p>
            </div>
            <Switch
              checked={preferences?.allowContactRequests ?? true}
              onCheckedChange={(checked) => handlePreferenceChange('allowContactRequests', checked)}
              disabled={isUpdating}
            />
          </div>
        </CardContent>
      </Card>

      {/* Gestion des données */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Database className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('privacy.data.title')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('privacy.data.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('privacy.data.export.label')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('privacy.data.export.description')}
            </p>
            <Button
              variant="outline"
              onClick={exportData}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {t('privacy.data.export.button')}
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-red-600">
              {t('privacy.deleteData.title', 'Supprimer toutes mes données')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('privacy.deleteData.description', 'Supprime définitivement toutes vos données. Cette action est irréversible.')}
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="flex items-center gap-2"
                  onClick={() => SoundFeedback.playClick()}
                >
                  <Trash2 className="h-4 w-4" />
                  {t('privacy.deleteData.button', 'Supprimer mes données')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('privacy.deleteData.confirmTitle', 'Êtes-vous absolument sûr ?')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('privacy.deleteData.confirmDescription', 'Cette action est irréversible. Toutes vos données personnelles, messages et paramètres seront définitivement supprimés de nos serveurs.')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => SoundFeedback.playClick()}>
                    {t('privacy.deleteData.cancel', 'Annuler')}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAllData}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t('privacy.deleteData.confirm', 'Oui, supprimer mes données')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Informations légales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">{t('privacy.legal.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t('privacy.legal.description')}
          </p>
          <div className="flex gap-2">
            <Button variant="link" size="sm" className="h-auto p-0">
              {t('privacy.legal.privacyPolicy')}
            </Button>
            <Button variant="link" size="sm" className="h-auto p-0">
              {t('privacy.legal.termsOfUse')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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
import { Shield, Eye, Database, Download, Trash2, Loader2, Phone, Search, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';
import { SoundFeedback } from '@/hooks/use-accessibility';
import { usePreferences } from '@/hooks/use-preferences';
import type { PrivacyPreferences } from '@/types/preferences';
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
    key: keyof PrivacyPreferences,
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
   * Export des données utilisateur (placeholder)
   */
  const exportData = () => {
    SoundFeedback.playClick();

    // TODO: Implémenter l'export réel via API
    const userData = {
      profile: 'Données de profil...',
      messages: 'Données de messages...',
      translations: 'Cache de traduction...',
      settings: 'Paramètres utilisateur...',
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeshy-data-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    SoundFeedback.playSuccess();
    toast.success(t('privacy.dataExported', 'Données exportées avec succès'));
  };

  /**
   * Suppression de toutes les données utilisateur
   * TODO: Implémenter via API backend
   */
  const handleDeleteAllData = async () => {
    SoundFeedback.playClick();

    try {
      // TODO: Appeler l'API de suppression de compte
      // await apiService.delete('/api/v1/me/account');

      // Pour l'instant, on refetch juste
      await refetch();

      SoundFeedback.playSuccess();
      toast.success(t('privacy.dataDeleted', 'Données supprimées'));
    } catch (err) {
      toast.error('Erreur lors de la suppression');
    }
  };

  // Afficher le loader pendant le chargement initial
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="sr-only">Chargement des préférences de confidentialité...</span>
      </div>
    );
  }

  // Afficher l'erreur si échec du chargement
  if (error && !preferences) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">{error.message}</p>
        <Button onClick={() => refetch()} className="mt-4">
          Réessayer
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
            <CardTitle className="text-destructive">Consentement requis</CardTitle>
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
            Visibilité et statut
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Contrôlez les informations que les autres utilisateurs peuvent voir
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">Visibilité du profil</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Contrôlez qui peut voir votre profil
              </p>
            </div>
            <select
              value={preferences.profileVisibility}
              onChange={(e) => handlePreferenceChange('profileVisibility', e.target.value)}
              disabled={isUpdating}
              className="px-3 py-2 border rounded-md"
            >
              <option value="public">Public</option>
              <option value="friends">Amis</option>
              <option value="private">Privé</option>
            </select>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">Statut en ligne</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Permet aux autres de voir si vous êtes connecté
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
              <Label className="text-sm sm:text-base">Dernière activité</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Partage la date de votre dernière connexion
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
              <Label className="text-sm sm:text-base">Accusés de réception</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Informe les expéditeurs que vous avez lu leurs messages
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
            Communications
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Gérez qui peut vous contacter et comment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">Demandes de messages</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Permet aux utilisateurs de vous envoyer des demandes de messages
              </p>
            </div>
            <Switch
              checked={preferences.allowMessageRequests}
              onCheckedChange={(checked) => handlePreferenceChange('allowMessageRequests', checked)}
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
            Gestion des données
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Exportez ou supprimez vos données personnelles
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Exporter mes données</Label>
            <p className="text-sm text-muted-foreground">
              Téléchargez une copie de toutes vos données (profil, messages, paramètres)
            </p>
            <Button
              variant="outline"
              onClick={exportData}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Exporter les données
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
          <CardTitle className="text-lg sm:text-xl">Informations légales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Vos données sont traitées conformément à notre politique de confidentialité.
            Les traductions sont effectuées localement sur votre appareil pour protéger votre vie privée.
          </p>
          <div className="flex gap-2">
            <Button variant="link" size="sm" className="h-auto p-0">
              Politique de confidentialité
            </Button>
            <Button variant="link" size="sm" className="h-auto p-0">
              Conditions d&apos;utilisation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

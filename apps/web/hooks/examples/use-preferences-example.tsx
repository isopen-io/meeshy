/**
 * Exemples d'utilisation du hook usePreferences<T>
 *
 * Ce fichier illustre les différentes façons d'utiliser le hook
 * pour gérer les préférences utilisateur avec React Query.
 */

'use client';

import { useState } from 'react';
import { usePreferences } from '@/hooks/use-preferences';
import { ConsentDialog } from '@/components/settings/ConsentDialog';
import type {
  TranslationPreferences,
  NotificationPreferences,
  ConsentViolation
} from '@/types/preferences';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

// ===== EXEMPLE 1: Préférences de Traduction avec Gestion de Consentement =====

export function TranslationPreferencesExample() {
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<Partial<TranslationPreferences> | null>(null);

  const {
    data: preferences,
    isLoading,
    isUpdating,
    updatePreferences,
    consentViolations,
  } = usePreferences('translation', {
    onConsentRequired: (violations) => {
      console.log('Consent required for:', violations);
      setShowConsentDialog(true);
    },
    onSuccess: () => {
      toast.success('Translation preferences updated');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleToggleTranscription = async (enabled: boolean) => {
    const update = { transcriptionEnabled: enabled };
    setPendingUpdate(update);

    try {
      await updatePreferences(update);
    } catch (err) {
      // L'erreur est gérée par onError et onConsentRequired
      console.error('Failed to update:', err);
    }
  };

  const handleConsentAccepted = async (consents: Record<string, boolean>) => {
    // Ici vous devriez mettre à jour les consentements via une API dédiée
    // Par exemple: await apiService.patch('/api/v1/me/consents', consents);

    console.log('Consents accepted:', consents);

    // Réessayer la mise à jour après acceptation des consentements
    if (pendingUpdate) {
      try {
        await updatePreferences(pendingUpdate);
        setPendingUpdate(null);
      } catch (err) {
        console.error('Update failed after consent:', err);
      }
    }
  };

  if (isLoading) {
    return <div>Loading preferences...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Translation Preferences</h2>

      {preferences && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label>Auto Translate</label>
            <Switch
              checked={preferences.autoTranslate}
              onCheckedChange={(checked) =>
                updatePreferences({ autoTranslate: checked })
              }
              disabled={isUpdating}
            />
          </div>

          <div className="flex items-center justify-between">
            <label>Transcription Enabled</label>
            <Switch
              checked={preferences.transcriptionEnabled}
              onCheckedChange={handleToggleTranscription}
              disabled={isUpdating}
            />
          </div>

          <div className="flex items-center justify-between">
            <label>Show Original Text</label>
            <Switch
              checked={preferences.showOriginalText}
              onCheckedChange={(checked) =>
                updatePreferences({ showOriginalText: checked })
              }
              disabled={isUpdating}
            />
          </div>
        </div>
      )}

      {/* Dialogue de consentement */}
      {consentViolations && (
        <ConsentDialog
          open={showConsentDialog}
          onOpenChange={setShowConsentDialog}
          violations={consentViolations}
          onConsent={handleConsentAccepted}
          mode="blocking"
        />
      )}
    </div>
  );
}

// ===== EXEMPLE 2: Préférences de Notifications (Sans Consentement) =====

export function NotificationPreferencesExample() {
  const {
    data: preferences,
    isLoading,
    isUpdating,
    updatePreferences,
    error,
  } = usePreferences('notifications', {
    onSuccess: () => {
      toast.success('Notification preferences updated');
    },
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Notification Preferences</h2>

      {preferences && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label>Push Notifications</label>
            <Switch
              checked={preferences.enablePushNotifications}
              onCheckedChange={(checked) =>
                updatePreferences({ enablePushNotifications: checked })
              }
              disabled={isUpdating}
            />
          </div>

          <div className="flex items-center justify-between">
            <label>Email Notifications</label>
            <Switch
              checked={preferences.enableEmailNotifications}
              onCheckedChange={(checked) =>
                updatePreferences({ enableEmailNotifications: checked })
              }
              disabled={isUpdating}
            />
          </div>

          <div className="flex items-center justify-between">
            <label>Vibration</label>
            <Switch
              checked={preferences.vibrationEnabled}
              onCheckedChange={(checked) =>
                updatePreferences({ vibrationEnabled: checked })
              }
              disabled={isUpdating}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ===== EXEMPLE 3: Mise à Jour Multiple (Batch Update) =====

export function BatchUpdateExample() {
  const {
    data: preferences,
    isLoading,
    isUpdating,
    updatePreferences,
  } = usePreferences('privacy');

  const handleSaveAll = async () => {
    // Mettre à jour plusieurs champs en une seule requête
    try {
      await updatePreferences({
        profileVisibility: 'friends',
        showOnlineStatus: true,
        showReadReceipts: false,
        allowMessageRequests: true,
      });

      toast.success('All privacy settings saved!');
    } catch (err) {
      toast.error('Failed to save settings');
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Privacy Preferences</h2>

      {preferences && (
        <>
          <div className="space-y-2">
            <p>Profile Visibility: {preferences.profileVisibility}</p>
            <p>Online Status: {preferences.showOnlineStatus ? 'Visible' : 'Hidden'}</p>
            <p>Read Receipts: {preferences.showReadReceipts ? 'On' : 'Off'}</p>
          </div>

          <Button
            onClick={handleSaveAll}
            disabled={isUpdating}
          >
            {isUpdating ? 'Saving...' : 'Save All Changes'}
          </Button>
        </>
      )}
    </div>
  );
}

// ===== EXEMPLE 4: Remplacement Complet (PUT) =====

export function CompleteReplacementExample() {
  const {
    data: preferences,
    isLoading,
    isUpdating,
    replacePreferences,
  } = usePreferences('audio');

  const handleResetToDefaults = async () => {
    // Remplacer complètement les préférences
    const defaultPreferences = {
      enableVoiceMessages: true,
      autoPlayVoiceMessages: false,
      voiceMessageSpeed: 1.0,
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
      voiceQuality: 'medium' as const,
    };

    try {
      await replacePreferences(defaultPreferences);
      toast.success('Preferences reset to defaults');
    } catch (err) {
      toast.error('Failed to reset preferences');
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Audio Preferences</h2>

      {preferences && (
        <>
          <pre className="bg-gray-100 p-4 rounded">
            {JSON.stringify(preferences, null, 2)}
          </pre>

          <Button
            onClick={handleResetToDefaults}
            disabled={isUpdating}
            variant="destructive"
          >
            {isUpdating ? 'Resetting...' : 'Reset to Defaults'}
          </Button>
        </>
      )}
    </div>
  );
}

// ===== EXEMPLE 5: Lazy Loading =====

export function LazyLoadingExample() {
  const {
    data: preferences,
    isLoading,
    refetch,
  } = usePreferences('accessibility', {
    enabled: false, // Ne charge pas automatiquement
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Lazy Loading Example</h2>

      <Button onClick={() => refetch()}>
        Load Preferences
      </Button>

      {isLoading && <p>Loading...</p>}

      {preferences && (
        <pre className="bg-gray-100 p-4 rounded">
          {JSON.stringify(preferences, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ===== EXEMPLE 6: Auto-Revalidation =====

export function AutoRevalidationExample() {
  const {
    data: preferences,
    isLoading,
  } = usePreferences('video', {
    revalidateInterval: 30000, // Revalider toutes les 30 secondes
    onSuccess: () => {
      console.log('Preferences revalidated');
    },
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Auto-Revalidating Preferences</h2>
      <p className="text-sm text-gray-500">
        These preferences are automatically refreshed every 30 seconds
      </p>

      {preferences && (
        <pre className="bg-gray-100 p-4 rounded">
          {JSON.stringify(preferences, null, 2)}
        </pre>
      )}
    </div>
  );
}

import { appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

/**
 * LA FICHE DE L'APP DANS LES RÉGLAGES (#8882) — miroir
 * `MediaPermissionCoordinator.openSettings()` iOS. Dans la coque Android, deux
 * refus d'une permission suffisent pour qu'Android ne la redemande plus jamais :
 * un « Réessayer » y rejetterait aussitôt, en silence. Seule cette fiche la rend
 * (`MeeshyNotificationSettingsPlugin.openApp`).
 *
 * `null` dans un navigateur, ou dans une coque construite avant `openApp` : la
 * demande de permission du navigateur, elle, se rejoue.
 */
export function appSettingsOpener(coque: CoqueNative | undefined = coqueCourante()): (() => void) | null {
  const openApp = appelNatifMethode(coque, 'MeeshyNotificationSettings', 'openApp');
  if (openApp === null) return null;
  return () => {
    void openApp({}).catch(() => undefined);
  };
}

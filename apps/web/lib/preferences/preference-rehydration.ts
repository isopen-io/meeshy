import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useUserPreferencesStore } from '@/stores/user-preferences-store';
import { rehydrateMirroredPreferences } from '@/lib/preferences/mirrored-preference-categories';

/**
 * Le SECOND déclencheur — PÉRENNE — du double que les surfaces de messagerie
 * rendent.
 *
 * Les trois routes livrées au cycle 133 sont toutes ÉPHÉMÈRES : elles exigent
 * que l'onglet soit PRÉSENT pour entendre — un socket vivant ET
 * `useSocketCacheSync` monté (écrans de conversation seulement), un autre
 * onglet du même navigateur, ou le geste fait ici.
 *
 * > Une diffusion n'atteint que les appareils PRÉSENTS pour l'entendre, et rien
 * > ne rejoue l'événement manqué — un abonnement enregistre un écouteur, il ne
 * > demande pas d'arriéré (leçon 310).
 *
 * Un onglet resté ouvert pendant une coupure de socket n'entend donc rien, et
 * son bloc reste périmé INDÉFINIMENT. La connexion est le déclencheur qui
 * manque : elle couvre du même geste l'ouverture de session et le rattrapage
 * après coupure.
 */

type ConnectionDiagnostics = { isConnected?: boolean } | null | undefined;

/**
 * « Pas connecté » ne veut PAS dire « décroché ».
 *
 * `ConnectionService.connect()` émet un diagnostic `isConnected: false` sur le
 * chemin qui OUVRE la connexion (`isConnecting = true`), et `connect_error` en
 * émet un autre. Un démarrage à froid voit donc au moins un `false` avant son
 * premier `true` : le lire comme une coupure ferait payer à CHAQUE chargement
 * de page une relecture pour zéro fraîcheur de plus.
 *
 * Une coupure ne s'observe qu'APRÈS une connexion — d'où `everConnected`.
 */
type MissedWindow = {
  everConnected: boolean;
  missed: boolean;
};

/**
 * Le rattrapage est dû quand une annonce a pu être manquée : après un vrai
 * décrochage, ou quand la passe d'hydratation initiale s'est terminée SANS
 * RIEN LIRE.
 *
 * `lastSyncedAt` dit exactement cela depuis qu'`initialize()` ne le pose que
 * sur une lecture aboutie : pas de jeton au montage, ou les quatre `GET`
 * tombés — l'onglet ouvert hors ligne. Les deux rendent un store qui n'a lu
 * personne, et la première connexion le remplit.
 *
 * Deux clauses le retiennent, et elles couvrent deux fenêtres différentes :
 *
 * - `isInitialized` — la passe initiale n'a pas encore rendu son verdict.
 *   `initialize()` n'est lancé qu'APRÈS l'authentification ; une connexion
 *   socket qui arrive avant lui trouverait `lastSyncedAt` à null et paierait
 *   deux `GET` que la passe s'apprête à faire.
 * - `isLoading` — l'hydratation est EN VOL. Elle lit les mêmes lignes, et la
 *   doubler serait exactement la requête gratuite que `everConnected` évite
 *   par ailleurs.
 */
function isDue(
  missedWindow: MissedWindow,
  state: { isLoading: boolean; isInitialized: boolean; lastSyncedAt: string | null },
): boolean {
  if (state.isLoading) return false;
  return missedWindow.missed || (state.isInitialized && state.lastSyncedAt === null);
}

/**
 * Abonne le double des préférences à l'état de connexion et rend la
 * désinscription.
 *
 * Un saut motivé par une hydratation en vol ne CONSOMME pas le décrochage : la
 * fenêtre reste ouverte, et la prochaine connexion la referme. Sans cela, une
 * coupure survenue pendant le démarrage resterait sans rattrapage.
 */
export function startMirroredPreferenceRehydration(): () => void {
  const missedWindow: MissedWindow = { everConnected: false, missed: false };

  return meeshySocketIOService.onStatusChange((diag: ConnectionDiagnostics) => {
    if (!diag?.isConnected) {
      if (missedWindow.everConnected) missedWindow.missed = true;
      return;
    }

    missedWindow.everConnected = true;

    if (!isDue(missedWindow, useUserPreferencesStore.getState())) return;

    missedWindow.missed = false;
    rehydrateMirroredPreferences();
  });
}

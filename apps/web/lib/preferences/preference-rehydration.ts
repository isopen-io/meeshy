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
 * décrochage, ou quand AUCUNE passe d'hydratation n'a été menée.
 *
 * `lastSyncedAt` dit exactement cela, et rien de plus : `initialize()` sort
 * avant de lire quand il n'y a pas de jeton au montage — un jeton qui arrive
 * ensuite trouve donc un store qui n'a lu personne, et sa première connexion
 * le remplit. Ce champ ne dit PAS que la lecture a RÉUSSI : `syncAll()` absorbe
 * l'échec de chacun de ses quatre `GET`, donc une passe entièrement ratée pose
 * quand même l'horodatage. Voir le suivi mesuré du cycle 134.
 *
 * Le rattrapage n'est pas dû tant qu'une hydratation est déjà en vol :
 * `initialize()` lit les mêmes lignes, et la doubler serait exactement la
 * requête gratuite que la clause `everConnected` évite par ailleurs.
 */
function isDue(missedWindow: MissedWindow, state: { isLoading: boolean; lastSyncedAt: string | null }): boolean {
  if (state.isLoading) return false;
  return missedWindow.missed || state.lastSyncedAt === null;
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

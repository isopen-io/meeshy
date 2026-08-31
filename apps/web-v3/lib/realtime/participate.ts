import type { MessageServi } from '@/app/(public)/chats/[lien]/fil-modele';
import { messageDepuis } from '@/lib/api/messagerie';

import { POLITIQUE_DE_RECONNEXION } from './reconnect-policy';

/**
 * LE TRANSPORT DE LA PARTICIPATION — et il ne se charge qu'AU TAP.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EST SEUL DE SON ESPÈCE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le corollaire 1 du § 3.2 : « aucun fichier de `app/` ou `components/`
 * n'importe `socket.io-client` directement », et le temps réel s'expose en
 * DEUX fichiers, jamais un barrel — la lecture (revalidation au focus, aucun
 * transport : `lifecycle.ts`, importable statiquement) et celui-ci, chargé
 * UNIQUEMENT par `await import()`. Un barrel pousserait les 12 796 octets du
 * client Socket.IO dans le chunk `(public)`, que le § 8.3 gate à zéro avant le tap.
 *
 * Le module lui-même n'importe donc `socket.io-client` que DANS sa fonction, et
 * pas en tête de fichier : ce qui l'importerait par erreur ne tirerait que ce
 * texte, pas le transport.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UNE CONNEXION, PAS TROIS — ET AUCUN NAMESPACE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Fait serveur mesuré (§ 5.3) : `grep -rn "\.of(" services/gateway/src` = zéro
 * occurrence. La passerelle ne déclare AUCUN namespace ; tout vit dans le
 * namespace par défaut et la séparation se fait par ROOMS. Les trois `io(...)`
 * de `apps/web` sont trois connexions redondantes vers le même endroit. La v3
 * en ouvre UNE.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * L'INVITÉ EST DÉJÀ SUPPORTÉ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `AuthHandler.handleTokenAuthentication` lit `handshake.auth.sessionToken`
 * (`socketio/utils/socket-helpers.ts`, `extractSessionToken`) et bascule sur
 * `_authenticateAnonymousUser`. Il n'y a rien à écrire côté passerelle : la
 * seule chose que la v3 doit faire est de POSER la clé, et de ne poser AUCUN
 * `Authorization` — un invité qui en porterait un serait un invité qu'on aurait
 * confondu avec un membre.
 */

/** Ce que l'îlot reçoit du transport — jamais un objet de la bibliothèque. */
export type Participation = {
  /**
   * La SUSPENSION du § 6.2, première ligne : un onglet caché ne fait RIEN
   * partir. Une connexion tenue n'est pas neutre — le transport de repli
   * d'Engine.IO est du long-polling, c'est-à-dire une requête XHR relancée sans
   * fin, exactement ce que la barre « 0 requête pendant que l'onglet est
   * `hidden` » du § 8.5 interdit. Elle coûterait de surcroît la batterie et les
   * données d'un téléphone en 3G pendant que personne ne regarde.
   */
  readonly suspend: () => void;
  /** La reprise IMMÉDIATE du § 6.3 C — voir le doc-comment de son implémentation. */
  readonly reprend: () => void;
  readonly ferme: () => void;
};

export type OuvertureDeParticipation = {
  readonly base: string;
  readonly jeton: string;
  readonly conversationId: string;
  readonly participantId: string;
  /** Ce que le transport REÇOIT — l'îlot décide quoi en faire. */
  readonly surMessage: (message: MessageServi) => void;
  readonly surEtat: (connecte: boolean) => void;
};

/**
 * Les événements consommés, nommés ici plutôt qu'inlinés : la source de vérité
 * est `packages/shared/types/socketio-events.ts`, et la convention est
 * `entity:action-word` avec des TIRETS (`CLAUDE.md`, « Event Naming
 * Convention ») — un `message_new` ne lèverait aucune erreur, il se tairait.
 */
const EVENEMENTS = {
  rejoindre: 'conversation:join',
  quitter: 'conversation:leave',
  message: 'message:new',
} as const;

export const ouvreLaParticipation = async ({
  base,
  jeton,
  conversationId,
  participantId,
  surMessage,
  surEtat,
}: OuvertureDeParticipation): Promise<Participation> => {
  const { io } = await import('socket.io-client');

  const socket = io(base, {
    auth: { sessionToken: jeton },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: POLITIQUE_DE_RECONNEXION.delaiMs,
    reconnectionDelayMax: POLITIQUE_DE_RECONNEXION.delaiMaximumMs,
    randomizationFactor: POLITIQUE_DE_RECONNEXION.facteurDeDispersion,
  });

  socket.on('connect', () => {
    surEtat(true);
    socket.emit(EVENEMENTS.rejoindre, { conversationId });
  });

  socket.on('disconnect', () => surEtat(false));

  socket.on(EVENEMENTS.message, (charge: unknown) => {
    const message = messageDepuis(charge, participantId);
    if (message !== null) surMessage(message);
  });

  return {
    suspend: () => {
      socket.disconnect();
    },
    /**
     * LE COURT-CIRCUIT DU BACKOFF, et c'est `connect()` qui l'est.
     *
     * Mesuré dans la bibliothèque plutôt que supposé : `Manager` n'expose
     * AUCUN accesseur pour remettre son compteur d'essais à zéro
     * (`backoff.reset()` est privé, appelé par `onclose` et `onreconnect`).
     * Ce que `socket.connect()` fait, en revanche, est `manager.open()` — une
     * ouverture IMMÉDIATE, qui ne consulte pas la minuterie de reconnexion en
     * attente. C'est exactement la « reconnexion immédiate » du § 6.3 C : sans
     * elle, un onglet revenu après dix minutes attend le palier de trente
     * secondes en regardant une conversation muette qu'il croit à jour.
     *
     * `reconnect-policy.ts` porte la même note du côté où la politique se lit :
     * la décision est NOMMÉE là-bas, elle n'y est pas encodée en un appel qui
     * n'existe pas.
     */
    reprend: () => {
      if (socket.connected) return;
      socket.connect();
    },
    ferme: () => {
      if (socket.connected) socket.emit(EVENEMENTS.quitter, { conversationId });
      socket.close();
    },
  };
};

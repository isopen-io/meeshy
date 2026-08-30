import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { AuthSessionRevokedEventData } from '@meeshy/shared/types/socketio-events';
import type { RevokedSessionIO, RevokedSessionSocket } from './disconnectRevokedSessions';

/**
 * La clé où l'identifiant de session est rangé sur un socket.
 *
 * L'IDENTIFIANT, jamais le jeton : `UserSession.sessionToken` stocke un HASH,
 * et le jeton en clair n'a aucune raison de survivre à l'authentification. Un
 * socket qui le porterait le rendrait lisible à tout code qui inspecte
 * `socket.data` — un périmètre bien plus large que la poignée de lignes qui en
 * avaient besoin.
 */
export const SOCKET_SESSION_ID = 'sessionId' as const;

export interface SessionAwareSocket extends RevokedSessionSocket {
  readonly data?: Record<string, unknown>;
}

export interface DisconnectSessionIO {
  in(room: string): { fetchSockets(): Promise<SessionAwareSocket[]> };
}

export interface DisconnectSessionParams {
  io: DisconnectSessionIO | null | undefined;
  /** `User.id` — les sockets inscrits rejoignent `ROOMS.user(user.id)`. */
  userId: string;
  /** `UserSession.id` — le SEUL socket à couper. */
  sessionId: string;
  message?: string;
  onError?: (error: unknown) => void;
}

/**
 * Couper le socket d'UNE session nommée — et lui seul (#4213).
 *
 * ## Pourquoi une fonction SŒUR, et non un paramètre de plus
 *
 * `disconnectRevokedSessions` coupe TOUS les sockets d'un utilisateur, et c'est
 * le bon périmètre pour ses deux appelants : le lien « ce n'était pas moi » et
 * la réinitialisation de mot de passe invalident TOUTES les sessions.
 *
 * Les trois chemins restants en épargnent une — `DELETE /sessions/:id` vise une
 * session nommée, `DELETE /sessions` garde la courante, `POST /logout` ne coupe
 * que la courante. Les brancher sur la fonction totale déconnecterait
 * l'appareil DEPUIS LEQUEL on fait le ménage : un défaut pire que celui qu'on
 * corrige.
 *
 * Les deux périmètres sont légitimes et distincts. Deux fonctions le disent ;
 * un drapeau le cacherait.
 *
 * ## Le socket qui n'est PAS visé reste connecté
 *
 * C'est le témoin qui compte, plus que celui du socket coupé : une révocation
 * qui déconnecte trop est indiscernable d'une panne, et l'utilisateur la vit
 * comme telle.
 *
 * ## Le repli d'un socket SANS identifiant de session
 *
 * Un client antérieur à ce lot ne transmet pas son jeton de session au
 * handshake : son socket n'a pas de `sessionId`, et cette fonction le LAISSE
 * connecté. C'est une décision, pas un oubli — et elle est fail-OPEN, à
 * l'inverse de ce qu'on écrit d'habitude :
 *
 * - couper tous les sockets sans identifiant reviendrait à déconnecter toutes
 *   les versions installées à chaque révocation d'une session tierce, y compris
 *   celle depuis laquelle on agit ;
 * - le contrôle qui compte reste la RÉVOCATION EN BASE, déjà committée quand
 *   cette fonction s'exécute. Le socket épargné ne peut plus rien
 *   ré-authentifier ; il perdra sa connexion à sa prochaine reconnexion.
 *
 * Ce repli est donc borné dans le temps par le déploiement des clients, et son
 * coût est une fenêtre de réception, pas une fenêtre d'action.
 *
 * Best-effort, ne lève jamais : la révocation est déjà écrite, et un adaptateur
 * indisponible ne doit pas transformer une déconnexion réussie en 500.
 * Rend le nombre de sockets réellement fermés.
 */
export async function disconnectSession(params: DisconnectSessionParams): Promise<number> {
  const { io, userId, sessionId, message, onError } = params;
  if (!io || !userId || !sessionId) return 0;

  const payload: AuthSessionRevokedEventData = {
    code: 'session_revoked',
    message: message ?? 'This device was signed out — please sign in again.',
    reason: 'admin_revoke',
  };

  try {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    let fermes = 0;

    for (const socket of sockets) {
      if (socket.data?.[SOCKET_SESSION_ID] !== sessionId) continue;

      // Émettre PUIS fermer, dans cet ordre : l'émission est une courtoisie
      // faite à un client conforme pour qu'il efface sa session locale ; c'est
      // la fermeture qui révoque. `disconnect(true)` ferme la connexion
      // sous-jacente, pas seulement l'espace de noms.
      socket.emit(SERVER_EVENTS.AUTH_SESSION_REVOKED, payload);
      socket.disconnect(true);
      fermes += 1;
    }

    return fermes;
  } catch (error) {
    onError?.(error);
    return 0;
  }
}

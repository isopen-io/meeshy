import type { SocketAuth } from '@/lib/net/socket';

import type { SessionState } from './session';

export type RealtimeIdentity = {
  /** Change ⇒ la connexion se RECONSTRUIT (jeton renouvelé, bascule compte ↔ invité). */
  readonly key: string;
  readonly auth: SocketAuth;
};

/**
 * QUI PARLE SUR LA SOCKET (#9724) — l'identité EFFECTIVE de la session, ou
 * personne.
 *
 * L'invité d'un lien n'ouvrait AUCUNE connexion : tout ce que la passerelle lui
 * poussait (le message de l'hôte, la frappe, et la traduction de l'historique
 * que le rattrapage d'arrivée #9709 produit quelques secondes APRÈS sa jonction)
 * partait dans une file que rien ne drainait. Mesuré en recette : le fil restait
 * dans la langue de l'expéditeur jusqu'au rechargement, sans une requête
 * `socket.io` en 48 s.
 *
 * La poignée de main de l'invité ne porte que son `sessionToken` : sans jeton,
 * la passerelle l'authentifie en ANONYME (`_authenticateAnonymousUser`), le fait
 * entrer dans la room de SA conversation et dans sa room personnelle, puis
 * draine sa file hors ligne. Un compte qui lit en anonyme (#8816) ne prête RIEN
 * de lui à cette socket — la sienne est fermée le temps de la lecture.
 */
export function realtimeIdentityOf(session: SessionState): RealtimeIdentity | null {
  if (session.status === 'authenticated') {
    return { key: `t:${session.token}`, auth: { token: session.token, sessionToken: session.sessionToken } };
  }
  if (session.status === 'guest') {
    return { key: `g:${session.sessionToken}`, auth: { sessionToken: session.sessionToken } };
  }
  return null;
}

export type RealtimeConnectionKeeper = {
  /** Aligne la connexion sur la session : l'ouvre, la garde, la reconstruit ou la ferme. */
  sync(session: SessionState): void;
};

/**
 * UNE connexion par IDENTITÉ — la règle de `realtime.ts § syncConnection`,
 * sortie du module qui s'amorce au chargement pour qu'un témoin la joue : une
 * même identité garde sa socket, une identité qui change (jeton renouvelé,
 * bascule compte ↔ invité) détruit l'ancienne AVANT d'ouvrir la sienne, et
 * personne ne garde rien.
 */
export function keepRealtimeConnection<C extends { destroy(): void }>(deps: {
  readonly open: (auth: SocketAuth) => C;
  readonly onChange: (next: C | null) => void;
}): RealtimeConnectionKeeper {
  let current: C | null = null;
  let currentKey: string | null = null;
  return {
    sync(session) {
      const identity = realtimeIdentityOf(session);
      if (identity === null) {
        current?.destroy();
        current = null;
        currentKey = null;
        deps.onChange(null);
        return;
      }
      if (current !== null && currentKey === identity.key) return;
      current?.destroy();
      currentKey = identity.key;
      current = deps.open(identity.auth);
      deps.onChange(current);
    },
  };
}

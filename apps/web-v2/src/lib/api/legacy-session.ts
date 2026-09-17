import type { SessionStorage, SessionUser } from './session';

/**
 * LA SESSION DU LEGACY, REPRISE UNE FOIS (bascule de meeshy.me, #6702).
 *
 * La v2 remplace le legacy sur la même origine : elle hérite donc de son
 * `localStorage`. Sans reprise, CHAQUE personne connectée serait déconnectée
 * par la bascule. Ce module lit ce que le legacy a laissé, le valide, et rend
 * une session que `session.ts` écrit sous `meeshy.session` puis restaure par
 * son chemin ordinaire.
 *
 * ## Ce que le legacy persiste — mesuré dans `apps/web`
 *
 *  - `AuthManager` (`services/auth-manager.service.ts`, clés de
 *    `constants/auth.ts`), sa source de vérité : `meeshy_auth_token` (le JWT
 *    BRUT), `meeshy_session_token` (brut, absent d'une connexion sans session
 *    nommée), `meeshy_user_data` (l'utilisateur servi, en JSON) ;
 *  - le magasin zustand persisté `meeshy-auth` (`stores/auth-store.ts`) :
 *    `{ state: { user, authToken, sessionToken, sessionExpiry }, version: 0 }`.
 *    Son `setTokens` (rafraîchissement) n'écrit QUE là : les deux sources
 *    peuvent porter deux jetons, et celui qui dure le plus longtemps gagne.
 *
 * ## Fail-closed
 *
 * Une source n'est reprise que si son jeton est un JWT dont le claim `exp`
 * est à venir, et dont le claim `userId` (`signSessionToken`,
 * `services/gateway/src/services/auth/session-jwt.ts`) désigne la MÊME
 * personne que la fiche utilisateur. Toute autre forme — JSON illisible, jeton
 * opaque, échéance absente, fiche d'un autre compte — ne crée rien et ne lève
 * rien. Le serveur reste l'autorité : un jeton révoqué sera refusé au premier
 * appel (401), qui ramène le magasin à l'état déconnecté.
 *
 * ## Une fois par jeton
 *
 * Les clés du legacy ne sont PAS effacées : un retour arrière du déploiement
 * ne doit déconnecter personne. Il faut donc qu'une déconnexion ou un refus
 * TIENNENT au démarrage suivant, alors que le jeton du legacy est toujours là.
 * L'empreinte du jeton repris est notée sous `meeshy.session.legacy-claimed` ;
 * le même jeton n'est jamais repris deux fois, un NOUVEAU jeton (une
 * connexion au legacy après coup) l'est. L'empreinte est un condensé FNV-1a
 * de 32 bits : elle distingue deux jetons, et ne permet d'en reconstituer
 * aucun. Aucune fonction de ce module ne journalise quoi que ce soit.
 */

const AUTH_MANAGER_KEYS = {
  token: 'meeshy_auth_token',
  sessionToken: 'meeshy_session_token',
  user: 'meeshy_user_data',
} as const;

const ZUSTAND_KEY = 'meeshy-auth';

const CLAIMED_KEY = 'meeshy.session.legacy-claimed';

export type LegacySession = {
  readonly token: string;
  readonly sessionToken: string;
  readonly user: SessionUser;
  readonly expiresAt: number;
};

type Candidate = { readonly token: unknown; readonly sessionToken: unknown; readonly user: unknown };

function read(storage: SessionStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function write(storage: SessionStorage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    /* Stockage refusé : la reprise tient pour l'onglet (même doctrine que `session.ts#persist`). */
  }
}

function parsed(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const recordOf = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** La charge d'un JWT — inspection seule, la signature est l'affaire du serveur. */
function jwtClaims(token: string): Readonly<Record<string, unknown>> | null {
  const parts = token.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || payload === undefined || payload === '') return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
    return recordOf(JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))));
  } catch {
    return null;
  }
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const nullableText = (value: unknown): string | null | undefined => (value === null ? null : text(value));

/** La fiche du legacy PROJETÉE sur `SessionUser` — un champ de type inattendu est ignoré, jamais recopié. */
function sessionUserOf(value: unknown): SessionUser | null {
  const user = recordOf(value);
  if (user === null || typeof user.id !== 'string' || typeof user.username !== 'string') return null;
  const displayName = text(user.displayName);
  const avatar = text(user.avatar);
  const systemLanguage = text(user.systemLanguage);
  const regionalLanguage = text(user.regionalLanguage);
  const customDestinationLanguage = nullableText(user.customDestinationLanguage);
  return {
    id: user.id,
    username: user.username,
    ...(displayName === undefined ? {} : { displayName }),
    ...(avatar === undefined ? {} : { avatar }),
    ...(systemLanguage === undefined ? {} : { systemLanguage }),
    ...(regionalLanguage === undefined ? {} : { regionalLanguage }),
    ...(customDestinationLanguage === undefined ? {} : { customDestinationLanguage }),
  };
}

const authManagerCandidate = (storage: SessionStorage): Candidate => ({
  token: read(storage, AUTH_MANAGER_KEYS.token),
  sessionToken: read(storage, AUTH_MANAGER_KEYS.sessionToken),
  user: parsed(read(storage, AUTH_MANAGER_KEYS.user)),
});

function zustandCandidate(storage: SessionStorage): Candidate {
  const state = recordOf(recordOf(parsed(read(storage, ZUSTAND_KEY)))?.state);
  return { token: state?.authToken, sessionToken: state?.sessionToken, user: state?.user };
}

function sessionOf(candidate: Candidate, now: number): LegacySession | null {
  if (typeof candidate.token !== 'string') return null;
  const claims = jwtClaims(candidate.token);
  const user = sessionUserOf(candidate.user);
  if (claims === null || user === null || claims.userId !== user.id) return null;
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) return null;
  const expiresAt = claims.exp * 1000;
  if (expiresAt <= now) return null;
  return { token: candidate.token, sessionToken: text(candidate.sessionToken) ?? '', user, expiresAt };
}

const fingerprintOf = (token: string): string =>
  [...token]
    .reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5)
    .toString(16)
    .padStart(8, '0');

/**
 * La session du legacy la plus durable, si elle est valide et n'a jamais été
 * reprise — et la note comme reprise. `null` sinon, sans jamais lever.
 */
export function claimLegacySession(storage: SessionStorage, now: number): LegacySession | null {
  const best = [authManagerCandidate(storage), zustandCandidate(storage)]
    .map((candidate) => sessionOf(candidate, now))
    .reduce<LegacySession | null>(
      (kept, session) => (session !== null && (kept === null || session.expiresAt > kept.expiresAt) ? session : kept),
      null,
    );
  if (best === null) return null;

  const fingerprint = fingerprintOf(best.token);
  if (read(storage, CLAIMED_KEY) === fingerprint) return null;
  write(storage, CLAIMED_KEY, fingerprint);
  return best;
}

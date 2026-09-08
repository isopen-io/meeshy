import { httpTransport } from './client';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import type { PendingUser, SessionStoreApi, SessionUser } from './session';
import { sessionStore } from './session';

/**
 * LE FLUX DE CONNEXION (#5605, T4) — compose les requêtes EXACTES de
 * `routes/auth/login.ts` (§3.1-3.3 de la spécification), écrit dans le
 * magasin de session, rend l'`ApiResult` à l'appelant SANS l'avaler.
 *
 * `createAuthClient` est une FABRIQUE plutôt que trois fonctions figées : les
 * témoins injectent un transport bouchonné ET un magasin RÉEL (jamais un
 * mock) sans dépendre du singleton de production. `auth`/`login`/
 * `completeTwoFactor`/`logout`, en bas, sont l'UNIQUE instance que
 * `dev-harness.ts` — et demain tout écran d'authentification — consomment.
 */

export type LoginRequest = {
  readonly username: string;
  readonly password: string;
  readonly rememberDevice?: boolean;
};

type LoginSuccessData = {
  readonly user: SessionUser;
  readonly token: string;
  readonly sessionToken: string;
  readonly expiresIn: number;
};

/** La branche exclusive de `login.ts:145-158` : NI `token` NI `sessionToken`
 * — aucun accès n'est accordé avant la vérification du second facteur. */
type LoginTwoFactorData = {
  readonly requires2FA: true;
  readonly twoFactorToken: string;
  readonly user: PendingUser;
  readonly message: string;
};

type LoginResponseData = LoginSuccessData | LoginTwoFactorData;

function isTwoFactorResponse(data: LoginResponseData): data is LoginTwoFactorData {
  return (data as LoginTwoFactorData).requires2FA === true;
}

export type TwoFactorCompleteData = {
  readonly user: SessionUser;
  readonly token: string;
  readonly sessionToken: string;
  readonly expiresIn: number;
  readonly usedBackupCode: boolean;
};

export type AuthTransport = Pick<HttpTransport, 'request'>;

export type AuthDeps = {
  readonly transport: AuthTransport;
  readonly store: SessionStoreApi;
};

export function createAuthClient({ transport, store }: AuthDeps) {
  async function login(request: LoginRequest): Promise<ApiResult<LoginResponseData>> {
    // Corps composé d'un seul tenant — `rememberDevice` est OPTIONNEL au
    // schéma (`AuthSchemas.login`), et l'omettre n'est pas la même chose que
    // l'envoyer à `false` : le serveur applique alors son propre défaut.
    const body = {
      username: request.username,
      password: request.password,
      ...(request.rememberDevice !== undefined ? { rememberDevice: request.rememberDevice } : {}),
    };

    const result = await transport.request<LoginResponseData>({
      method: 'POST',
      path: '/api/v1/auth/login',
      body,
    });
    if (!result.ok) return result;

    if (isTwoFactorResponse(result.data)) {
      store.getState().beginTwoFactor({ user: result.data.user, twoFactorToken: result.data.twoFactorToken });
      return result;
    }
    store.getState().establish({
      user: result.data.user,
      token: result.data.token,
      sessionToken: result.data.sessionToken,
      expiresIn: result.data.expiresIn,
    });
    return result;
  }

  async function completeTwoFactor(code: string): Promise<ApiResult<TwoFactorCompleteData>> {
    const pending = store.getState().session;
    if (pending.status !== 'pending2fa') {
      return { ok: false, status: 0, error: 'Aucune connexion à deux facteurs en attente' };
    }

    // Le corps ne porte QUE ces deux champs (login.ts:232-241) — `rememberDevice`
    // n'y est plus accepté depuis #4471, retenu côté serveur depuis `login()`.
    const result = await transport.request<TwoFactorCompleteData>({
      method: 'POST',
      path: '/api/v1/auth/login/2fa',
      body: { twoFactorToken: pending.twoFactorToken, code },
    });
    if (!result.ok) return result;

    store.getState().establish({
      user: result.data.user,
      token: result.data.token,
      sessionToken: result.data.sessionToken,
      expiresIn: result.data.expiresIn,
    });
    return result;
  }

  async function logout(): Promise<ApiResult<{ message: string }>> {
    // Les jetons sont capturés AVANT le wipe : `SessionSnapshotStore.wipe()`
    // (Swift) est la PREMIÈRE opération d'un logout, et le rester ici oblige
    // à porter l'identité de CET appel en EN-TÊTES EXPLICITES plutôt que de
    // la relire depuis un `credential()` qui, interrogé après le wipe,
    // rendrait `null` — l'appel resterait authentifié malgré le wipe local.
    const current = store.getState().session;
    const headers: Record<string, string> =
      current.status === 'authenticated'
        ? { Authorization: `Bearer ${current.token}`, 'X-Session-Token': current.sessionToken }
        : {};

    store.getState().clearSession();

    // Un transport qui rejette NE réauthentifie PAS (§ doctrine ci-dessus) :
    // le wipe local a déjà eu lieu, et c'est la direction d'erreur qui ne
    // COÛTE rien — un « déconnecté localement, session serveur survivante »
    // se répare tout seul au prochain appel authentifié qui échoue en 401 ;
    // l'inverse serait une session fantôme.
    return transport.request<{ message: string }>({ method: 'POST', path: '/api/v1/auth/logout', headers });
  }

  return { login, completeTwoFactor, logout };
}

/**
 * L'UNIQUE flux de connexion de l'application, branché sur le transport
 * PARTAGÉ (`client.ts`) et le magasin PARTAGÉ (`session.ts`) — jamais une
 * seconde instance de l'un ou de l'autre.
 */
export const auth = createAuthClient({ transport: httpTransport, store: sessionStore });
export const { login, completeTwoFactor, logout } = auth;

// Réexport pour un appelant qui a seulement besoin de composer une requête
// bas niveau (recette manuelle § 7 de la spécification).
export type { HttpRequest };

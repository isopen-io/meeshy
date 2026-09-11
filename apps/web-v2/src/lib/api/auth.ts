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

/**
 * LA CHARGE EXACTE de `POST /auth/register` (`register.ts:133`,
 * `registerRequestSchema`) — sept clés au plus, jamais `username` /
 * `firstName` / `lastName` : la passerelle les DÉRIVE de `displayName`
 * (#5218). Composée par `composeRegisterBody()` (`signup-form.ts`).
 */
export type RegisterBody = {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
  readonly phoneNumber?: string;
  readonly phoneCountryCode?: string;
  readonly systemLanguage?: string;
  readonly regionalLanguage?: string;
};

/** La branche « compte créé » (`register.ts:383-388`) — l'inscription CRÉE une
 * session (#4264), à la même forme qu'un login réussi. */
type RegisterSuccessData = {
  readonly user: SessionUser;
  readonly token: string;
  readonly sessionToken: string;
  readonly expiresIn: number;
};

/** La branche « conflit de numéro » (`register.ts:301-331`) — AUCUN compte
 * créé, ni token ni sessionToken : la reprise appartient à l'écran, jamais à
 * ce client. */
export type PhoneOwnerInfo = {
  readonly maskedDisplayName: string;
  readonly maskedUsername: string;
  readonly maskedEmail: string;
  readonly avatar: string | null;
  readonly phoneNumber: string;
  readonly phoneCountryCode: string;
};

export type PhoneConflictData = {
  readonly phoneOwnershipConflict: true;
  readonly phoneOwnerInfo: PhoneOwnerInfo;
  readonly pendingRegistration: Record<string, unknown>;
};

export type RegisterResponseData = RegisterSuccessData | PhoneConflictData;

/** Le discriminant entre les deux branches de succès de `register()` — exporté
 * pour que l'écran d'inscription (`routes/signup.tsx`) n'ait pas à connaître
 * la forme interne de `RegisterResponseData` pour la distinguer. */
export function isPhoneConflict(data: RegisterResponseData): data is PhoneConflictData {
  return (data as PhoneConflictData).phoneOwnershipConflict === true;
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

/**
 * LA BRANCHE PARTAGÉE d'une réponse « connexion réussie » (`LoginResponseData`)
 * — extraite (#5816, E5) pour que `login()` ET `validateMagicLink()` la
 * suivent SANS la recopier : les deux routes rendent la MÊME union
 * (`routes/magic-link.ts:166-206` a exactement la forme de `login.ts:145-158,
 * 206-212`).
 */
function applyLoginResponse(store: SessionStoreApi, data: LoginResponseData): void {
  if (isTwoFactorResponse(data)) {
    store.getState().beginTwoFactor({ user: data.user, twoFactorToken: data.twoFactorToken });
    return;
  }
  store.getState().establish({
    user: data.user,
    token: data.token,
    sessionToken: data.sessionToken,
    expiresIn: data.expiresIn,
  });
}

/** `POST /auth/magic-link/request` (`routes/magic-link.ts:45-118`) —
 * `expiresInSeconds` optionnel : ABSENT sur un refus de débit dépassé
 * emballé en 200 (§ 3.1 de la spécification, § `view/magic-link.ts`). */
export type MagicLinkRequestData = { readonly expiresInSeconds?: number };

/** `POST /auth/forgot-password` (`password-reset.ts:110-215`) — nominal SANS
 * `data`, erreur interne `{ message }` : aucun champ que ce client consulte. */
export type ForgotPasswordData = { readonly message?: string } | undefined;

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

    applyLoginResponse(store, result.data);
    return result;
  }

  /**
   * `POST /auth/magic-link/request` (T3a) — AUCUNE écriture de magasin : une
   * demande de lien n'authentifie personne, elle envoie un e-mail.
   * `rememberDevice` suit la même règle que `login()` — omis si non fourni,
   * jamais envoyé à `false` par défaut (iOS ne l'envoie pas du tout,
   * `AuthService.swift:89` — § 9 Q7 de la spécification).
   */
  async function requestMagicLink(request: {
    readonly email: string;
    readonly rememberDevice?: boolean;
  }): Promise<ApiResult<MagicLinkRequestData>> {
    const body = {
      email: request.email,
      ...(request.rememberDevice !== undefined ? { rememberDevice: request.rememberDevice } : {}),
    };
    return transport.request<MagicLinkRequestData>({ method: 'POST', path: '/api/v1/auth/magic-link/request', body });
  }

  /**
   * `POST /auth/magic-link/validate` (T3b) — la MÊME union que `login()`
   * (`applyLoginResponse`, partagée) sur un succès. Un lien ouvert alors que
   * le magasin est DÉJÀ `authenticated` (un autre compte, ou une session
   * restaurée) purge D'ABORD (`clearSession()`) — le P0
   * `MeeshyApp.swift:1019-1034` : jamais `establish(B)` par-dessus une
   * session `A` encore vivante.
   */
  async function validateMagicLink(token: string): Promise<ApiResult<LoginResponseData>> {
    if (store.getState().session.status === 'authenticated') store.getState().clearSession();

    const result = await transport.request<LoginResponseData>({
      method: 'POST',
      path: '/api/v1/auth/magic-link/validate',
      body: { token },
    });
    if (!result.ok) return result;

    applyLoginResponse(store, result.data);
    return result;
  }

  /** `POST /auth/forgot-password` (T3c) — AUCUNE écriture de magasin :
   * demander un lien de réinitialisation n'authentifie personne non plus. */
  async function forgotPassword(email: string): Promise<ApiResult<ForgotPasswordData>> {
    return transport.request<ForgotPasswordData>({ method: 'POST', path: '/api/v1/auth/forgot-password', body: { email } });
  }

  /**
   * `POST /auth/register` (T2) — la seule des deux branches de succès qui
   * ÉTABLIT une session est `RegisterSuccessData` (#4264). Le conflit de
   * numéro (#5555, hors périmètre : la modale de transfert) laisse le
   * magasin `anonymous` et rend son résultat TEL QUEL à l'appelant, qui porte
   * seul la décision de reprise (continuer sans le numéro, transférer).
   */
  async function register(body: RegisterBody): Promise<ApiResult<RegisterResponseData>> {
    const result = await transport.request<RegisterResponseData>({
      method: 'POST',
      path: '/api/v1/auth/register',
      body,
    });
    if (!result.ok) return result;

    if (isPhoneConflict(result.data)) return result;

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

  return { login, register, completeTwoFactor, logout, requestMagicLink, validateMagicLink, forgotPassword };
}

/**
 * L'UNIQUE flux de connexion de l'application, branché sur le transport
 * PARTAGÉ (`client.ts`) et le magasin PARTAGÉ (`session.ts`) — jamais une
 * seconde instance de l'un ou de l'autre.
 */
export const auth = createAuthClient({ transport: httpTransport, store: sessionStore });
export const { login, register, completeTwoFactor, logout, requestMagicLink, validateMagicLink, forgotPassword } = auth;

// Réexport pour un appelant qui a seulement besoin de composer une requête
// bas niveau (recette manuelle § 7 de la spécification).
export type { HttpRequest };

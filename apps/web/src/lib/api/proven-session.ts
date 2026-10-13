import * as authEndpoints from '@meeshy/shared/api/endpoints/auth';

import type { ApiResult, HttpRequest } from './http';
import { heldAccountOf, type PendingUser, type SessionState, type SessionStoreApi, type SessionUser } from './session';

/**
 * UN LIEN N'OUVRE JAMAIS UN AUTRE COMPTE SANS LE DEMANDER (#10451, jumelle web
 * de #10445 — `SignInLink.replacesSignedInAccount`, iOS).
 *
 * Un lien de connexion (lien magique, lien de vérification d'e-mail, preuve
 * d'une revendication) se PROUVE d'abord, sans toucher à la session ouverte.
 * La décision vient ensuite, sur l'id que la passerelle rend — jamais sur ce
 * que le lien prétend, qui se forge :
 *
 * - aucun compte ouvert, ou le MÊME compte ⇒ la session prouvée se pose
 *   (rotation pour le même compte) ;
 * - un AUTRE compte sur un appareil connecté ⇒ la session prouvée attend en
 *   mémoire, et l'écran pose la question. Refuser la referme côté passerelle
 *   (la déconnexion, avec SES jetons) ; accepter range le compte quitté au
 *   sélecteur, comme « Changer de compte », puis l'ouvre.
 *
 * Sans cela, un lien demandé par un tiers pour SON compte, touché par la
 * victime, la faisait écrire dans le compte du tiers (fixation de session).
 */

const DEFAULT_SESSION_SECONDS = 24 * 60 * 60;

export type ProvenSession =
  | {
      readonly kind: 'session';
      readonly user: SessionUser;
      /** L'adresse du compte, quand la passerelle la sert — montrée MASQUÉE. */
      readonly email?: string;
      readonly token: string;
      readonly sessionToken: string;
      readonly expiresIn: number;
    }
  | { readonly kind: 'second-factor'; readonly user: PendingUser; readonly twoFactorToken: string };

export type AccountReplacement = {
  /** Le compte OUVERT sur l'appareil, que le lien quitterait. */
  readonly current: SessionUser;
  /** Ce que la preuve a rendu, pour un autre compte. */
  readonly proven: ProvenSession;
};

type ProvenPayload = {
  readonly user?: unknown;
  readonly token?: unknown;
  readonly sessionToken?: unknown;
  readonly expiresIn?: unknown;
  readonly requires2FA?: unknown;
  readonly twoFactorToken?: unknown;
};

function hasIdentity(user: unknown): user is { readonly id: string; readonly username: string } {
  if (user === null || typeof user !== 'object') return false;
  const candidate = user as { readonly id?: unknown; readonly username?: unknown };
  return typeof candidate.id === 'string' && typeof candidate.username === 'string';
}

/** Ce que la preuve a rendu : une session, un défi de second facteur, ou rien
 * (adresse vérifiée sans session, compte qui attend son activation). */
export function provenSessionOf(data: object): ProvenSession | null {
  const payload = data as ProvenPayload;
  if (!hasIdentity(payload.user)) return null;
  if (payload.requires2FA === true && typeof payload.twoFactorToken === 'string') {
    return { kind: 'second-factor', user: payload.user as PendingUser, twoFactorToken: payload.twoFactorToken };
  }
  if (typeof payload.token !== 'string' || typeof payload.sessionToken !== 'string') return null;
  const email = (payload.user as { readonly email?: unknown }).email;
  return {
    kind: 'session',
    user: payload.user as SessionUser,
    ...(typeof email === 'string' && email !== '' ? { email } : {}),
    token: payload.token,
    sessionToken: payload.sessionToken,
    expiresIn: typeof payload.expiresIn === 'number' ? payload.expiresIn : DEFAULT_SESSION_SECONDS,
  };
}

/** L'adresse du compte prouvé, quand elle est connue. */
export function provenEmailOf(proven: ProvenSession): string | null {
  const email = proven.kind === 'session' ? proven.email : proven.user.email;
  return typeof email === 'string' && email !== '' ? email : null;
}

/** La décision UNIQUE (auth et écrans la lisent ici) : `null` ⇒ rien à
 * demander ; sinon le compte ouvert et ce que le lien ouvrirait à sa place. */
export function accountReplacementOf(session: SessionState, proven: ProvenSession | null): AccountReplacement | null {
  if (proven === null) return null;
  const held = heldAccountOf(session);
  if (held === null || held.user.id === proven.user.id) return null;
  return { current: held.user, proven };
}

/** Pose ce que la preuve a rendu, quand aucune question n'est à poser. Un
 * défi de second facteur pour le compte DÉJÀ ouvert ne remplace pas sa
 * session : elle vaut déjà. */
export function admitProvenSession(store: SessionStoreApi, proven: ProvenSession): void {
  const state = store.getState();
  if (proven.kind === 'second-factor') {
    if (heldAccountOf(state.session) !== null) return;
    state.beginTwoFactor({ user: proven.user, twoFactorToken: proven.twoFactorToken });
    return;
  }
  state.establish({ user: proven.user, token: proven.token, sessionToken: proven.sessionToken, expiresIn: proven.expiresIn });
}

type ProvenTransport = { request<T>(request: HttpRequest): Promise<ApiResult<T>> };

/** Ce qui REFERME une session prouvée refusée — sans le coffre des comptes,
 * pour que l'écran puisse la refermer même quand les gestes de l'appareil ne
 * se chargent pas (#10474). */
export type ProvenSessionCloser = {
  /** « Annuler » — la déconnexion avec les jetons prouvés, attendue. */
  discard(replacement: AccountReplacement): Promise<void>;
  /** La page se décharge pendant la question — la même déconnexion, en
   * `keepalive`, sans l'attendre : elle survit à la fermeture de l'onglet. */
  abandon(replacement: AccountReplacement): void;
};

export function createProvenSessionCloser(transport: ProvenTransport): ProvenSessionCloser {
  const close = ({ proven }: AccountReplacement): Promise<void> => {
    if (proven.kind !== 'session') return Promise.resolve();
    return transport
      .request<{ message: string }>({
        method: 'POST',
        path: authEndpoints.logout,
        credential: { kind: 'registered', token: proven.token },
        headers: { 'X-Session-Token': proven.sessionToken },
        keepalive: true,
      })
      .then(
        () => undefined,
        () => undefined,
      );
  };
  /* Toujours en keepalive : un refus en vol survit à la fermeture de l'onglet
     qui l'interromprait (#10474). */
  return {
    discard: (replacement) => close(replacement),
    abandon: (replacement) => {
      void close(replacement);
    },
  };
}

export type ProvenSessionGestures = ProvenSessionCloser & {
  /** « Ouvrir cet autre compte » — le compte quitté reste au sélecteur.
   * `false` : la session ouverte n'a pas pu être démontée, rien n'est posé et
   * la session prouvée est refermée — l'écran n'annonce aucune connexion. */
  adopt(replacement: AccountReplacement): Promise<boolean>;
};

export function createProvenSessionGestures({
  store,
  transport,
  suspend,
  noteActive,
}: {
  readonly store: SessionStoreApi;
  readonly transport: ProvenTransport;
  /** Range le compte ouvert sans l'oublier (`accountSwitcher.suspend`). */
  readonly suspend: () => void;
  /** Le compte ouvert entre dans la liste de l'appareil (`accountVault.noteActive`). */
  readonly noteActive: (user: SessionUser) => void;
}): ProvenSessionGestures {
  const closer = createProvenSessionCloser(transport);

  return {
    adopt: async (replacement) => {
      suspend();
      if (heldAccountOf(store.getState().session) !== null) {
        await closer.discard(replacement);
        return false;
      }
      admitProvenSession(store, replacement.proven);
      if (replacement.proven.kind === 'session') noteActive(replacement.proven.user);
      return true;
    },
    ...closer,
  };
}

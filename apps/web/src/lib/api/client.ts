import { emailGate } from '../activation/email-gate';
import { withEmailGate } from '../activation/email-gated-transport';

import { apiConfig } from './config';
import { createHttpTransport, type ApiFailure, type ApiResult, type Credential, type HttpTransport } from './http';
import { navigate } from '../router';
import { safeLocalStorage, type SafeStorage } from '../storage';

import { notePendingAccountEnd } from './account-caches';
import { retireDeletedAccountLater } from './account-deleted';
import { endGuestAccess, type GuestAccessEnd } from './guest-access-end';
import { VIEWER_ID } from './fixtures-base';
import { ownerCredentialOf, ownerScopeOf, type OwnerCredential } from './owner-session';
import { scopedConversationOf, sessionIdentityKey, sessionStore, type SessionState, type SessionStoreApi } from './session';

/**
 * LE TRANSPORT DE PRODUCTION — l'UNIQUE instance que toute l'application
 * partage (#5605).
 *
 * Il vit dans SON module, et non chez le premier de ses appelants
 * (`auth.ts`) : les quarante et quelques surfaces à porter depuis iOS
 * parleront toutes à la passerelle, et aucune n'a de raison d'importer le
 * flux de CONNEXION pour obtenir un transport. Un singleton hébergé par son
 * premier consommateur devient le module que tout le monde importe — donc le
 * module qui traîne tout le reste dans chaque paquet d'écran.
 *
 * Trois branchements, trois raisons :
 *  - `base` vient de `apiConfig` (UNE source, `config.ts`) ;
 *  - `credential` est DÉRIVÉ du magasin de session, jamais un second état ;
 *  - `onUnauthorized` remet le magasin à `anonymous` — un 401 sur un appel
 *    qui portait un jeton signifie « expiré ou révoqué », et le magasin le
 *    sait avant qu'un écran s'en aperçoive.
 */

/**
 * Le crédential COURANT — LES DEUX RÉGIMES, jamais mélangés.
 *
 * - `authenticated` ⇒ `Authorization: Bearer <JWT>` ;
 * - `guest` ⇒ `X-Session-Token: <jeton d'invité>` (#5561), le régime de
 *   quelqu'un entré par un lien sans compte.
 *
 * Un `pending2fa` ne porte PAS de crédential : son `twoFactorToken` n'ouvre que
 * `POST /auth/login/2fa`, et le présenter en `Authorization` ferait répondre
 * « Invalid JWT token » (`APIClient.swift:480-483`). Un `anonymous` non plus :
 * il n'a aucune créance.
 *
 * **Un invité ne présente JAMAIS de Bearer**, et c'est ce qui rend la jonction
 * lisible : la porte `POST /links/:key/members` est en authentification
 * OPTIONNELLE, donc un Bearer qui traînerait ferait entrer le COMPTE sous son
 * nom là où l'écran croit créer un invité (`link-join.ts § joinLinkAsGuest`).
 */
export function credentialFromSession(session: SessionState): Credential | null {
  if (session.status === 'authenticated') return { kind: 'registered', token: session.token };
  if (session.status === 'guest') return { kind: 'anonymous', sessionToken: session.sessionToken };
  return null;
}

/** Rang 4 du Prisme Linguistique — la locale de l'APPAREIL, jamais une
 * préférence applicative (CLAUDE.md racine, règle 2). `navigator` peut
 * manquer (rendu hors navigateur) : l'en-tête est alors absent, jamais vide. */
export function currentDeviceLocale(): string | null {
  return typeof navigator === 'object' && navigator !== null ? (navigator.language ?? null) : null;
}

/** Le crédential de la session COURANTE, relu à chaque appel — la même
 * valeur que le transport JSON présente, nommée pour les transports qui n'en
 * sont pas (le client TUS, `post-media-upload.ts`). */
export const currentCredential = (): Credential | null => credentialFromSession(sessionStore.getState().session);

/** QUI parle à cet instant — la clé que le transport relit au départ et à l'arrivée de chaque requête (#8674). */
export const currentIdentity = (): string | null => sessionIdentityKey(sessionStore.getState().session);

/**
 * LE JETON DU PROPRIÉTAIRE D'UNE ATTENTE (#9743, `owner-session.ts`) — la
 * session lue en UN instantané, ou, sur fixtures (ni session ni réseau : ce
 * jeton ne voyage jamais), le lecteur de fixture et lui seul. Il vit ici, avec
 * `currentCredential`, pour ne pas découper la session hors de ce module.
 */
export const currentOwnerCredential: OwnerCredential = (scope) => {
  if (__FIXTURES__ && apiConfig.source === 'fixtures') return scope === ownerScopeOf(VIEWER_ID) ? { kind: 'registered', token: 'fixtures' } : null;
  return ownerCredentialOf(scope, sessionStore.getState().session);
};

/** L'adresse du compte TENU est connue non prouvée (#8365) — lu par la garde
 * de l'e-mail pour ouvrir la validation AVANT d'envoyer une publication. */
export function sessionEmailUnproven(session: SessionState): boolean {
  return session.status === 'authenticated' && session.user.emailUnproven === true;
}

type AccountEnd = Pick<typeof import('./account-end'), 'endRevokedSession'>;

/**
 * LE REPLI QUAND LE MORCEAU DE FIN NE SE CHARGE PAS (audit #19352) — réseau
 * instable, version changée en route : la session refusée finit quand même,
 * tout de suite, sans toucher l'entrée d'un autre compte que l'appareil tient
 * (`clearSession`), et son compte est noté pour que ce qu'il laisse sur
 * l'appareil parte au prochain chargement (`forgetPendingAccountEnds`).
 */
function endWithoutModule(store: SessionStoreApi, storage: SafeStorage): void {
  const state = store.getState();
  const current = state.session;
  const leaving = current.status === 'authenticated' && state.holdsDeviceSession() ? current.user.id : null;
  state.clearSession();
  if (leaving !== null) notePendingAccountEnd(storage, leaving);
}

/**
 * La fin d'une session refusée se charge quand elle sert (`account-end.ts`) : la première peinture n'en porte que le repli.
 *
 * ELLE VISE LA SESSION REFUSÉE, JAMAIS CELLE QUE L'ONGLET TIENT QUAND LE MORCEAU ARRIVE (audit #19352) :
 * - une session d'INVITÉ finit SUR-LE-CHAMP, rien à charger : la navigation qui suit la fin d'un accès d'invité se rend
 *   avant le morceau. L'identité anonyme d'un compte (#8816) y rendrait la session au COMPTE, que la fin chargée
 *   déconnecterait alors ; l'invité d'un lien SANS compte y serait encore tenu, et la page de son lien le renverrait
 *   vers son fil au lieu de dire pourquoi. Pour lui, le morceau ne fait plus que suivre l'appareil ;
 * - une autre session finit à l'arrivée du morceau (ou de son échec) seulement si l'onglet la tient encore, la même :
 *   s'il a suivi l'appareil passé à un autre compte, repris une session neuve ou réécrit la sienne, rien ne finit ici,
 *   et la requête suivante sous un jeton refusé rapporte son propre 401.
 */
export function endRefusedSession(
  store: SessionStoreApi,
  { load = () => import('./account-end'), storage }: { readonly load?: () => Promise<AccountEnd>; readonly storage?: SafeStorage } = {},
): void {
  const refused = store.getState().session;
  const scoped = scopedConversationOf(refused);
  if (scoped !== null) return store.getState().dropAnonymous(scoped);
  if (refused.status === 'guest') store.getState().clearSession();
  const ended = store.getState().session;
  const stillEnded = (): boolean => store.getState().session === ended;
  void load()
    .then(({ endRevokedSession }) => {
      if (stillEnded()) endRevokedSession(store);
    })
    .catch(() => {
      if (stillEnded()) endWithoutModule(store, storage ?? safeLocalStorage());
    });
}

const endSessionOf = (store: SessionStoreApi): void => endRefusedSession(store);

/** Ce que l'onglet fait quand la passerelle dit que l'accès de son invité est fini — exporté pour que le témoin passe par le câblage de l'application. */
export const onTabGuestAccessEnded = (reason: GuestAccessEnd): void => endGuestAccess({ reason, store: sessionStore, end: endSessionOf, navigate });

/** Enveloppé par la garde de l'e-mail (#8365) : un refus `EMAIL_NOT_VERIFIED`
 * ouvre la validation et la requête repart au code validé
 * (`lib/activation/email-gated-transport.ts`). */
export const httpTransport: HttpTransport = withEmailGate(
  createHttpTransport({
    base: apiConfig.base,
    credential: currentCredential,
    identity: currentIdentity,
    deviceLocale: currentDeviceLocale,
    onUnauthorized: () => endSessionOf(sessionStore),
    onAccountDeleted: retireDeletedAccountLater,
    onGuestAccessEnded: onTabGuestAccessEnded,
  }),
  { ask: emailGate.ask, emailUnproven: () => sessionEmailUnproven(sessionStore.getState().session) },
);

/**
 * L'ADAPTATEUR UNIQUE ENTRE `ApiResult` ET TANSTACK QUERY (#5605,
 * revue-correction) — posé ICI et NULLE PART ailleurs.
 *
 * `ApiResult` ne REJETTE JAMAIS (doctrine `http.ts`) : un échec y est une
 * VALEUR (`{ ok: false, … }`), jamais une exception. C'est juste pour un
 * appelant qui déballe lui-même — et FAUX pour `TanStack Query`, qui décide
 * `isError`/`retry`/l'état d'erreur d'un `useQuery` en observant si la
 * PROMESSE de son `queryFn` REJETTE, jamais son contenu résolu : un
 * `queryFn` qui rendrait l'`ApiResult` tel quel serait toujours en état
 * `success`, même quand `ok === false`.
 *
 * `unwrap` est le SEUL pont : tout `queryFn`/`mutationFn` futur l'appelle en
 * dernière ligne — `unwrap(await httpTransport.request(...))` — et jamais
 * un déballage écrit à la main. Trente écrans copieront ce motif ; il doit
 * être juste une fois, ici, et nulle part ailleurs (directive porteur
 * 2026-09-07 soir, § 7).
 *
 * SIMPLIFICATION DÉLIBÉRÉE — `code: 'ABORTED'` n'est PAS traité à part.
 * `@tanstack/query-core` (`retryer.ts`, `Retryer.cancel()`) rejette SA
 * PROPRE promesse de suivi avec `CancelledError` DÈS l'appel à
 * `query.cancel()` / au retrait de l'observateur — sans attendre que le
 * `queryFn` sous-jacent se résolve, et SANS inspecter l'erreur qu'il aurait
 * fini par lever. Le rejet d'`unwrap` sur une requête que TanStack Query a
 * lui-même annulée (via le `signal` qu'il fournit au `queryFn`) est donc
 * déjà sans effet sur l'état observé — la distinguer ici aurait ajouté une
 * branche non éprouvée par aucun appelant réel de ce tour.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(failure: ApiFailure) {
    super(failure.error);
    this.name = 'ApiError';
    this.status = failure.status;
    this.code = failure.code;
  }
}

export function unwrap<T>(result: ApiResult<T>): T {
  if (result.ok) return result.data;
  throw new ApiError(result);
}

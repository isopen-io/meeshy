import { apiConfig } from './config';
import { createHttpTransport, type ApiFailure, type ApiResult, type Credential, type HttpTransport } from './http';
import { sessionStore, type SessionState } from './session';

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
 * Le crédential COURANT. Un `pending2fa` ne porte PAS de crédential : son
 * `twoFactorToken` n'ouvre que `POST /auth/login/2fa`, et le présenter en
 * `Authorization` ferait répondre « Invalid JWT token »
 * (`APIClient.swift:480-483`). Un `anonymous` non plus — le régime
 * `X-Session-Token` est celui d'un invité de LIEN, qui n'existe pas encore.
 */
export function credentialFromSession(session: SessionState): Credential | null {
  return session.status === 'authenticated' ? { kind: 'registered', token: session.token } : null;
}

/** Rang 4 du Prisme Linguistique — la locale de l'APPAREIL, jamais une
 * préférence applicative (CLAUDE.md racine, règle 2). `navigator` peut
 * manquer (rendu hors navigateur) : l'en-tête est alors absent, jamais vide. */
export function currentDeviceLocale(): string | null {
  return typeof navigator === 'object' && navigator !== null ? (navigator.language ?? null) : null;
}

export const httpTransport: HttpTransport = createHttpTransport({
  base: apiConfig.base,
  credential: () => credentialFromSession(sessionStore.getState().session),
  deviceLocale: currentDeviceLocale,
  onUnauthorized: () => sessionStore.getState().clearSession(),
});

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

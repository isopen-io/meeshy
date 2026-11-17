import type { QueryClient } from '@tanstack/react-query';

import type { AccountVault } from './accounts';
import { MY_PROFILE_QUERY_KEY } from './me-keys';
import type { MyProfile } from './profile';
import type { SessionProfileFields, SessionStoreApi, SessionUser } from './session';

/**
 * **LA SESSION SUIT LE PROFIL SERVI** (#18914, WEB-01).
 *
 * Le Prisme de tout le produit (`useReaderLanguages`) lit la SESSION, et la
 * session ne relisait jamais le serveur : seuls la connexion et un geste de
 * profil fait sur CE navigateur l'écrivaient. Une langue, un nom ou une photo
 * changés sur un autre appareil restaient donc absents du web — rechargement
 * compris, puisque `restoreSession` relit le `localStorage` — jusqu'à la
 * prochaine connexion. Et aucun événement ne les apporte : la passerelle
 * n'émet `user:updated` que vers les partenaires, jamais vers soi.
 *
 * `GET /me` devient la source : chaque réponse RÉSEAU de `['me', 'profile']`
 * se projette sur la session et sur la ligne du compte dans la liste de
 * l'appareil — la moitié « serveur » de `confirm()` (`profile-actions.ts`),
 * avec ses champs (`sessionFieldsOfProfile`, écrite une fois pour les deux).
 * Le socket relit cette requête à chaque (re)connexion
 * (`CATCH_UP_PERSONAL_FAMILIES`, `socket.ts`).
 *
 * Ne se projette JAMAIS :
 *  - un cache réhydraté ni une écriture locale (`manual`) : le geste qui
 *    écrit le cache tient déjà la session lui-même, et un cache restauré dit
 *    ce que le serveur servait hier ;
 *  - le profil d'un AUTRE compte (une réponse partie avant un changement de
 *    compte) ;
 *  - une réponse arrivée pendant une édition EN VOL (`holdProfileEdit`) : lue
 *    avant l'écriture du `PATCH`, elle défaisait l'optimiste. Une relecture
 *    encore en vol quand le geste confirme est ANNULÉE juste avant
 *    (`profile-actions.ts`) : partie pendant le `PATCH`, elle arrivait après
 *    lui et passait cette garde ;
 *  - un profil plus ANCIEN que le plus récent que la session a pris (sa date
 *    `updatedAt`, servie par `GET /me` et par les `PATCH`) : la copie du
 *    service worker, ou celle du cache d'authentification de la passerelle
 *    (60 s), ne fait jamais reculer la session ni la ligne du compte. Sans
 *    date (ancienne passerelle), la garde se tait ;
 *  - un profil identique à la session : rien n'est réécrit, aucun abonné
 *    n'est réveillé.
 */
export function sessionFieldsOfProfile(profile: MyProfile): SessionProfileFields {
  return {
    displayName: profile.displayName,
    avatar: profile.avatar,
    systemLanguage: profile.systemLanguage,
    regionalLanguage: profile.regionalLanguage,
    customDestinationLanguage: profile.customDestinationLanguage,
  };
}

const isMyProfileKey = (queryKey: readonly unknown[]): boolean =>
  queryKey.length === MY_PROFILE_QUERY_KEY.length && MY_PROFILE_QUERY_KEY.every((part, index) => queryKey[index] === part);

const SESSION_PROFILE_KEYS = [
  'displayName',
  'avatar',
  'systemLanguage',
  'regionalLanguage',
  'customDestinationLanguage',
] as const satisfies readonly (keyof SessionProfileFields)[];

const alreadyHeld = (user: SessionUser, fields: SessionProfileFields): boolean =>
  SESSION_PROFILE_KEYS.every((key) => (user[key] ?? null) === (fields[key] ?? null));

const editsInFlight = new WeakMap<QueryClient, number>();
/** Le profil le plus récent que la session a pris, PAR COMPTE : le client de
 * requêtes survit à un changement de compte, la date d'un autre compte ne dit
 * rien de celui-ci. */
const newestTaken = new WeakMap<QueryClient, { readonly userId: string; readonly at: number }>();

const servedAt = (profile: MyProfile): number | undefined => {
  const at = profile.updatedAt === undefined ? Number.NaN : Date.parse(profile.updatedAt);
  return Number.isNaN(at) ? undefined : at;
};

const olderThanTaken = (queryClient: QueryClient, profile: MyProfile): boolean => {
  const at = servedAt(profile);
  const taken = newestTaken.get(queryClient);
  return at !== undefined && taken !== undefined && taken.userId === profile.id && at < taken.at;
};

/** La session vient de prendre ce profil (la confirmation d'un geste, ou une
 * relecture projetée) : aucun profil servi plus ancien ne la fera reculer. */
export function noteProfileTaken(queryClient: QueryClient, profile: MyProfile): void {
  const at = servedAt(profile);
  const taken = newestTaken.get(queryClient);
  if (at === undefined || (taken !== undefined && taken.userId === profile.id && at <= taken.at)) return;
  newestTaken.set(queryClient, { userId: profile.id, at });
}

/** Une édition de profil commence : rend sa fin. Tant qu'il en reste une en
 * vol, aucune réponse de `GET /me` ne touche la session. */
export function holdProfileEdit(queryClient: QueryClient): () => void {
  editsInFlight.set(queryClient, (editsInFlight.get(queryClient) ?? 0) + 1);
  return () => editsInFlight.set(queryClient, Math.max(0, (editsInFlight.get(queryClient) ?? 0) - 1));
}

export function followServedProfile(params: {
  readonly queryClient: QueryClient;
  readonly session: SessionStoreApi;
  readonly accounts: Pick<AccountVault, 'refreshUser'>;
}): () => void {
  const { queryClient, session, accounts } = params;
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success' || event.action.manual === true) return;
    if (!isMyProfileKey(event.query.queryKey) || (editsInFlight.get(queryClient) ?? 0) > 0) return;
    const profile = queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY);
    const current = session.getState().session;
    if (profile === undefined || current.status !== 'authenticated' || current.user.id !== profile.id) return;
    if (olderThanTaken(queryClient, profile)) return;
    noteProfileTaken(queryClient, profile);
    const fields = sessionFieldsOfProfile(profile);
    if (alreadyHeld(current.user, fields)) return;
    session.getState().updateUser(fields);
    const next = session.getState().session;
    if (next.status === 'authenticated') accounts.refreshUser(next.user);
  });
}

import type { QueryClient } from '@tanstack/react-query';

import { ownProfileSnapshotIsStale, type OwnProfileSnapshot, type ProfileUpdatedEventData } from '@meeshy/shared/types/own-profile-sync-order';

import type { AccountVault } from './accounts';
import { CONVERSATIONS_QUERY_KEY } from './conversations';
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
 *    lui et passait cette garde. Elle est RETENUE, pas jetée (#19133) : si le
 *    geste confirme, sa réponse la remplace ; s'il échoue (téléversement
 *    refusé, `PATCH` refusé, geste annulé), la dernière réponse retenue est
 *    projetée à la fin de l'échec — sur la session, la ligne du compte et le
 *    cache que le retour arrière venait de remettre à l'instantané. Sans
 *    cela, une langue changée ailleurs attendait la relecture suivante
 *    (reconnexion, ou trente minutes) ;
 *  - un profil plus ANCIEN que le plus récent que la session a pris (sa date
 *    `updatedAt`, servie par `GET /me` et par les `PATCH`) : la copie du
 *    service worker, ou celle du cache d'authentification de la passerelle
 *    (60 s), ne fait jamais reculer la session ni la ligne du compte. Sans
 *    date (ancienne passerelle), la garde se tait ;
 *  - un profil identique à la session : rien n'est réécrit, aucun abonné
 *    n'est réveillé.
 *
 * **`profile:updated` (#18924) passe par la MÊME projection.** La passerelle
 * pousse sur `user:<moi>`, appareil émetteur compris, l'INSTANTANÉ des neuf
 * champs que mes appareils affichent et la date de l'écriture
 * (`@meeshy/shared/types/own-profile-sync-order`, le contrat sans `zod`) : la session le prend sans relire
 * `GET /me`, et le cache `['me', 'profile']` aussi, composé sur ce qu'il tient
 * AU MOMENT où il le prend — jamais un profil partiel inventé quand il est
 * vide. Mêmes gardes : même compte, retenu pendant une édition en vol, jamais
 * plus ancien que ce qui est tenu (`ownProfileSnapshotIsStale`, contre le
 * profil en cache ET le dernier pris par la session). Une édition qui confirme
 * une date ANTÉRIEURE à celle d'une donnée retenue ne la jette plus : à sa fin,
 * la donnée retenue, plus récente, se projette. Un Prisme qui change relit la
 * liste des conversations, dont les aperçus sont servis dans les langues du
 * lecteur — comme un geste de langue fait ici (`profile-actions.ts`).
 */
export function sessionFieldsOfProfile(profile: MyProfile): SessionProfileFields {
  return {
    username: profile.username,
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
  'username',
  'displayName',
  'avatar',
  'systemLanguage',
  'regionalLanguage',
  'customDestinationLanguage',
] as const satisfies readonly (keyof SessionProfileFields)[];

/** Les trois langues que la descente du Prisme lit (`resolveReaderLanguages`). */
const PRISM_KEYS = ['systemLanguage', 'regionalLanguage', 'customDestinationLanguage'] as const satisfies readonly (keyof SessionProfileFields)[];

const alreadyHeld = (user: SessionUser, fields: SessionProfileFields): boolean =>
  SESSION_PROFILE_KEYS.every((key) => fields[key] === undefined || (user[key] ?? null) === (fields[key] ?? null));

const prismMoves = (user: SessionUser, fields: SessionProfileFields): boolean =>
  PRISM_KEYS.some((key) => fields[key] !== undefined && (user[key] ?? null) !== (fields[key] ?? null));

/**
 * Ce qu'une donnée SERVIE apporte — une réponse de `GET /me` ou un instantané
 * `profile:updated` : le compte, la date de l'écriture, les champs de la
 * session, et le profil à poser dans `['me', 'profile']`, composé sur ce que
 * le cache tient au moment de la projection (rien quand il ne tient pas ce
 * compte : un instantané ne fait pas un profil complet).
 */
type Served = {
  readonly userId: string;
  readonly updatedAt: string | undefined;
  readonly fields: SessionProfileFields;
  readonly profileOver: (held: MyProfile | undefined) => MyProfile | undefined;
};

const servedOfProfile = (profile: MyProfile): Served => ({
  userId: profile.id,
  updatedAt: profile.updatedAt,
  fields: sessionFieldsOfProfile(profile),
  profileOver: () => profile,
});

const sessionFieldsOfSnapshot = (snapshot: OwnProfileSnapshot): SessionProfileFields => ({
  username: snapshot.username,
  displayName: snapshot.displayName,
  avatar: snapshot.avatar,
  systemLanguage: snapshot.systemLanguage,
  regionalLanguage: snapshot.regionalLanguage,
  customDestinationLanguage: snapshot.customDestinationLanguage,
});

const servedOfSnapshot = (event: ProfileUpdatedEventData): Served => ({
  userId: event.userId,
  updatedAt: event.updatedAt,
  fields: sessionFieldsOfSnapshot(event.profile),
  profileOver: (held) => (held?.id === event.userId ? { ...held, ...event.profile, updatedAt: event.updatedAt } : undefined),
});

const editsInFlight = new WeakMap<QueryClient, number>();
/** La donnée servie la plus récente arrivée pendant une édition tenue. */
const withheld = new WeakMap<QueryClient, Served>();
/** La projection de `followServedProfile` pour ce client, que la fin d'une
 * édition rejoue sur la donnée retenue, et que `profile:updated` emprunte. */
const projections = new WeakMap<QueryClient, (served: Served) => void>();
/** Le profil le plus récent que la session a pris, PAR COMPTE : le client de
 * requêtes survit à un changement de compte, la date d'un autre compte ne dit
 * rien de celui-ci. */
const newestTaken = new WeakMap<QueryClient, { readonly userId: string; readonly updatedAt: string }>();

const timeOf = (updatedAt: string | undefined): number | undefined => {
  const at = updatedAt === undefined ? Number.NaN : Date.parse(updatedAt);
  return Number.isNaN(at) ? undefined : at;
};

/** `a` est-elle STRICTEMENT plus récente que `b` ? Sans date lisible, on ne le prouve pas. */
const strictlyNewer = (a: string | undefined, b: string | undefined): boolean => {
  const left = timeOf(a);
  const right = timeOf(b);
  return left !== undefined && right !== undefined && left > right;
};

const olderThanTaken = (queryClient: QueryClient, served: Served): boolean => {
  const taken = newestTaken.get(queryClient);
  return served.updatedAt !== undefined && taken?.userId === served.userId && ownProfileSnapshotIsStale(taken.updatedAt, served.updatedAt);
};

function noteTaken(queryClient: QueryClient, userId: string, updatedAt: string | undefined): void {
  if (updatedAt === undefined || timeOf(updatedAt) === undefined) return;
  const taken = newestTaken.get(queryClient);
  if (taken?.userId === userId && !strictlyNewer(updatedAt, taken.updatedAt)) return;
  newestTaken.set(queryClient, { userId, updatedAt });
}

/** La session vient de prendre ce profil (la confirmation d'un geste, ou une
 * relecture projetée) : aucun profil servi plus ancien ne la fera reculer —
 * ni une copie datée d'avant lui, ni une donnée retenue pendant l'édition
 * qu'il confirme. Une donnée retenue PLUS RÉCENTE que lui reste retenue : la
 * fin de l'édition la projette. */
export function noteProfileTaken(queryClient: QueryClient, profile: MyProfile): void {
  const kept = withheld.get(queryClient);
  if (kept === undefined || kept.userId !== profile.id || !strictlyNewer(kept.updatedAt, profile.updatedAt)) withheld.delete(queryClient);
  noteTaken(queryClient, profile.id, profile.updatedAt);
}

/** Pendant une édition, la donnée retenue est la plus récente arrivée — la dernière arrivée, sauf si celle déjà retenue est datée après elle. */
function withhold(queryClient: QueryClient, served: Served): void {
  const kept = withheld.get(queryClient);
  if (kept !== undefined && kept.userId === served.userId && strictlyNewer(kept.updatedAt, served.updatedAt)) return;
  withheld.set(queryClient, served);
}

/** La dernière édition tenue vient de finir : la donnée retenue pendant elle,
 * si la confirmation ne l'a pas rendue caduque, est la plus récente. */
function releaseWithheld(queryClient: QueryClient): void {
  const served = withheld.get(queryClient);
  withheld.delete(queryClient);
  const project = projections.get(queryClient);
  if (served !== undefined && project !== undefined) project(served);
}

/** Une édition de profil commence : rend sa fin. Tant qu'il en reste une en
 * vol, aucune donnée servie ne touche la session ; la plus récente est retenue
 * jusqu'à la fin de la dernière édition. */
export function holdProfileEdit(queryClient: QueryClient): () => void {
  editsInFlight.set(queryClient, (editsInFlight.get(queryClient) ?? 0) + 1);
  return () => {
    const left = Math.max(0, (editsInFlight.get(queryClient) ?? 0) - 1);
    editsInFlight.set(queryClient, left);
    if (left === 0) releaseWithheld(queryClient);
  };
}

const takeOrWithhold = (queryClient: QueryClient, served: Served): void => {
  if ((editsInFlight.get(queryClient) ?? 0) > 0) {
    withhold(queryClient, served);
    return;
  }
  projections.get(queryClient)?.(served);
};

/**
 * `profile:updated` (#18924) — l'instantané de mon profil écrit sur un autre
 * appareil (ou l'écho de celui-ci) : pris par la projection de `GET /me`,
 * avec ses gardes, sans relecture réseau. Sans projection montée pour ce
 * client, rien ne se passe.
 */
export function takeProfileSnapshot(queryClient: QueryClient, event: ProfileUpdatedEventData): void {
  const held = queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY);
  if (held?.id === event.userId && ownProfileSnapshotIsStale(held.updatedAt, event.updatedAt)) return;
  takeOrWithhold(queryClient, servedOfSnapshot(event));
}

export function followServedProfile(params: {
  readonly queryClient: QueryClient;
  readonly session: SessionStoreApi;
  readonly accounts: Pick<AccountVault, 'refreshUser'>;
}): () => void {
  const { queryClient, session, accounts } = params;
  const project = (served: Served): void => {
    const current = session.getState().session;
    if (current.status !== 'authenticated' || current.user.id !== served.userId) return;
    if (olderThanTaken(queryClient, served)) return;
    noteTaken(queryClient, served.userId, served.updatedAt);
    const held = queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY);
    const profile = served.profileOver(held);
    if (profile !== undefined && held !== profile) queryClient.setQueryData(MY_PROFILE_QUERY_KEY, profile);
    if (alreadyHeld(current.user, served.fields)) return;
    const relist = prismMoves(current.user, served.fields);
    session.getState().updateUser(served.fields);
    const next = session.getState().session;
    if (next.status === 'authenticated') accounts.refreshUser(next.user);
    if (relist) void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
  };
  projections.set(queryClient, project);
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success' || event.action.manual === true) return;
    if (!isMyProfileKey(event.query.queryKey)) return;
    const profile = queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY);
    if (profile === undefined) return;
    takeOrWithhold(queryClient, servedOfProfile(profile));
  });
  return () => {
    unsubscribe();
    if (projections.get(queryClient) === project) projections.delete(queryClient);
  };
}

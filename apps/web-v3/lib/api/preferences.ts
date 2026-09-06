import type { CleDePreference } from '@/lib/contenu/prefs-de-notif';

import { baseDeLaPasserelle } from './links';
import { DELAI_DE_REPONSE_MS } from './passerelle';

/**
 * LES TROIS GESTES D'UNE LIGNE DE LISTE, sur les routes que la passerelle SERT
 * — lues dans son code, jamais devinées (§ 5.1) :
 *
 *   • sourdine et archivage ⇒ `PUT /api/v1/user-preferences/conversations/:id`
 *     (`services/gateway/src/routes/conversation-preferences.ts:407`,
 *     `preValidation: [fastify.authenticate]`, corps partiel :
 *     « only provided fields will be modified » — `:452-455` filtre les
 *     `undefined`). C'est un UPSERT : une conversation dont le lecteur n'a
 *     jamais réglé de préférence en reçoit une, sans 404 préalable.
 *   • suppression ⇒ `DELETE /api/v1/conversations/:id/delete-for-me`
 *     (`routes/conversations/delete-for-me.ts:253`, `preValidation:
 *     [requiredAuth]`). « Permanently hide a conversation for the calling user.
 *     Does not notify other participants. » — une porte à SENS UNIQUE, ce qui
 *     décide de la fenêtre de réversibilité CLIENT (`lib/contenu/liste.ts`).
 *
 * LES DEUX SONT RÉSERVÉES À UN PORTEUR. `fastify.authenticate` et `requiredAuth`
 * exigent un compte : une session invitée n'y a pas droit — et n'en a pas
 * besoin, la liste étant un écran du MEMBRE (`/chats`). Aucun contournement
 * n'est tenté : la capacité n'existe pas pour l'invité, elle n'est pas offerte.
 *
 * Ce module ne peint rien et ne décide rien : il dit ce que la passerelle a
 * répondu. Le geste optimiste, sa fenêtre et son retour en arrière vivent chez
 * l'appelant — la porte sans JavaScript (`app/connecte/liste-porte.ts`) et le
 * module de participation (`lib/realtime/liste.ts`), qui partagent CE site.
 */

export type IssueDuGeste =
  | { readonly genre: 'fait' }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'refus'; readonly statut: number }
  | { readonly genre: 'panne' };

const DELAI_MS = DELAI_DE_REPONSE_MS;

const enTetes = (jeton: string): Record<string, string> => ({
  accept: 'application/json',
  authorization: `Bearer ${jeton}`,
});

const issue = (reponse: Response | null): IssueDuGeste => {
  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };
  if (reponse.ok) return { genre: 'fait' };
  // Un 5xx n'est pas un refus : c'est la passerelle qui n'a pas tenu son
  // contrat, et le geste reste à retenter. Les distinguer est ce qui décide si
  // la ligne revient (panne) ou si le lecteur lit un refus (4xx).
  return reponse.status >= 500 ? { genre: 'panne' } : { genre: 'refus', statut: reponse.status };
};

const appelle = async (
  url: string,
  options: RequestInit,
  recuperer?: (url: string, options: RequestInit) => Promise<Response>,
): Promise<IssueDuGeste> =>
  issue(
    await (recuperer ?? ((u, o) => fetch(u, o)))(url, {
      ...options,
      cache: 'no-store',
      signal: AbortSignal.timeout(DELAI_MS),
    }).catch(() => null),
  );

export type ArgumentsDuGeste = {
  readonly jeton: string;
  readonly conversation: string;
  readonly base?: string;
  readonly recuperer?: (url: string, options: RequestInit) => Promise<Response>;
};

/**
 * La MISE À JOUR PARTIELLE : seuls les champs passés bougent. Envoyer
 * `isArchived` en même temps qu'une bascule de sourdine écraserait l'archivage
 * du lecteur avec la valeur que le document tenait — c'est-à-dire une valeur
 * potentiellement périmée d'un autre appareil.
 */
export const reglePreference = async ({
  jeton,
  conversation,
  base,
  recuperer,
  ...champs
}: ArgumentsDuGeste & {
  readonly isMuted?: boolean;
  readonly isArchived?: boolean;
}): Promise<IssueDuGeste> =>
  appelle(
    `${base ?? baseDeLaPasserelle()}/api/v1/user-preferences/conversations/${encodeURIComponent(conversation)}`,
    {
      method: 'PUT',
      headers: { ...enTetes(jeton), 'content-type': 'application/json' },
      body: JSON.stringify(champs),
    },
    recuperer,
  );

export const supprimePourMoi = async ({ jeton, conversation, base, recuperer }: ArgumentsDuGeste): Promise<IssueDuGeste> =>
  appelle(
    `${base ?? baseDeLaPasserelle()}/api/v1/conversations/${encodeURIComponent(conversation)}/delete-for-me`,
    { method: 'DELETE', headers: enTetes(jeton) },
    recuperer,
  );

/**
 * LES SEPT CATÉGORIES DE `/me/preferences` (#4181, #4589) — `privacy`,
 * `audio`, `message`, `notification`, `video`, `document`, `application` —
 * chacune une colonne JSON de `UserPreferences`
 * (`services/gateway/src/routes/me/preferences/preference-registry.ts:131`).
 * `CategorieDePreference` est une restriction locale : cette liste n'a de sens
 * QUE pour les quatre écrans que la v3 sert (`detail-privacy`, `detail-media`
 * › document, `detail-notification`) — la déclarer plus large offrirait des
 * catégories qu'aucun écran ne consomme encore.
 */
export type CategorieDePreference = 'privacy' | 'document' | 'notification';

/** Un document par catégorie demandée — pas encore un réglage : voir `DocumentDeNotification` ci-dessous. */
export type DocumentDePreference = Readonly<Record<string, unknown>>;
export type DocumentsDePreferences = Readonly<Record<string, DocumentDePreference>>;

export type IssueDesPreferences =
  | { readonly genre: 'documents'; readonly documents: DocumentsDePreferences }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'refus'; readonly statut: number }
  | { readonly genre: 'panne' };

const enveloppeDeCategories = (valeur: unknown): DocumentsDePreferences | null => {
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) return null;
  const data = (valeur as { readonly data?: unknown }).data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  return data as DocumentsDePreferences;
};

const issueDesPreferences = async (reponse: Response | null): Promise<IssueDesPreferences> => {
  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };
  if (!reponse.ok) return reponse.status >= 500 ? { genre: 'panne' } : { genre: 'refus', statut: reponse.status };

  const documents = enveloppeDeCategories(await reponse.json().catch(() => null));
  return documents === null ? { genre: 'panne' } : { genre: 'documents', documents };
};

const appelleDesPreferences = async (
  url: string,
  options: RequestInit,
  recuperer?: (url: string, options: RequestInit) => Promise<Response>,
): Promise<IssueDesPreferences> =>
  issueDesPreferences(
    await (recuperer ?? ((u, o) => fetch(u, o)))(url, {
      ...options,
      cache: 'no-store',
      signal: AbortSignal.timeout(DELAI_MS),
    }).catch(() => null),
  );

/**
 * `GET /api/v1/me/preferences?categories=a,b` (`unified-routes.ts:150`) — UN
 * appel pour plusieurs catégories, jamais une par catégorie : c'est ce qui
 * évite à `/settings/privacy` de payer deux allers-retours le jour où un
 * écran voudra `privacy` ET `document` sur la même page.
 */
export const lisLesPreferences = async ({
  jeton,
  categories,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly categories: readonly CategorieDePreference[];
  readonly base?: string;
  readonly recuperer?: (url: string, options: RequestInit) => Promise<Response>;
}): Promise<IssueDesPreferences> =>
  appelleDesPreferences(
    `${base ?? baseDeLaPasserelle()}/api/v1/me/preferences?categories=${categories.map(encodeURIComponent).join(',')}`,
    { method: 'GET', headers: enTetes(jeton) },
    recuperer,
  );

/**
 * `PATCH /api/v1/me/preferences` (`:229`, `mode=merge` par défaut — jamais
 * `replace`) — UNE CATÉGORIE, UN CORPS : `{ [categorie]: champs }`. La réponse
 * est une RELECTURE (le mode `merge` rend le document complet), donc du même
 * type que `lisLesPreferences` : l'appelant réconcilie sur ce que la
 * passerelle a ÉCRIT, jamais sur ce qu'il a envoyé.
 */
export const ecrisUnePreference = async ({
  jeton,
  categorie,
  champs,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly categorie: CategorieDePreference;
  readonly champs: Readonly<Record<string, unknown>>;
  readonly base?: string;
  readonly recuperer?: (url: string, options: RequestInit) => Promise<Response>;
}): Promise<IssueDesPreferences> =>
  appelleDesPreferences(
    `${base ?? baseDeLaPasserelle()}/api/v1/me/preferences`,
    {
      method: 'PATCH',
      headers: { ...enTetes(jeton), 'content-type': 'application/json' },
      body: JSON.stringify({ [categorie]: champs }),
    },
    recuperer,
  );

/**
 * LES PRÉFÉRENCES DE NOTIFICATION DU COMPTE (`/notifications/preferences`,
 * #4899) — deux routes RÉELLES, lues dans
 * `services/gateway/src/routes/me/preferences/unified-routes.ts` :
 *
 *   • `GET /api/v1/me/preferences?categories=notification` (`:150`), gardée
 *     par `createUnifiedAuthMiddleware({ requireAuth: true, allowAnonymous:
 *     false })` (`preferences/index.ts:67`) — rend
 *     `{ success, data: { notification: {…complétée par les défauts…} } }` ;
 *   • `PATCH /api/v1/me/preferences` (`:229`, `mode=merge` par DÉFAUT — jamais
 *     `replace` ici) — corps `{ "notification": { [clé]: valeur } }`.
 *
 * UNE ÉCRITURE = UNE CLÉ. Le legacy (`apps/web/app/notifications/
 * preferences/page.tsx`) envoyait l'état ENTIER et gravait dans ses
 * commentaires la leçon inverse : un envoi construit sur un chargement raté
 * réécrit des réglages que le lecteur n'a jamais touchés. Ici la protection
 * est STRUCTURELLE — `basculeUnePreference` ne PEUT composer qu'une seule
 * clé, ce n'est pas un garde-fou qu'on pourrait oublier d'appeler.
 *
 * LA RÉPONSE DU `PATCH` EST UNE RELECTURE : le mode `merge` rend le document
 * complet, comme le `GET` — l'appelant (la porte, le module de participation)
 * réconcilie SUR CE QUE LA PASSERELLE A ÉCRIT, jamais sur ce qu'il a envoyé.
 * Les deux fonctions rendent donc la MÊME forme d'issue.
 *
 * CE QUI REVIENT DU FIL EST UN DOCUMENT, PAS ENCORE UN RÉGLAGE. Le type
 * `NotificationPreference` est celui du SCHÉMA (`@meeshy/shared`) — le
 * DÉCLARER sur une charge qu'aucun schéma n'a relue serait une affirmation que
 * ce module ne peut pas tenir : la passerelle sert trente-trois clés plus les
 * métadonnées de la ligne, et rien ici ne les valide. `DocumentDeNotification`
 * dit donc ce qu'on SAIT — un objet dont les valeurs sont inconnues — et ce
 * sont les lecteurs (`prefs-porte.ts` par `Boolean()` / `typeof`, le module de
 * participation de même) qui font descendre chaque clé au type qu'ils
 * attendent. Sans cela, les coercitions qu'ils écrivent auraient l'air
 * redondantes, alors qu'elles sont le SEUL contrôle de la charge.
 */
export type DocumentDeNotification = DocumentDePreference;

export type IssueDePreferences =
  | { readonly genre: 'document'; readonly reglages: DocumentDeNotification }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'refus'; readonly statut: number }
  | { readonly genre: 'panne' };

/**
 * LA PROJECTION D'UNE CATÉGORIE — le pont entre `IssueDesPreferences`
 * (multi-catégories, § ci-dessus) et la forme à une seule catégorie que
 * `prefs-porte.ts` attend depuis #4899. `documents[categorie]` absent alors
 * que la passerelle a répondu 2xx est le CONTRAT qui n'est pas tenu, pas un
 * refus du lecteur — la même distinction que le 5xx.
 */
const projectionDeCategorie = (issue: IssueDesPreferences, categorie: CategorieDePreference): IssueDePreferences => {
  if (issue.genre !== 'documents') return issue;
  const reglages = issue.documents[categorie];
  return reglages === undefined ? { genre: 'panne' } : { genre: 'document', reglages };
};

export type ArgumentsDeLecture = {
  readonly jeton: string;
  readonly base?: string;
  readonly recuperer?: (url: string, options: RequestInit) => Promise<Response>;
};

export const preferencesDeNotification = async (args: ArgumentsDeLecture): Promise<IssueDePreferences> =>
  projectionDeCategorie(await lisLesPreferences({ ...args, categories: ['notification'] }), 'notification');

export type ArgumentsDeLaBascule = ArgumentsDeLecture & {
  readonly cle: CleDePreference;
  readonly valeur: boolean;
};

export const basculeUnePreference = async ({ cle, valeur, ...args }: ArgumentsDeLaBascule): Promise<IssueDePreferences> =>
  projectionDeCategorie(
    await ecrisUnePreference({ ...args, categorie: 'notification', champs: { [cle]: valeur } }),
    'notification',
  );

/**
 * `document.autoDownloadEnabled` — LE SEUL RÉGLAGE QUI CHANGE CE QUE LA
 * GALERIE CONSOMME (`/chats/:cle/medias`, critère de fin `detail-media`).
 *
 * Une PROJECTION de plus, et surtout une projection qui NE PEUT PAS ÉCHOUER :
 * elle rend un booléen, jamais une issue. Un écran de conversation ne se
 * refuse pas parce qu'une préférence n'a pas été lue — session expirée,
 * refus, panne réseau et contrat non tenu retombent tous sur `false`, c'est-
 * à-dire sur l'ÉCONOMIE. La direction de l'erreur est choisie par son COÛT DE
 * RÉPARATION : servir la grille sobre à qui voulait des vignettes se répare
 * d'un rechargement ; envoyer 48 vignettes à qui a demandé « jamais » a déjà
 * dépensé ses octets quand il s'en aperçoit.
 *
 * Seul un `true` explicitement SERVI ouvre les aperçus.
 */
export const apercusAutomatiques = async (args: ArgumentsDeLecture): Promise<boolean> => {
  const issue = await lisLesPreferences({ ...args, categories: ['document'] });
  return issue.genre === 'documents' && issue.documents.document?.autoDownloadEnabled === true;
};

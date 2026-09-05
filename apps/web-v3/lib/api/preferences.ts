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
export type DocumentDeNotification = Readonly<Record<string, unknown>>;

export type IssueDePreferences =
  | { readonly genre: 'document'; readonly reglages: DocumentDeNotification }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'refus'; readonly statut: number }
  | { readonly genre: 'panne' };

const corpsDeNotification = (valeur: unknown): DocumentDeNotification | null => {
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) return null;
  const data = (valeur as { readonly data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const notification = (data as { readonly notification?: unknown }).notification;
  if (typeof notification !== 'object' || notification === null || Array.isArray(notification)) return null;
  return notification as DocumentDeNotification;
};

const issueDePreferences = async (reponse: Response | null): Promise<IssueDePreferences> => {
  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };
  if (!reponse.ok) return reponse.status >= 500 ? { genre: 'panne' } : { genre: 'refus', statut: reponse.status };

  const corps = await reponse.json().catch(() => null);
  const reglages = corpsDeNotification(corps);
  // La passerelle a répondu 2xx sans le document attendu : c'est le CONTRAT
  // qui n'est pas tenu, pas un refus du lecteur — la même distinction que le
  // 5xx ci-dessus.
  return reglages === null ? { genre: 'panne' } : { genre: 'document', reglages };
};

const appellePreferences = async (
  url: string,
  options: RequestInit,
  recuperer?: (url: string, options: RequestInit) => Promise<Response>,
): Promise<IssueDePreferences> =>
  issueDePreferences(
    await (recuperer ?? ((u, o) => fetch(u, o)))(url, {
      ...options,
      cache: 'no-store',
      signal: AbortSignal.timeout(DELAI_MS),
    }).catch(() => null),
  );

export type ArgumentsDeLecture = {
  readonly jeton: string;
  readonly base?: string;
  readonly recuperer?: (url: string, options: RequestInit) => Promise<Response>;
};

export const preferencesDeNotification = async ({
  jeton,
  base,
  recuperer,
}: ArgumentsDeLecture): Promise<IssueDePreferences> =>
  appellePreferences(
    `${base ?? baseDeLaPasserelle()}/api/v1/me/preferences?categories=notification`,
    { method: 'GET', headers: enTetes(jeton) },
    recuperer,
  );

export type ArgumentsDeLaBascule = ArgumentsDeLecture & {
  readonly cle: CleDePreference;
  readonly valeur: boolean;
};

export const basculeUnePreference = async ({
  jeton,
  cle,
  valeur,
  base,
  recuperer,
}: ArgumentsDeLaBascule): Promise<IssueDePreferences> =>
  appellePreferences(
    `${base ?? baseDeLaPasserelle()}/api/v1/me/preferences`,
    {
      method: 'PATCH',
      headers: { ...enTetes(jeton), 'content-type': 'application/json' },
      body: JSON.stringify({ notification: { [cle]: valeur } }),
    },
    recuperer,
  );

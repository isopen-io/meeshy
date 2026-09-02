import { baseDeLaPasserelle } from './links';
import { DELAI_DE_REPONSE_MS } from './passerelle';

import type { Recuperateur } from './compte';

export type { Recuperateur };

/**
 * CE QUE L'ÉCRAN DES NOTIFICATIONS DEMANDE À LA PASSERELLE.
 *
 * Quatre routes, toutes en `onRequest: [fastify.authenticate]`
 * (`services/gateway/src/routes/notifications.ts` — la liste `:69`, les totaux
 * `:228`, le compte des non-lus `:299`, « marquer lu » `:340`, « tout lire »
 * `:401`) : un porteur, jamais une session invitée. L'écran est donc réservé au
 * lecteur connecté, et sa porte le sait avant d'appeler.
 *
 * LE PRISME EST DÉJÀ DESCENDU, ET C'EST LE SERVEUR QUI L'A FAIT. `title` et
 * `subtitle` sont « localisés & persistés côté serveur (source unique) »
 * (`NotificationFormatter.formatNotification:70-73`), et le corps servi est
 * celui que `NotificationService.prismTranslation` a élu pour CE lecteur. Ce
 * module ne re-résout donc RIEN : il projette ce qui est servi.
 *
 * Écrire ici une seconde descente serait la cinquième famille de résolveurs
 * divergents que `CLAUDE.md` documente cycle après cycle — et la pire, puisque
 * la bonne réponse est déjà dans la charge. Le seul texte que les trois
 * plateformes rendent est celui que le serveur a composé.
 *
 * TROIS ISSUES, ET LA DEUXIÈME N'EST PAS UNE PANNE — même loi que
 * `lib/api/compte.ts` : un 401 veut dire « ce jeton ne vaut plus », le cas
 * NOMINAL d'un retour après quelques jours, et l'écran y répond en renvoyant se
 * connecter. Le confondre avec une panne ferait lire « une erreur est survenue »
 * à qui doit simplement se reconnecter.
 */

const DELAI_MS = DELAI_DE_REPONSE_MS;

const CHEMIN_NOTIFICATIONS = '/api/v1/notifications';

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

const chaine = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur !== '' ? valeur : null;

const entier = (valeur: unknown): number =>
  typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : 0;

/**
 * UNE NOTIFICATION, PROJETÉE. Ce qui n'est pas ici n'est pas relayé : `actor`
 * porte l'identité complète de qui a agi, `delivery` dit si un e-mail et un
 * push sont partis, `metadata` transporte ce que le producteur y a mis. Aucun
 * de ces trois n'a de raison d'atteindre le HTML, et la projection se fait ICI
 * plutôt que dans la vue — un champ qu'on ne projette pas ne peut pas fuir par
 * un rendu distrait.
 *
 * `nomDeLActeur` est la SEULE chose retenue de `actor` : de quoi dire « Alice a
 * répondu », rien de plus.
 */
export type Notification = {
  readonly id: string;
  readonly genre: string;
  readonly titre: string | null;
  readonly sousTitre: string | null;
  readonly corps: string | null;
  readonly nomDeLActeur: string | null;
  readonly lue: boolean;
  readonly creeeA: string | null;
};

export type Boite =
  | {
      readonly genre: 'liste';
      readonly notifications: readonly Notification[];
      readonly nonLues: number;
      readonly total: number;
    }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

const demande = async (
  url: string,
  jeton: string,
  recuperer: Recuperateur | undefined,
  options: RequestInit = {},
): Promise<Response | null> =>
  (recuperer ?? ((u, o) => fetch(u, o)))(url, {
    headers: { accept: 'application/json', authorization: `Bearer ${jeton}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(DELAI_MS),
    ...options,
  }).catch(() => null);

/**
 * L'ÉTAT VIT SOUS `state`, PAS À LA RACINE. `formatNotification` range
 * `isRead`, `readAt`, `createdAt` et `expiresAt` dans un objet `state`
 * (`:85-91`) — lire `brut.isRead` rendrait `undefined`, donc « non lue », pour
 * TOUTES les notifications : un compteur qui ne descend jamais.
 *
 * La forme RACINE est acceptée en second : c'est celle qu'un événement socket
 * porte, et le jour où la liste et l'événement peignent la même ligne, ils
 * doivent en lire l'état au même endroit.
 */
const notification = (brut: Readonly<Record<string, unknown>>): Notification | null => {
  const id = chaine(brut.id);
  if (id === null) return null;

  const etat = objet(brut.state);
  const lue = etat === null ? brut.isRead === true : etat.isRead === true;
  const creeeA = etat === null ? chaine(brut.createdAt) : chaine(etat.createdAt);

  return {
    id,
    genre: chaine(brut.type) ?? 'system',
    titre: chaine(brut.title),
    sousTitre: chaine(brut.subtitle),
    corps: chaine(brut.content),
    nomDeLActeur: chaine(objet(brut.actor)?.displayName),
    lue,
    creeeA,
  };
};

/**
 * `GET /notifications` — la boîte du lecteur.
 *
 * `limit` n'a AUCUN défaut côté passerelle (#4175 : Fastify active `useDefaults`
 * d'AJV, et le schéma s'en abstient délibérément) : ne pas le passer laisserait
 * le handler décider seul. On le passe donc, et la valeur est une décision de
 * COÛT — trente lignes tiennent l'écran d'un pouce sans faire payer une 3G
 * rurale pour ce qu'elle ne montrera pas.
 */
export const boiteDuLecteur = async ({
  jeton,
  limite = 30,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly limite?: number;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Boite> => {
  const url = `${base ?? baseDeLaPasserelle()}${CHEMIN_NOTIFICATIONS}?limit=${limite}`;
  const reponse = await demande(url, jeton, recuperer);

  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success !== true) return { genre: 'panne' };

  const brutes = Array.isArray(enveloppe.data) ? enveloppe.data : [];
  const notifications = brutes
    .map((n) => objet(n))
    .filter((n): n is Readonly<Record<string, unknown>> => n !== null)
    .map(notification)
    .filter((n): n is Notification => n !== null);

  // LE COMPTE DES NON-LUES EST À LA RACINE DE L'ENVELOPPE, pas sous `meta` :
  // le handler le pose à côté de `data` et de `pagination`
  // (`routes/notifications.ts:207` et `:215`, les deux formes de page). Le lire
  // ailleurs rendrait `undefined`, donc ZÉRO — un compteur éteint en
  // permanence, et une pastille qui ne s'allume jamais.
  //
  // Il est SERVI, jamais recompté sur la page : celle-ci ne porte que `limite`
  // lignes, et compter dessus donnerait un total plafonné à trente qui se
  // contredirait dès la page suivante.
  //
  // `total` n'existe QUE sur la forme par RANG (`:194`) ; la forme par CURSEUR
  // sert la pagination de `cursorPage`, qui ne le porte pas — un tel total ne
  // se déduit pas d'un curseur, et l'inventer serait pire que l'absence.
  const pagination = objet(enveloppe.pagination);

  return {
    genre: 'liste',
    notifications,
    nonLues: entier(enveloppe.unreadCount),
    total: entier(pagination?.total),
  };
};

/**
 * `POST /notifications/read-all` — l'action de l'écran.
 *
 * Elle rend une ISSUE, pas un booléen : les trois cas de la porte sont les
 * mêmes qu'en lecture, et les confondre ferait afficher « une erreur est
 * survenue » à qui doit simplement se reconnecter. C'est la même loi que
 * `lib/api/compte.ts`, et elle vaut aussi pour ce qui ÉCRIT.
 *
 * Le corps de la réponse porte `count` (le nombre de lignes marquées) : on ne
 * le lit pas, parce que rien ne l'affiche. Le jour où l'écran dira « 12
 * marquées comme lues », il se lira ici — pas dans un second appel.
 */
export type IssueDeLecture = 'faite' | 'session-expiree' | 'panne';

export const toutMarquerLu = async ({
  jeton,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<IssueDeLecture> => {
  const url = `${base ?? baseDeLaPasserelle()}${CHEMIN_NOTIFICATIONS}/read-all`;
  const reponse = await demande(url, jeton, recuperer, { method: 'POST' });

  if (reponse === null) return 'panne';
  if (reponse.status === 401) return 'session-expiree';

  const enveloppe = objet(await reponse.json().catch(() => null));
  return enveloppe?.success === true ? 'faite' : 'panne';
};

import { chaine, instant, nombre, objet } from './lecture';
import { baseDeLaPasserelle, DELAI_DE_REPONSE_MS } from './passerelle';
import { APPELS, type Direction } from '../contenu/appels';

import type { Recuperateur } from './compte';

export type { Recuperateur };
export type { Direction };

/**
 * CE QUE L'ÉCRAN DES APPELS DEMANDE À LA PASSERELLE.
 *
 * UN SEUL ENDPOINT, ET AUCUN ÉVÉNEMENT SOCKET : `GET /api/v1/calls/history`
 * (`services/gateway/src/routes/calls-consultation.ts:450-553`, enregistrée
 * par `registerCallsConsultationRoutes`, `services/gateway/src/routes/calls.ts:50`,
 * elle-même montée par `routes/index.ts:317`) — `preValidation: [requiredAuth]`
 * SEUL (`:451`) : un porteur JWT, jamais une session invitée. La consultation
 * de l'historique des appels n'a ni module de participation ni socket — le
 * critère de la matrice l'exclut nommément (aucune pile WebRTC, aucun
 * `CallManager`), et le temps réel de la v3 est réservé aux surfaces de
 * PARTICIPATION (fil, liste), jamais à un journal.
 *
 * `direction`, `isVideo` ET `durationSec` SONT DÉRIVÉS SERVEUR
 * (`deriveCallDirection`, `callIsVideo`, `deriveDurationSec`,
 * `services/gateway/src/services/callHistory.ts:92-122`) — ce module les LIT,
 * il ne les recalcule JAMAIS. `direction:'missed'` signifie systématiquement
 * un appel REÇU jamais répondu (`deriveCallDirection` ne rend `'missed'` que
 * quand `initiatorId !== userId`) : un manqué est donc toujours « entrant »,
 * ce que la copie (`lib/contenu/appels.ts`) écrit en dur plutôt que de le
 * déduire une seconde fois.
 *
 * LE TITRE SE RÉSOUT DANS LA PROJECTION, pas dans la vue. `conversationTitle`
 * identifie un appel de GROUPE (`peer:null`) ; un appel DIRECT sans titre se
 * nomme par son correspondant (`peer.displayName ?? peer.username`). Une ligne
 * sans aucun des deux ne se rend pas anonyme : elle dit « Conversation »
 * (`APPELS.sansNom`), jamais une chaîne vide qui romprait la mise en page.
 *
 * `peer.isOnline` N'EST JAMAIS LU. La cible (`cible/calls.png`) ne dessine
 * aucune pastille de présence, et la règle produit du 2026-08-25 interdit d'en
 * fabriquer une hors de la loi partagée — ce module ne la fabrique donc pas en
 * s'abstenant de la projeter : un champ qu'on ne lit pas ne peut pas fuir par
 * un rendu distrait (même garde que `lib/api/notifications.ts` pour `actor`).
 * `phoneNumber`, `avatar`, `bytesSent`/`bytesReceived` ne le sont pas non plus
 * — rien de ce que la cible ne montre pas n'entre dans la projection.
 */

const DELAI_MS = DELAI_DE_REPONSE_MS;

const CHEMIN_APPELS = '/api/v1/calls/history';

const DIRECTIONS: readonly Direction[] = ['incoming', 'outgoing', 'missed'];

/**
 * UN APPEL, PROJETÉ — les sept champs que la vue rend, et rien d'autre.
 */
export type Appel = {
  readonly id: string;
  readonly conversationId: string;
  readonly titre: string;
  readonly direction: Direction;
  readonly video: boolean;
  readonly debutA: string;
  readonly dureeSec: number;
  /**
   * `status` LU, jamais recalculé — `deriveCallDirection` ne dérive
   * `'missed'` QUE pour un appel reçu (`callHistory.ts:92-100`) : un SORTANT
   * `rejected`/`failed` (jamais décroché) reste `direction:'outgoing'` avec
   * `durationSec:0`, la MÊME forme qu'un répondu de durée nulle sans ce
   * champ. `true` seulement pour `'rejected'`/`'failed'` — jamais pour
   * `'ended'`/`'missed'`, que `direction` dit déjà.
   */
  readonly nonAbouti: boolean;
};

export type Journal =
  | {
      readonly genre: 'journal';
      readonly appels: readonly Appel[];
      /**
       * Le curseur de la page SUIVANTE, ou `null` — même dérivation que
       * `boiteDuLecteur().curseurSuivant` (`lib/api/notifications.ts`) : depuis
       * `pagination.hasMore`, pas la seule présence de `nextCursor`.
       */
      readonly curseurSuivant: string | null;
    }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

const demande = async (
  url: string,
  jeton: string,
  recuperer: Recuperateur | undefined,
): Promise<Response | null> =>
  (recuperer ?? ((u, o) => fetch(u, o)))(url, {
    headers: { accept: 'application/json', authorization: `Bearer ${jeton}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(DELAI_MS),
  }).catch(() => null);

const appel = (brut: Readonly<Record<string, unknown>>): Appel | null => {
  const id = chaine(brut.callId);
  const conversationId = chaine(brut.conversationId);
  const debutA = instant(brut.startedAt);
  const direction = chaine(brut.direction);
  if (id === null || conversationId === null || debutA === null) return null;
  if (direction === null || !DIRECTIONS.includes(direction as Direction)) return null;

  const pair = objet(brut.peer);
  const nomDuPair = pair === null ? null : (chaine(pair.displayName) ?? chaine(pair.username));
  const statut = chaine(brut.status);

  return {
    id,
    conversationId,
    titre: chaine(brut.conversationTitle) ?? nomDuPair ?? APPELS.sansNom,
    direction: direction as Direction,
    video: brut.isVideo === true,
    debutA,
    dureeSec: nombre(brut.durationSec) ?? 0,
    nonAbouti: statut === 'rejected' || statut === 'failed',
  };
};

/**
 * `GET /calls/history` — le journal du lecteur.
 *
 * `limit` n'a AUCUN défaut absent du schéma AJV du CÔTÉ CLIENT (le schéma de
 * la route en porte un, `:459`) : on le passe quand même — même loi de COÛT que
 * `boiteDuLecteur` — trente lignes tiennent l'écran d'un pouce sans faire
 * payer une 3G rurale pour ce qu'elle ne montrera pas.
 */
export const journalDesAppels = async ({
  jeton,
  limite = 30,
  curseur,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly limite?: number;
  readonly curseur?: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Journal> => {
  const url =
    `${base ?? baseDeLaPasserelle()}${CHEMIN_APPELS}?limit=${limite}` +
    (curseur === undefined ? '' : `&cursor=${encodeURIComponent(curseur)}`);
  const reponse = await demande(url, jeton, recuperer);

  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success !== true) return { genre: 'panne' };

  const brutes = Array.isArray(enveloppe.data) ? enveloppe.data : [];
  const appels = brutes
    .map((a) => objet(a))
    .filter((a): a is Readonly<Record<string, unknown>> => a !== null)
    .map(appel)
    .filter((a): a is Appel => a !== null);

  const pagination = objet(enveloppe.pagination);

  return {
    genre: 'journal',
    appels,
    curseurSuivant: pagination?.hasMore === true ? (chaine(pagination.nextCursor) ?? null) : null,
  };
};

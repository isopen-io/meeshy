import { baseDeLaPasserelle } from './links';
import { DELAI_DE_REPONSE_MS } from './passerelle';
import { chaine, instant, objet } from './lecture';
import type { Fil } from './fil';

/**
 * LE PROFIL D'UN PARTICIPANT — ce que `GET /api/v1/directory/people/:handle`
 * SERT, et rien de plus (conception § 12.10.3 point 4).
 *
 * `handle` EST `Message.auteurId` ou `Conversation.homologue.id` — un
 * `User.id`, jamais un pseudonyme composé ici : la route accepte « MongoDB
 * ObjectId or username (case-insensitive) », et la v3 lui passe l'identifiant
 * qu'elle tient déjà, sans en fabriquer un second.
 *
 * DEUX ABSENCES SONT DES RÈGLES, PAS DES OUBLIS :
 *
 *   • AUCUNE LANGUE — `?expand=relation` ne demande pas `stats` ni `presence`,
 *     et la projection de base (`publicProfileSchema`) ne porte aucune langue
 *     depuis #4161. La ligne de langue du panneau vient du FIL
 *     (`langueDeLAuteurDansLeFil`, `app/connecte/profil-vue.ts`) : ce module
 *     ne lit et ne sert JAMAIS de langue.
 *   • AUCUNE PRÉSENCE — sans `?expand=presence`, la route retire
 *     `isOnline`/`lastActiveAt` (`person.ts:276-279`) et les regarderait de
 *     toute façon à travers `gateProfilePresence` (hors amitié acceptée / soi
 *     / ADMIN+, directive 2026-08-25). Ce module ne les demande pas — la
 *     charge ne les porte donc jamais, et ce type ne les déclare pas.
 *
 * LE LECTEUR ANONYME (l'invité de `/chat/:lien`, sans compte) est traité comme
 * n'importe quel appelant sans jeton : `onRequest: [getOptionalAuth]` l'admet
 * (`person.ts:175`), et sa `relation` revient toujours `'none'`
 * (`relationAvec`, `person.ts`) — jamais de session invitée présentée : la
 * route ne sait rien en faire, elle ne connaît que `Authorization: Bearer`.
 */

export type ProfilPublic = {
  readonly id: string;
  /** `displayName ?? username` — jamais un repli inventé : la passerelle sert toujours l'un des deux. */
  readonly nom: string;
  readonly pseudonyme: string | null;
  readonly bio: string | null;
  /** `createdAt` — pour « Sur Meeshy depuis mars 2024 ». */
  readonly membreDepuis: string | null;
  readonly anonyme: boolean;
};

export type Relation = 'none' | 'self' | 'friend' | 'pending_sent' | 'pending_received';

export type ProfilServi =
  | { readonly genre: 'profil'; readonly profil: ProfilPublic; readonly relation: Relation; readonly estSoi: boolean }
  | { readonly genre: 'introuvable' }
  | { readonly genre: 'limite'; readonly message: string }
  | { readonly genre: 'panne' };

const DELAI_MS = DELAI_DE_REPONSE_MS;

export type Recuperateur = (url: string, options: RequestInit) => Promise<Response>;

const demande = (
  url: string,
  jeton: string | null,
  recuperer: Recuperateur | undefined,
): Promise<Response | null> =>
  (recuperer ?? ((u, o) => fetch(u, o)))(url, {
    headers: { accept: 'application/json', ...(jeton === null ? {} : { authorization: `Bearer ${jeton}` }) },
    cache: 'no-store',
    signal: AbortSignal.timeout(DELAI_MS),
  }).catch(() => null);

const RELATIONS: readonly Relation[] = ['none', 'self', 'friend', 'pending_sent', 'pending_received'];

const relation = (valeur: unknown): Relation =>
  (RELATIONS as readonly unknown[]).includes(valeur) ? (valeur as Relation) : 'none';

const profilPublic = (brut: Readonly<Record<string, unknown>>): ProfilPublic | null => {
  const id = chaine(brut.id);
  const nom = chaine(brut.displayName) ?? chaine(brut.username);
  if (id === null || nom === null) return null;
  return {
    id,
    nom,
    pseudonyme: chaine(brut.username),
    bio: chaine(brut.bio),
    membreDepuis: instant(brut.createdAt),
    anonyme: brut.isAnonymous === true,
  };
};

/**
 * `GET /api/v1/directory/people/:handle?expand=relation`
 * (`services/gateway/src/routes/directory/person.ts:175`).
 *
 * `jeton` est le JWT du MEMBRE, ou `null` — jamais une session invitée : la
 * route ne lit que `Authorization: Bearer`, et un invité (sans compte) est
 * donc lu comme n'importe quel appelant anonyme (`relation: 'none'`).
 */
export const profilDuParticipant = async ({
  handle,
  jeton,
  base,
  recuperer,
}: {
  readonly handle: string;
  readonly jeton: string | null;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<ProfilServi> => {
  const url = `${base ?? baseDeLaPasserelle()}/api/v1/directory/people/${encodeURIComponent(handle)}?expand=relation`;
  const reponse = await demande(url, jeton, recuperer);
  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 404) return { genre: 'introuvable' };

  const enveloppe = objet(await reponse.json().catch(() => null));

  if (reponse.status === 429) {
    return { genre: 'limite', message: chaine(enveloppe?.message) ?? chaine(enveloppe?.error) ?? '' };
  }
  if (!reponse.ok || enveloppe?.success !== true) return { genre: 'panne' };

  const brut = objet(enveloppe.data);
  if (brut === null) return { genre: 'panne' };
  const profil = profilPublic(brut);
  if (profil === null) return { genre: 'panne' };

  return { genre: 'profil', profil, relation: relation(brut.relation), estSoi: brut.isSelf === true };
};

/**
 * LES TROIS ACTIONS RÉELLES DU PANNEAU — chacune sa route, lue dans le code de
 * la passerelle (§ 12.10.3 point 5) :
 *
 *   • Écrire ⇒ `POST /api/v1/conversations` (`type:'direct'`,
 *     `routes/conversations/core-lifecycle.ts:73`, qui RÉUTILISE le
 *     tête-à-tête existant s'il y en a un déjà, `:219`) ;
 *   • Ajouter en ami ⇒ `POST /api/v1/directory/friend-requests`
 *     (`friend-requests.ts:289`) ;
 *   • Bloquer ⇒ `PUT /api/v1/directory/blocks/:userId` (`blocks.ts:301`).
 *
 * LES TROIS EXIGENT UN COMPTE (`fastify.authenticate` sur les deux dernières ;
 * la première vérifie `authContext.registeredUser` dans son handler) : un
 * appel sans jeton n'est jamais tenté — la porte (`app/connecte/
 * profil-porte.ts`) ne les propose qu'à un lecteur qui en tient un.
 */
export type IssueDAction =
  | { readonly genre: 'redirection'; readonly conversation: string }
  | { readonly genre: 'fait' }
  | { readonly genre: 'refus' }
  | { readonly genre: 'panne' };

const enTetesEcriture = (jeton: string): Readonly<Record<string, string>> => ({
  accept: 'application/json',
  authorization: `Bearer ${jeton}`,
  'content-type': 'application/json',
});

const appelle = async (
  url: string,
  options: RequestInit,
  recuperer: Recuperateur | undefined,
): Promise<Response | null> =>
  (recuperer ?? ((u, o) => fetch(u, o)))(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(DELAI_MS) }).catch(
    () => null,
  );

export const demarreUneConversation = async ({
  jeton,
  cible,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly cible: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<IssueDAction> => {
  const reponse = await appelle(
    `${base ?? baseDeLaPasserelle()}/api/v1/conversations`,
    { method: 'POST', headers: enTetesEcriture(jeton), body: JSON.stringify({ type: 'direct', participantIds: [cible] }) },
    recuperer,
  );
  if (reponse === null) return { genre: 'panne' };
  if (!reponse.ok) return reponse.status >= 500 ? { genre: 'panne' } : { genre: 'refus' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  const id = chaine(objet(enveloppe?.data)?.id);
  return id === null ? { genre: 'panne' } : { genre: 'redirection', conversation: id };
};

export const envoieUneDemandeDAmi = async ({
  jeton,
  cible,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly cible: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<IssueDAction> => {
  const reponse = await appelle(
    `${base ?? baseDeLaPasserelle()}/api/v1/directory/friend-requests`,
    { method: 'POST', headers: enTetesEcriture(jeton), body: JSON.stringify({ receiverId: cible }) },
    recuperer,
  );
  if (reponse === null) return { genre: 'panne' };
  if (!reponse.ok) return reponse.status >= 500 ? { genre: 'panne' } : { genre: 'refus' };
  return { genre: 'fait' };
};

export const bloqueUnParticipant = async ({
  jeton,
  cible,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly cible: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<IssueDAction> => {
  const reponse = await appelle(
    `${base ?? baseDeLaPasserelle()}/api/v1/directory/blocks/${encodeURIComponent(cible)}`,
    { method: 'PUT', headers: enTetesEcriture(jeton) },
    recuperer,
  );
  if (reponse === null) return { genre: 'panne' };
  if (!reponse.ok) return reponse.status >= 500 ? { genre: 'panne' } : { genre: 'refus' };
  return { genre: 'fait' };
};

/**
 * LA LANGUE D'UN AUTEUR, TELLE QUE LE FIL LA CONNAÎT — jamais celle du profil,
 * qui n'en porte aucune (#4161). Le message le plus RÉCENT de cette personne
 * dans la tranche SERVIE dit dans quelle langue elle écrit ici ; sans message
 * d'elle dans la tranche (la liste des conversations, par exemple, qui n'a
 * aucun message chargé), la ligne ne se rend pas — rien n'est fabriqué.
 */
export const langueDeLAuteurDansLeFil = (fil: Fil | null, handle: string): string | null => {
  if (fil === null) return null;
  for (let rang = fil.messages.length - 1; rang >= 0; rang -= 1) {
    const message = fil.messages[rang];
    if (message !== undefined && message.auteurId === handle && !message.anonyme && message.langueOriginale !== null) {
      return message.langueOriginale;
    }
  }
  return null;
};

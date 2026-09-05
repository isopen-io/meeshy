import { chaine, instant, nombre, objet } from './lecture';
import { baseDeLaPasserelle, DELAI_DE_REPONSE_MS } from './passerelle';
import { COMMUNAUTES } from '../contenu/communautes';

import type { Recuperateur } from './compte';

export type { Recuperateur };

/**
 * CE QUE `/communities` DEMANDE À LA PASSERELLE — trois routes, §§ 2.1-2.3 de
 * la spécification, `services/gateway/src/routes/communities/core.ts`.
 * AUCUN ÉVÉNEMENT SOCKET (`packages/shared/types/socketio-events.ts` ne
 * déclare aucun `community:*`) : l'écran est une surface de CONSULTATION, pas
 * de participation — le temps réel de la v3 est réservé au fil et à la liste.
 *
 * **LA GARDE DE PRÉSENCE (directive 2026-08-25) — rien ne se lit, rien ne se
 * fabrique.** `GET /communities` charge `members.user.isOnline` côté serveur
 * pour le jeter à la sérialisation (`flattenCommunityCounts`,
 * `communities/serialization.ts:30-37` — `members` est RETIRÉ ; `creator` est
 * chargé par un `select` sans `isOnline` ; `communitySchema` ne déclare pas
 * `members`) : la charge reçue ici ne porte donc DÉJÀ aucune présence. Ce
 * module ne lit `members`, `creator.isOnline` ni `lastActiveAt` NULLE PART —
 * même sur une charge ADVERSE qui les porterait, la projection ci-dessous ne
 * les toucherait pas : un champ qu'on ne lit pas ne peut pas fuir par un rendu
 * distrait (même loi que `lib/api/appels.ts:38-42`). `participants[]` de
 * `GET /communities/:id/conversations` (§ 2.2) — dont la présence POST-GATE
 * (`member-presence.ts:88`) masque déjà un tiers hors amitié acceptée — n'est
 * de toute façon JAMAIS lue : la projection s'arrête à `id`/`titre`/le COMPTE
 * `_count.participants`/`lastMessageAt`.
 */

const DELAI_MS = DELAI_DE_REPONSE_MS;

const CHEMIN_COMMUNAUTES = '/api/v1/communities';

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

const messageDeLErreur = (enveloppe: Readonly<Record<string, unknown>> | null): string | null =>
  chaine(objet(enveloppe?.error)?.message) ?? chaine(enveloppe?.error) ?? chaine(enveloppe?.message);

/**
 * UNE COMMUNAUTÉ, PROJETÉE — les cinq champs que la ligne rend, et rien
 * d'autre. `identifier`, `creator`, `avatar`, `banner`, `description` ne sont
 * PAS projetés : rien de ce que la cible ne montre pas n'entre (§ 2.1).
 */
export type Communaute = {
  readonly id: string;
  readonly nom: string;
  readonly prive: boolean;
  readonly membres: number;
  readonly conversations: number;
};

export type ListeDesCommunautes =
  | {
      readonly genre: 'liste';
      readonly communautes: readonly Communaute[];
      /** L'OFFSET de la page suivante (Q8 : offset, pas un curseur opaque), ou `null`. */
      readonly suite: number | null;
    }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

const communaute = (brut: Readonly<Record<string, unknown>>): Communaute | null => {
  const id = chaine(brut.id);
  const nom = chaine(brut.name);
  const membres = nombre(brut.memberCount);
  const conversations = nombre(brut.conversationCount);
  if (id === null || nom === null || membres === null || conversations === null) return null;
  return { id, nom, prive: brut.isPrivate === true, membres, conversations };
};

/**
 * `GET /communities` — la liste du lecteur (§ 2.1). `offset`/`limite` en
 * OFFSET, comme la passerelle : pas de second moteur de pagination (Q8).
 */
export const communautesDuLecteur = async ({
  jeton,
  offset = 0,
  limite = 20,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly offset?: number;
  readonly limite?: number;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<ListeDesCommunautes> => {
  const url = `${base ?? baseDeLaPasserelle()}${CHEMIN_COMMUNAUTES}?limit=${limite}&offset=${offset}`;
  const reponse = await demande(url, jeton, recuperer);

  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success !== true) return { genre: 'panne' };

  const brutes = Array.isArray(enveloppe.data) ? enveloppe.data : [];
  const communautes = brutes
    .map((c) => objet(c))
    .filter((c): c is Readonly<Record<string, unknown>> => c !== null)
    .map(communaute)
    .filter((c): c is Communaute => c !== null);

  const pagination = objet(enveloppe.pagination);
  const suite = pagination?.hasMore === true ? offset + brutes.length : null;

  return { genre: 'liste', communautes, suite };
};

/**
 * UNE CONVERSATION DE COMMUNAUTÉ, PROJETÉE — `participants` est le COMPTE
 * `_count.participants`, jamais la liste `participants[]` (§ 2.2 : elle
 * porte la présence post-gate des co-participants, et cette projection ne la
 * lit pas — la garde de présence tient par CONSTRUCTION, pas par un filtre).
 */
export type ConversationDeCommunaute = {
  readonly id: string;
  readonly titre: string;
  readonly participants: number;
  readonly dernierMessageA: string | null;
};

export type OuvertureDeLaCommunaute =
  | { readonly genre: 'ouverte'; readonly conversations: readonly ConversationDeCommunaute[] }
  | { readonly genre: 'refus' }
  | { readonly genre: 'introuvable' }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

const conversationDeCommunaute = (brut: Readonly<Record<string, unknown>>): ConversationDeCommunaute | null => {
  const id = chaine(brut.id);
  if (id === null) return null;
  const compte = objet(brut._count);
  return {
    id,
    titre: chaine(brut.title) ?? COMMUNAUTES.sansTitre,
    participants: nombre(compte?.participants) ?? 0,
    dernierMessageA: instant(brut.lastMessageAt),
  };
};

/**
 * `GET /communities/:id/conversations` — l'ouverture d'une communauté (§ 2.2,
 * état `?ouverte=`). `id` EST L'ID DE BASE, pas l'`identifier` lisible — la
 * seule forme que cette route accepte, contrairement à `GET /communities/:id`.
 */
export const conversationsDeLaCommunaute = async ({
  jeton,
  id,
  offset = 0,
  limite = 20,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly id: string;
  readonly offset?: number;
  readonly limite?: number;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<OuvertureDeLaCommunaute> => {
  const url =
    `${base ?? baseDeLaPasserelle()}${CHEMIN_COMMUNAUTES}/${encodeURIComponent(id)}/conversations` +
    `?limit=${limite}&offset=${offset}`;
  const reponse = await demande(url, jeton, recuperer);

  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };
  if (reponse.status === 403) return { genre: 'refus' };
  if (reponse.status === 404) return { genre: 'introuvable' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success !== true) return { genre: 'panne' };

  const brutes = Array.isArray(enveloppe.data) ? enveloppe.data : [];
  const conversations = brutes
    .map((c) => objet(c))
    .filter((c): c is Readonly<Record<string, unknown>> => c !== null)
    .map(conversationDeCommunaute)
    .filter((c): c is ConversationDeCommunaute => c !== null);

  return { genre: 'ouverte', conversations };
};

/** Le corps de `POST /communities` (§ 2.3) — trois champs, `identifier` absent (Q4 : auto-généré serveur). */
export type CommunauteACreer = {
  readonly nom: string;
  readonly description?: string;
  readonly prive: boolean;
};

export type CommunauteCreee =
  | { readonly genre: 'creee'; readonly id: string }
  /** 409 — l'identifiant auto-généré du nom existe déjà. `motif` est le message SERVEUR, gardé pour trace, jamais affiché tel quel (`communautes-porte.ts` le remplace par `COMMUNAUTES.conflit`). */
  | { readonly genre: 'conflit'; readonly motif: string }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

/**
 * `POST /communities` (§ 2.3, l'action « Créer » de la cible, Q4).
 * `isPrivate` est TOUJOURS envoyé explicitement — comme `lienASoumettre`
 * (`liens-vue.ts`) le fait pour ses permissions : une case non cochée
 * n'envoie rien, et laisser la passerelle poser son propre défaut ferait
 * mentir la case « Communauté privée » décochée par le lecteur.
 */
export const creeUneCommunaute = async ({
  jeton,
  champs,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly champs: CommunauteACreer;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<CommunauteCreee> => {
  const reponse = await (recuperer ?? ((u, o) => fetch(u, o)))(`${base ?? baseDeLaPasserelle()}${CHEMIN_COMMUNAUTES}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${jeton}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: champs.nom,
      isPrivate: champs.prive,
      ...(champs.description === undefined || champs.description === '' ? {} : { description: champs.description }),
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(DELAI_MS),
  }).catch(() => null);

  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };

  const enveloppe = objet(await reponse.json().catch(() => null));

  if (reponse.status === 409) {
    return { genre: 'conflit', motif: messageDeLErreur(enveloppe) ?? '' };
  }
  if (!reponse.ok) return { genre: 'panne' };

  const id = chaine(objet(enveloppe?.data)?.id);
  if (id === null) return { genre: 'panne' };

  return { genre: 'creee', id };
};

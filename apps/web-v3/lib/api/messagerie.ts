import type { MessageServi } from '@/app/(public)/chats/[lien]/fil-modele';

import { causeDuRefus, type CauseDeRefus } from './adhesion';
import {
  baseDeLaPasserelle,
  champ,
  cheminDeLaPasserelle,
  donneeDe,
  enTetesDuVisiteur,
  instant,
  lisLaCharge,
  objet,
  recupere,
  texte,
  type IdentiteDuVisiteur,
  type Recuperateur,
} from './passerelle';

/**
 * LE FIL — lire les messages d'une conversation partagée, et y écrire
 * (conception § 5.1, lignes « Lire le fil de messages » et « Envoyer un
 * message »).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LES RÉGIMES, DÉCLARÉS ICI ET PAS IMPROVISÉS DANS UN COMPOSANT (§ 5.2)
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   • LIRE — `GET /conversations/:id/messages` : la base existe, les vues
 *     `pinned`/`search` sont ailleurs et **`view=thread` n'existe pas**.
 *     RÉGIME 3 : la v3 n'expose donc AUCUN contrôle de fil de réponses, plutôt
 *     qu'un contrôle inerte (loi 4).
 *   • ÉCRIRE — `POST /conversations/:id/messages`, en `jwt-or-session` : la
 *     forme cible, telle quelle. **Jamais** `POST /links/:identifier/messages`,
 *     que le § 5.1 déclare vouée à disparaître.
 *   • Le RATTRAPAGE vit à côté (`lib/realtime/sync/delta-client.ts`) : c'est
 *     `GET /sync`, une porte de TRANSPORT et non de messagerie, et le § 3.3 la
 *     range sous `lib/realtime/`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUATRE VERDICTS, LES MÊMES QUE LA PORTE DE LA PLACE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 200 ⇒ servi · 401 ⇒ `close` (état F) · 410 ⇒ `lien-mort` (état G) ·
 * 403 ⇒ `refus` · tout le reste ⇒ `indisponible`. C'est le vocabulaire de
 * `revalideLaPlace` et ce n'en est pas une copie de confort : un écran qui
 * traduirait un 500 ou un tunnel coupé en « votre place a été fermée »
 * effacerait une session valide, ce que le § 7 interdit nommément (« erreur
 * réseau ≠ 401 »).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 403 N'EST PAS UNE COUPURE — et le confondre ment sur les TROIS plans
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Un 403 tombait jusqu'ici dans `indisponible`, que les écrans peignent en
 * « la connexion n'a pas abouti … réessayez plus tard ». Chacun des trois
 * membres de cette phrase est faux sur un refus : la connexion a parfaitement
 * abouti, la conversation n'est PLUS lisible, et réessayer n'aboutira jamais.
 * C'est un cul-de-sac présenté comme une panne passagère.
 *
 * Les portes qui le rendent sont réelles et atteignables sans rien de spécial :
 * `GET /conversations/:id/attachments` répond 403 quand le participant est
 * introuvable (un invité exclu par un modérateur, ou dont la place a été
 * purgée) ou rattaché à une AUTRE conversation
 * (`routes/attachments/metadata.ts`).
 *
 * **404 n'a pas d'état à part, et c'est une mesure, pas un oubli** : aucune des
 * portes que ce module appelle ne le produit — un participant introuvable y
 * tombe déjà en 403. Lui donner un état sans producteur serait écrire une copie
 * que personne ne peut voir.
 */

const CHEMIN_DU_FIL = (conversationId: string): string =>
  cheminDeLaPasserelle(`/conversations/${encodeURIComponent(conversationId)}/messages`);

/** Ce que la porte rend, quelle que soit la porte — un seul vocabulaire pour l'écran. */
export type Verdict<T> =
  | { readonly etat: 'servi'; readonly valeur: T }
  | { readonly etat: 'close' }
  | { readonly etat: 'lien-mort'; readonly cause: CauseDeRefus }
  /** 403 — la porte a répondu, et elle dit NON. Voir `verdictDeLaReponse`. */
  | { readonly etat: 'refus' }
  | { readonly etat: 'indisponible' };

/**
 * CE QUI A TUÉ L'APPEL, quand ce n'est pas le réseau — les deux seuls états
 * dont un écran doit changer, et ils ne se peignent pas pareil.
 *
 * Le type vit ICI, à côté du verdict qui le produit, et pas dans l'écran : la
 * file hors-ligne (`lib/realtime/queue/`) doit dire pourquoi elle annule, et
 * l'écran doit dire quoi peindre. Deux définitions de « pourquoi » — une chaîne
 * ici, une union là — se seraient rejointes par un `as`, c'est-à-dire par une
 * assertion sur la seule chose que le compilateur pouvait garder juste.
 */
export type RefusDeLaPlace =
  | { readonly type: 'place-fermee' }
  | { readonly type: 'lien-mort'; readonly cause: CauseDeRefus }
  /**
   * 403 — l'accès à CETTE conversation est refusé, la place fût-elle valide.
   * Il rejoint les deux autres plutôt que de rester dans l'indisponibilité,
   * parce qu'il partage leur propriété DÉCISIVE pour la file hors ligne : rien
   * de ce qu'on rejouera ne passera. Un envoi retenu sur un refus définitif est
   * un message qui n'arrivera jamais et qu'on continue d'annoncer en attente.
   */
  | { readonly type: 'acces-refuse' };

export const refusDeLaPlace = (verdict: Verdict<unknown>): RefusDeLaPlace | null => {
  if (verdict.etat === 'close') return { type: 'place-fermee' };
  if (verdict.etat === 'lien-mort') return { type: 'lien-mort', cause: verdict.cause };
  if (verdict.etat === 'refus') return { type: 'acces-refuse' };
  return null;
};

export type AppelDeLaPlace = {
  /** Le jeton opaque de la place — jamais un JWT : un invité n'en a pas. */
  readonly jeton: string;
  readonly identite?: IdentiteDuVisiteur;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
};

/**
 * Les en-têtes d'un appel INVITÉ.
 *
 * `X-Session-Token` est ce que le `CLAUDE.md` racine nomme pour l'anonyme, et
 * c'est la clé que les trois portes du gateway lisent
 * (`middleware/auth.ts`, `AuthHandler.ts`, `routes/links/messages.ts`). Aucun
 * `Authorization` n'est composé ici : un invité qui en porterait un serait un
 * invité qu'on a confondu avec un membre.
 */
export const enTetesDeLaPlace = (appel: AppelDeLaPlace): Readonly<Record<string, string>> => ({
  'content-type': 'application/json',
  accept: 'application/json',
  'x-session-token': appel.jeton,
  ...enTetesDuVisiteur(appel.identite),
});

export const verdictDeLaReponse = async <T,>(
  reponse: Response | null,
  valeur: (reponse: Response) => Promise<T | null>,
): Promise<Verdict<T>> => {
  if (reponse === null) return { etat: 'indisponible' };
  if (reponse.status === 401) return { etat: 'close' };
  if (reponse.status === 410) {
    return { etat: 'lien-mort', cause: causeDuRefus(reponse.status, await lisLaCharge(reponse)) };
  }
  if (reponse.status === 403) return { etat: 'refus' };
  if (!reponse.ok) return { etat: 'indisponible' };

  const lue = await valeur(reponse);
  return lue === null ? { etat: 'indisponible' } : { etat: 'servi', valeur: lue };
};

/**
 * Le NOM d'un expéditeur, cherché dans l'ordre du plus précis au plus pauvre.
 *
 * Un invité n'a pas de compte : `sender.user` est nul et `sender.displayName`
 * porte son pseudo. Un membre a les deux. Rendre une chaîne vide plutôt que
 * `null` peindrait une bulle sans auteur ; le repli est donc NOMMÉ.
 */
const AUTEUR_INCONNU = 'Quelqu’un';

const auteurDe = (message: object): string => {
  const expediteur = objet(champ(message, 'sender'));
  if (expediteur === null) return AUTEUR_INCONNU;

  const compte = objet(champ(expediteur, 'user'));

  return (
    texte(champ(expediteur, 'displayName')) ??
    (compte === null
      ? null
      : texte(champ(compte, 'displayName')) ?? texte(champ(compte, 'username'))) ??
    AUTEUR_INCONNU
  );
};

/**
 * `translations` voyage en TABLEAU sur le fil (`transformTranslationsToArray`,
 * `services/gateway/src/utils/translation-transformer.ts`), et la descente du
 * Prisme attend une CARTE `langue → texte`. Le dépouillement est ici, en un
 * seul site : le refaire dans chaque consommateur est exactement ce qui a
 * produit trois familles de résolveurs divergentes en trois cycles.
 */
export const carteDesTraductions = (valeur: unknown): Readonly<Record<string, string>> => {
  if (!Array.isArray(valeur)) return {};

  return Object.fromEntries(
    valeur.flatMap((entree) => {
      const traduction = objet(entree);
      if (traduction === null) return [];

      const langue = texte(champ(traduction, 'targetLanguage'));
      const contenu = texte(champ(traduction, 'translatedContent'));
      return langue === null || contenu === null ? [] : [[langue, contenu] as const];
    }),
  );
};

/**
 * Un message projeté. `moi` se décide sur le `senderId`, comparé à l'identifiant
 * du PARTICIPANT que la place porte — jamais sur le pseudo, que deux invités
 * peuvent partager (la passerelle les suffixe, mais seulement à l'entrée).
 */
/**
 * L'auteur est-il SANS COMPTE ? La passerelle le DIT — `sender.type` vient de
 * `Participant.type` (`buildMessageListSelect`), et c'est la seule source qui
 * l'affirme. On ne le DÉDUIT pas d'un `user` absent : une projection plus
 * pauvre (un `select` qui ne demande pas la relation) ferait alors passer un
 * membre pour un invité, c'est-à-dire un badge FAUX sur une identité.
 */
const anonymeDe = (message: object): boolean => {
  const expediteur = objet(champ(message, 'sender'));
  return expediteur !== null && texte(champ(expediteur, 'type')) === 'anonymous';
};

export const messageDepuis = (valeur: unknown, participantId: string): MessageServi | null => {
  const message = objet(valeur);
  if (message === null) return null;

  const id = texte(champ(message, 'id'));
  const contenu = champ(message, 'content');
  if (id === null || typeof contenu !== 'string') return null;

  const instantMs = instant(champ(message, 'createdAt'));

  return {
    id,
    auteur: auteurDe(message),
    moi: texte(champ(message, 'senderId')) === participantId,
    anonyme: anonymeDe(message),
    contenu,
    langueOriginale: texte(champ(message, 'originalLanguage')),
    traductions: carteDesTraductions(champ(message, 'translations')),
    instantMs: instantMs ?? 0,
  };
};

export const messagesDepuis = (valeur: unknown, participantId: string): readonly MessageServi[] =>
  Array.isArray(valeur)
    ? valeur.flatMap((entree) => {
        const message = messageDepuis(entree, participantId);
        return message === null ? [] : [message];
      })
    : [];

/** La taille de la première page — celle que le § 6.3 B fait arriver dans le HTML. */
export const PAGE_DU_FIL = 50;

/**
 * LA PREMIÈRE PAGE DU FIL, lue par le SERVEUR au rendu.
 *
 * C'est ce qui rend vraie la première ligne du § 6.3 B — « rend d'abord le
 * cache : jamais de spinner sur un cache non vide » — sans une ligne de
 * JavaScript : le HTML arrive avec les messages dedans. L'îlot ne fait que
 * compléter par le haut.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * `languages=` — CE QU'ON NE DEMANDE PAS NE TRAVERSE PAS LA FRONTIÈRE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La passerelle sert TOUTES les traductions d'un message quand on ne dit rien
 * (`languages` : « absent = all languages. Bandwidth opt-in »). Sur cet
 * écran-ci — le rôle premier, un téléphone en 3G — cela veut dire : pour
 * chacun des 50 messages, l'original PLUS les N langues du produit, dont une
 * seule sera lue. Le prisme du lecteur est connu au moment de l'appel : on
 * demande donc exactement les rangs qu'on est capable de servir, et rien
 * d'autre. Un prisme VIDE n'envoie pas le paramètre — un `languages=` vide
 * n'est pas « aucune langue », c'est une requête malformée.
 */
export const lisLeFil = async ({
  conversationId,
  participantId,
  langues,
  jeton,
  identite,
  base,
  recuperer,
}: AppelDeLaPlace & {
  readonly conversationId: string;
  readonly participantId: string;
  /** Le prisme du lecteur — les seules traductions qui ont un lecteur. */
  readonly langues?: readonly string[];
}): Promise<Verdict<readonly MessageServi[]>> => {
  const requete = new URLSearchParams({
    limit: String(PAGE_DU_FIL),
    ...(langues === undefined || langues.length === 0 ? {} : { languages: langues.join(',') }),
  });

  const reponse = await recupere(
    `${base ?? baseDeLaPasserelle()}${CHEMIN_DU_FIL(conversationId)}?${requete.toString()}`,
    { method: 'GET', headers: enTetesDeLaPlace({ jeton, identite }) },
    recuperer,
  ).catch(() => null);

  return verdictDeLaReponse(reponse, async (servie) => {
    const donnee = await donneeDe(servie);
    if (donnee === null) return null;

    /**
     * Deux formes admises, parce que la passerelle en sert deux selon la route
     * (`{ data: [...] }` et `{ data: { messages: [...] } }`) et qu'un écran qui
     * n'en connaîtrait qu'une rendrait un fil VIDE sur l'autre — un vide qui a
     * l'air d'une conversation neuve.
     */
    const liste = Array.isArray(donnee) ? donnee : champ(donnee, 'messages');
    return messagesDepuis(liste, participantId);
  });
};

/**
 * L'ENVOI. Il rend le message SERVI, pas un booléen : c'est lui qui remplace la
 * bulle optimiste, et son identifiant serveur est ce qui empêche de peindre le
 * même message deux fois (`filAPeindre`).
 */
export const envoieUnMessage = async ({
  conversationId,
  participantId,
  contenu,
  langue,
  jeton,
  identite,
  base,
  recuperer,
}: AppelDeLaPlace & {
  readonly conversationId: string;
  readonly participantId: string;
  readonly contenu: string;
  readonly langue: string | null;
}): Promise<Verdict<MessageServi>> => {
  const reponse = await recupere(
    `${base ?? baseDeLaPasserelle()}${CHEMIN_DU_FIL(conversationId)}`,
    {
      method: 'POST',
      headers: enTetesDeLaPlace({ jeton, identite }),
      body: JSON.stringify({
        content: contenu,
        ...(langue === null ? {} : { originalLanguage: langue }),
      }),
    },
    recuperer,
  ).catch(() => null);

  return verdictDeLaReponse(reponse, async (servie) => {
    const donnee = await donneeDe(servie);
    return donnee === null ? null : messageDepuis(donnee, participantId);
  });
};

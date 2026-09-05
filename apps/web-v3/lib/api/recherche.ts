import { conversation, liensTrouves, type Conversation, type LienDePartage, type Recuperateur } from './compte';
import { genreDeMime, type GenreDePiece } from './formes';
import { baseDeLaPasserelle } from './links';
import { DELAI_DE_REPONSE_MS } from './passerelle';

export type { Recuperateur };

/**
 * CE QUE L'ÉCRAN DE RECHERCHE DEMANDE À LA PASSERELLE — les QUATRE groupes que
 * `cible/search.png` dessine, désormais tous servis (#5174, #5171) :
 *
 *   • Conversations — `GET /api/v1/conversations/search?q=`
 *     (`routes/conversations/search.ts:67`) ;
 *   • Personnes     — `GET /api/v1/directory/people?q=`
 *     (`routes/directory/people.ts:87`) ;
 *   • Médias        — `GET /api/v1/attachments/search?q=`
 *     (`routes/attachments/search.ts:187`, #5174) — CROSS-conversations, à la
 *     différence de `GET /conversations/:id/attachments` (scopée à une seule) ;
 *   • Liens         — `GET /api/v1/links?q=` (`routes/links/user.ts:315`,
 *     #5171) — projetés par `liensTrouves()` (`./compte`), qui réutilise la
 *     MÊME carte que `liensDuLecteur`/`carnetDeLiens`.
 *
 * SUR LES PERSONNES, LA CANONIQUE — JAMAIS `GET /users/search`. L'ancienne
 * existe encore, et son remplaçant documente pourquoi ne plus l'appeler : elle
 * faisait un `contains` NON ancré, insensible à la casse, sur cinq colonnes
 * dont trois n'étaient indexées par rien — chaque frappe balayait la
 * collection entière. `/directory/people` interroge `searchTokens` par une
 * regex ANCRÉE, servie par parcours d'index. Sur une 3G rurale, la différence
 * n'est pas cosmétique.
 *
 * SUR LES MÉDIAS, SEUL `originalName` EST CHERCHÉ — décision prise à
 * l'implémentation de la route (`attachments/search.ts:26-29`), jamais la
 * transcription d'un vocal : élargir la surface de recherche au moment où
 * l'exclusion du contenu protégé doit être la plus stricte est hors périmètre
 * de ce lot.
 *
 * AUCUN TOTAL N'EST SERVI SUR TROIS DES QUATRE ROUTES, DONC AUCUN N'EST
 * AFFICHÉ. `/conversations/search` rend un tableau NU ; `/directory/people` et
 * `/attachments/search` paginent par CURSEUR (`hasMore`, `nextCursor`,
 * `limit`) ; `/links?q=` pagine par OFFSET (`total`, `offset`, `limit`,
 * `hasMore`) mais SEUL `hasMore` est relayé — même règle que les trois autres,
 * pour ne jamais promettre un compte que la page suivante contredirait.
 *
 * UNE PANNE SUR MOINS DE QUATRE ROUTES DÉGRADE, ELLE N'ABAT PLUS L'ÉCRAN
 * ENTIER (correctif 2026-09-05). Passer de deux à quatre routes DOUBLAIT la
 * surface de panne tant qu'une seule en échec faisait tomber les trois autres
 * — un `/attachments/search` capricieux privait alors le lecteur de ses
 * conversations et de ses personnes, qui avaient pourtant répondu. Chaque
 * route est désormais lue INDÉPENDAMMENT : celle qui échoue marque son groupe
 * `Indisponible`, les autres s'affichent normalement. Seules DEUX choses
 * restent globales : un 401 sur N'IMPORTE LAQUELLE (le jeton est partagé — un
 * refus vaut pour les trois autres dans l'instant qui suit) et une panne sur
 * les QUATRE À LA FOIS (la passerelle, ou le réseau qui y mène, est hors
 * service — montrer quatre groupes indisponibles côte à côte n'aiderait
 * personne). LES QUATRE APPELS PARTENT EN PARALLÈLE (`Promise.all`, jamais en
 * cascade) : le coût d'attente est borné par le plus LENT des quatre, pas par
 * leur somme — témoin dans `recherche.test.ts` (« les quatre routes partent en
 * parallèle »).
 *
 * LA PRÉSENCE SE LIT `=== true`, ET C'EST LA SEULE LECTURE QUI REFUSE PAR
 * DÉFAUT. Les deux routes du répertoire masquent DIFFÉREMMENT : `/directory/people`
 * déclare `isOnline` en `nullable: true` (applicateur nullable ⇒ `null`),
 * `/directory/contacts` le déclare non nullable (⇒ `false`). Deux formes pour
 * une même décision ; `!isOnline` les traite pareil par CHANCE, `=== true` par
 * construction. Et l'ORDRE comme la SÉLECTION sont gardés côté serveur
 * (`mayOrderByRawPresence`, `servedOnlineFirst`, `contactLookupScope`) : trier
 * ici sur `isOnline` rétablirait côté client la fuite que le serveur ferme.
 * Aucun média ni aucun lien ne porte de présence : la question ne s'y pose pas.
 */

const DELAI_MS = DELAI_DE_REPONSE_MS;

const CHEMIN_CONVERSATIONS = '/api/v1/conversations/search';
const CHEMIN_PERSONNES = '/api/v1/directory/people';
const CHEMIN_MEDIAS = '/api/v1/attachments/search';

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

const chaine = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur !== '' ? valeur : null;

/**
 * UNE PERSONNE TROUVÉE. La forme est celle que `/directory/people` déclare
 * (`routes/directory/people.ts:105-123`) : six champs, et `presence` n'arrive
 * que sur `?expand=presence`. On ne la demande PAS — l'écran ne dessine aucune
 * pastille, et réclamer une donnée qu'on n'affiche pas la fait voyager pour
 * rien.
 */
export type PersonneTrouvee = {
  readonly id: string;
  readonly nom: string;
  readonly pseudonyme: string;
};

const personne = (brut: Readonly<Record<string, unknown>>): PersonneTrouvee | null => {
  const id = chaine(brut.id);
  const pseudonyme = chaine(brut.username);
  if (id === null || pseudonyme === null) return null;

  return { id, nom: chaine(brut.displayName) ?? pseudonyme, pseudonyme };
};

/**
 * UN MÉDIA TROUVÉ — projection de `crossConversationAttachmentItemSchema`
 * (`attachments/search.ts:57-73`). `genre` vient de `genreDeMime` (`./formes`,
 * le site UNIQUE mime→genre) : une seconde table ferait une jumelle qui
 * diverge au premier genre ajouté.
 *
 * `messageId` EST REQUIS ICI, pas seulement dans le schéma serveur (où il est
 * `nullable`) : sans lui, la rangée ne peut composer aucune adresse de plein
 * écran (`adresseDuPlein` exige un message) — un média orphelin est donc
 * ÉCARTÉ plutôt que de composer une adresse morte (règle 7).
 */
export type MediaTrouve = {
  readonly id: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly nom: string;
  readonly genre: GenreDePiece;
};

const media = (brut: Readonly<Record<string, unknown>>): MediaTrouve | null => {
  const id = chaine(brut.id);
  const messageId = chaine(brut.messageId);
  const conversationId = chaine(brut.conversationId);
  const nom = chaine(brut.originalName);
  if (id === null || messageId === null || conversationId === null || nom === null) return null;

  return {
    id,
    messageId,
    conversationId,
    nom,
    genre: genreDeMime(typeof brut.mimeType === 'string' ? brut.mimeType : null),
  };
};

/**
 * `/attachments/search` sert `data: { attachments: [...] }` — un OBJET, pas un
 * tableau nu (à la différence de `/conversations/search`). Une forme
 * inattendue rend une liste VIDE, jamais une exception : la garde est la même
 * discipline que `lignes()` ci-dessous, sur une enveloppe différente.
 */
const attachmentsDe = (enveloppe: Readonly<Record<string, unknown>>): readonly Readonly<Record<string, unknown>>[] => {
  const donnees = objet(enveloppe.data);
  // `readonly unknown[]` est ANNOTÉ : `Array.isArray` sur un `unknown` ne
  // narrowit qu'en `any[]`, et la lambda de `.map` hériterait d'un `any`
  // implicite — celui que le § « TypeScript strict, jamais `any` » interdit,
  // et qu'aucun `no-explicit-any` n'attrape parce qu'il n'est pas ÉCRIT.
  const brutes: readonly unknown[] = donnees !== null && Array.isArray(donnees.attachments) ? donnees.attachments : [];
  return brutes
    .map((ligne) => objet(ligne))
    .filter((ligne): ligne is Readonly<Record<string, unknown>> => ligne !== null);
};

export type Trouvailles =
  | {
      readonly genre: 'resultats';
      readonly conversations: readonly Conversation[];
      /** Vrai quand CETTE route a échoué — le groupe se dessine « Indisponible », pas vide. */
      readonly conversationsIndisponibles: boolean;
      readonly personnes: readonly PersonneTrouvee[];
      /** Vrai quand la passerelle annonce une page suivante sur les personnes. */
      readonly encoreDesPersonnes: boolean;
      readonly personnesIndisponibles: boolean;
      readonly medias: readonly MediaTrouve[];
      readonly encoreDesMedias: boolean;
      readonly mediasIndisponibles: boolean;
      readonly liens: readonly LienDePartage[];
      readonly encoreDesLiens: boolean;
      readonly liensIndisponibles: boolean;
    }
  | { readonly genre: 'session-expiree' }
  /** Les QUATRE routes ont échoué à la fois — jamais une seule (voir doc-comment ci-dessus). */
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

type Issue = { readonly ok: Readonly<Record<string, unknown>> } | { readonly refus: 'session-expiree' | 'panne' };

const lire = async (
  url: string,
  jeton: string,
  recuperer: Recuperateur | undefined,
): Promise<Issue> => {
  const reponse = await demande(url, jeton, recuperer);
  if (reponse === null) return { refus: 'panne' };
  if (reponse.status === 401) return { refus: 'session-expiree' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success !== true) return { refus: 'panne' };

  return { ok: enveloppe };
};

const lignes = (enveloppe: Readonly<Record<string, unknown>>): readonly Readonly<Record<string, unknown>>[] =>
  (Array.isArray(enveloppe.data) ? enveloppe.data : [])
    .map((ligne) => objet(ligne))
    .filter((ligne): ligne is Readonly<Record<string, unknown>> => ligne !== null);

/**
 * CHERCHER, DANS LES QUATRE GROUPES.
 *
 * UNE REQUÊTE VIDE N'EST PAS UNE RECHERCHE. `/conversations/search` et
 * `/attachments/search` déclarent `q` REQUIS avec `minLength: 1` : les
 * appeler sans rien rendrait un 400, et l'appeler avec des espaces rendrait la
 * collection. L'écran ne demande donc rien tant que le lecteur n'a rien tapé —
 * l'état initial est une invitation à chercher, pas une liste vide qui a coûté
 * quatre aller-retours.
 *
 * UNE PANNE SUR MOINS DE QUATRE ROUTES DÉGRADE PAR GROUPE (voir le
 * doc-comment de tête) : la route en échec rend son groupe `Indisponible`
 * plutôt qu'un vide muet, les autres continuent de répondre. Seule une panne
 * sur les QUATRE À LA FOIS rend `panne` ; un 401 sur N'IMPORTE LAQUELLE
 * renvoie se connecter, quel que soit l'état des trois autres.
 *
 * `liensTrouves` (`./compte`) EST APPELÉE ICI, PAS RÉÉCRITE : c'est la même
 * fonction qui projette `lienDePartage`, réutilisée plutôt que dupliquée.
 */
export const cherche = async ({
  jeton,
  requete,
  limite = 20,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly requete: string;
  readonly limite?: number;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Trouvailles> => {
  const terme = requete.trim();
  if (terme === '') {
    return {
      genre: 'resultats',
      conversations: [],
      conversationsIndisponibles: false,
      personnes: [],
      encoreDesPersonnes: false,
      personnesIndisponibles: false,
      medias: [],
      encoreDesMedias: false,
      mediasIndisponibles: false,
      liens: [],
      encoreDesLiens: false,
      liensIndisponibles: false,
    };
  }

  const racine = base ?? baseDeLaPasserelle();
  const q = encodeURIComponent(terme);

  const [fils, gens, pieces, resultatsDesLiens] = await Promise.all([
    lire(`${racine}${CHEMIN_CONVERSATIONS}?q=${q}`, jeton, recuperer),
    lire(`${racine}${CHEMIN_PERSONNES}?q=${q}&limit=${limite}`, jeton, recuperer),
    lire(`${racine}${CHEMIN_MEDIAS}?q=${q}&limit=${limite}`, jeton, recuperer),
    liensTrouves({ jeton, requete: terme, limite, base: racine, recuperer }),
  ]);

  // UNE SESSION EXPIRÉE EST UN ÉVÉNEMENT GLOBAL, sur N'IMPORTE LAQUELLE des
  // quatre : le jeton est partagé, un refus vaut pour les trois autres dans
  // l'instant qui suit.
  if ('refus' in fils && fils.refus === 'session-expiree') return { genre: 'session-expiree' };
  if ('refus' in gens && gens.refus === 'session-expiree') return { genre: 'session-expiree' };
  if ('refus' in pieces && pieces.refus === 'session-expiree') return { genre: 'session-expiree' };
  if (resultatsDesLiens.genre === 'session-expiree') return { genre: 'session-expiree' };

  const filsIndisponible = 'refus' in fils;
  const gensIndisponible = 'refus' in gens;
  const piecesIndisponible = 'refus' in pieces;
  const liensIndisponible = resultatsDesLiens.genre === 'panne';

  // LES QUATRE À LA FOIS : la passerelle (ou le réseau qui y mène) est hors
  // service — montrer quatre groupes « Indisponible » n'aiderait personne de
  // plus qu'une page de panne, et évite d'en fabriquer une par groupe pour un
  // seul et même incident.
  if (filsIndisponible && gensIndisponible && piecesIndisponible && liensIndisponible) {
    return { genre: 'panne' };
  }

  return {
    genre: 'resultats',
    conversations: 'refus' in fils
      ? []
      : lignes(fils.ok)
          .map(conversation)
          .filter((c): c is Conversation => c !== null),
    conversationsIndisponibles: filsIndisponible,
    personnes: 'refus' in gens
      ? []
      : lignes(gens.ok)
          .map(personne)
          .filter((p): p is PersonneTrouvee => p !== null),
    // `hasMore` est SERVI (`people.ts:130`, déclaré après avoir été produit et
    // retiré par le sérialiseur). Il dit « il en reste », jamais combien — et
    // c'est tout ce que l'écran peut honnêtement annoncer.
    encoreDesPersonnes: 'refus' in gens ? false : objet(gens.ok.pagination)?.hasMore === true,
    personnesIndisponibles: gensIndisponible,
    medias: 'refus' in pieces
      ? []
      : attachmentsDe(pieces.ok)
          .map(media)
          .filter((m): m is MediaTrouve => m !== null),
    encoreDesMedias: 'refus' in pieces ? false : objet(pieces.ok.pagination)?.hasMore === true,
    mediasIndisponibles: piecesIndisponible,
    liens: resultatsDesLiens.genre === 'liens' ? resultatsDesLiens.liens : [],
    encoreDesLiens: resultatsDesLiens.genre === 'liens' ? resultatsDesLiens.encore : false,
    liensIndisponibles: liensIndisponible,
  };
};

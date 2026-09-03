import { conversation, type Conversation, type Recuperateur } from './compte';
import { baseDeLaPasserelle } from './links';
import { DELAI_DE_REPONSE_MS } from './passerelle';

export type { Recuperateur };

/**
 * CE QUE L'ÉCRAN DE RECHERCHE DEMANDE À LA PASSERELLE — et ce qu'il NE demande
 * pas, faute de route.
 *
 * DEUX GROUPES, PAS QUATRE. `cible/search.png` en dessine quatre :
 * Conversations, Personnes, Médias, Liens. Relevé sur le serveur ASSEMBLÉ
 * (`services/gateway/route-manifest.json`), deux seulement existent :
 *
 *   • Conversations — `GET /api/v1/conversations/search?q=` ;
 *   • Personnes     — `GET /api/v1/directory/people?q=`.
 *
 * Il n'existe AUCUNE recherche globale de médias (seulement
 * `GET /conversations/:conversationId/attachments`, scopée à UNE conversation)
 * ni de liens (`GET /links` n'accepte pas de `q` — sa querystring est
 * `conversationId`, `mine`, `cursor`, `offset`, `limit`, `expand`, `include`,
 * `fields`). Dessiner ces deux groupes ferait des rangées qui n'ouvrent rien :
 * la règle 7 dit qu'un contrôle sans effet ne se rend pas. Ils reviendront avec
 * les routes qui les servent, pas avant.
 *
 * SUR LES PERSONNES, LA CANONIQUE — JAMAIS `GET /users/search`. L'ancienne
 * existe encore, et son remplaçant documente pourquoi ne plus l'appeler : elle
 * faisait un `contains` NON ancré, insensible à la casse, sur cinq colonnes
 * dont trois n'étaient indexées par rien — chaque frappe balayait la
 * collection entière. `/directory/people` interroge `searchTokens` par une
 * regex ANCRÉE, servie par parcours d'index. Sur une 3G rurale, la différence
 * n'est pas cosmétique.
 *
 * AUCUN TOTAL N'EST SERVI, DONC AUCUN N'EST AFFICHÉ. `/conversations/search`
 * rend un tableau NU — pas de `pagination`, pas de `total` ; `/directory/people`
 * pagine par CURSEUR (`hasMore`, `nextCursor`, `limit`) et n'en porte pas
 * davantage — un total ne se déduit pas d'un curseur. Écrire « 24 résultats »
 * depuis `data.length` afficherait le nombre de lignes RAPATRIÉES, plafonné par
 * la limite, sous un libellé qui promet un total : la faute exacte que
 * `currentUses` vient d'illustrer sur `/links`.
 *
 * LA PRÉSENCE SE LIT `=== true`, ET C'EST LA SEULE LECTURE QUI REFUSE PAR
 * DÉFAUT. Les deux routes du répertoire masquent DIFFÉREMMENT : `/directory/people`
 * déclare `isOnline` en `nullable: true` (applicateur nullable ⇒ `null`),
 * `/directory/contacts` le déclare non nullable (⇒ `false`). Deux formes pour
 * une même décision ; `!isOnline` les traite pareil par CHANCE, `=== true` par
 * construction. Et l'ORDRE comme la SÉLECTION sont gardés côté serveur
 * (`mayOrderByRawPresence`, `servedOnlineFirst`, `contactLookupScope`) : trier
 * ici sur `isOnline` rétablirait côté client la fuite que le serveur ferme.
 */

const DELAI_MS = DELAI_DE_REPONSE_MS;

const CHEMIN_CONVERSATIONS = '/api/v1/conversations/search';
const CHEMIN_PERSONNES = '/api/v1/directory/people';

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

export type Trouvailles =
  | {
      readonly genre: 'resultats';
      readonly conversations: readonly Conversation[];
      readonly personnes: readonly PersonneTrouvee[];
      /** Vrai quand la passerelle annonce une page suivante sur les personnes. */
      readonly encoreDesPersonnes: boolean;
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
 * CHERCHER, DANS LES DEUX GROUPES QUI EXISTENT.
 *
 * UNE REQUÊTE VIDE N'EST PAS UNE RECHERCHE. `/conversations/search` déclare `q`
 * REQUIS avec `minLength: 1` : l'appeler sans rien rendrait un 400, et
 * l'appeler avec des espaces rendrait la collection. L'écran ne demande donc
 * rien tant que le lecteur n'a rien tapé — l'état initial est une invitation à
 * chercher, pas une liste vide qui a coûté deux aller-retours.
 *
 * UNE PANNE PARTIELLE EST UNE PANNE, même règle que le carnet : servir la
 * moitié qui a répondu ferait croire à un groupe vide, ce qui est un mensonge
 * plus coûteux qu'une page de panne. Un 401 sur l'une ou l'autre renvoie se
 * connecter.
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
    return { genre: 'resultats', conversations: [], personnes: [], encoreDesPersonnes: false };
  }

  const racine = base ?? baseDeLaPasserelle();
  const q = encodeURIComponent(terme);

  const [fils, gens] = await Promise.all([
    lire(`${racine}${CHEMIN_CONVERSATIONS}?q=${q}`, jeton, recuperer),
    lire(`${racine}${CHEMIN_PERSONNES}?q=${q}&limit=${limite}`, jeton, recuperer),
  ]);

  if ('refus' in fils) return { genre: fils.refus };
  if ('refus' in gens) return { genre: gens.refus };

  return {
    genre: 'resultats',
    conversations: lignes(fils.ok)
      .map(conversation)
      .filter((c): c is Conversation => c !== null),
    personnes: lignes(gens.ok)
      .map(personne)
      .filter((p): p is PersonneTrouvee => p !== null),
    // `hasMore` est SERVI (`people.ts:130`, déclaré après avoir été produit et
    // retiré par le sérialiseur). Il dit « il en reste », jamais combien — et
    // c'est tout ce que l'écran peut honnêtement annoncer.
    encoreDesPersonnes: objet(gens.ok.pagination)?.hasMore === true,
  };
};

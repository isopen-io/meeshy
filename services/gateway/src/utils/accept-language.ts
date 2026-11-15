/**
 * L'étiquette de langue la mieux notée d'un en-tête `Accept-Language`
 * (RFC 9110 § 12.5.4) — **le rang 4 du Prisme quand le client n'envoie pas
 * `X-Device-Locale`** (#5216).
 *
 * ## Pourquoi un parseur, et pas `split(',')[0]`
 *
 * `Accept-Language` est une liste PONDÉRÉE, et son ordre d'écriture n'est pas
 * son ordre de préférence : `en;q=0.5, fr` demande le français d'abord. Le
 * dépôt portait déjà la forme naïve — `headers['accept-language'].split(',')[0]`
 * (`routes/tracking-links/tracking.ts`) — qui rend `en` sur cet exemple, soit la
 * langue explicitement DÉPRIORISÉE par le navigateur.
 *
 * Sur une inscription, la conséquence est durable : le rang 1 du compte est
 * écrit une fois, à la création. Se tromper d'étiquette ici, c'est graver la
 * mauvaise langue pour toute la vie du compte.
 *
 * ## Ce que ce module rend, et ce qu'il ne fait pas
 *
 * Il rend l'étiquette BRUTE la mieux notée (`fr-CA`, `zh-Hant`), pas un code
 * normalisé : la normalisation est le travail de `normalizeLanguageCode`
 * (@meeshy/shared), site unique de cette règle, et la mêler ici en ferait une
 * jumelle. `*` (le joker) n'exprime aucune langue et n'est jamais rendu.
 *
 * Les points d'accord de la RFC, appliqués tels quels :
 * - `q` absent ⇒ `q=1` (la valeur par défaut) ;
 * - `q=0` ⇒ étiquette explicitement REFUSÉE, jamais rendue ;
 * - à poids ÉGAL, l'ordre d'écriture départage — c'est ce que fait tout
 *   négociateur de contenu, et c'est la seule règle qui rende `fr` sur
 *   `fr, en` ;
 * - un `q` illisible (`q=abc`, `q=2`) disqualifie l'étiquette plutôt que de la
 *   promouvoir : une valeur qu'on ne sait pas lire ne doit pas gagner.
 *
 * @module utils/accept-language
 */

/** Poids par défaut d'une étiquette sans paramètre `q` (RFC 9110 § 12.4.2). */
const POIDS_PAR_DEFAUT = 1;

/** Une étiquette BCP-47 plausible — sous-tags alphanumériques séparés par `-`. */
const ETIQUETTE = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;

type Candidate = { readonly tag: string; readonly poids: number; readonly rang: number };

/**
 * Le poids d'un paramètre `q`, ou `null` s'il est illisible.
 *
 * La RFC borne `q` à `[0, 1]` avec au plus trois décimales. Une valeur hors
 * borne est un en-tête malformé : on la refuse, ce qui écarte l'étiquette au
 * lieu de la faire gagner avec un poids inventé.
 */
function poidsDeQ(valeur: string): number | null {
  if (!/^(?:0(?:\.\d{1,3})?|1(?:\.0{1,3})?)$/.test(valeur)) return null;
  return Number(valeur);
}

/** Une entrée de la liste (`fr-CA;q=0.9`) → candidat, ou `null` si inutilisable. */
function candidat(entree: string, rang: number): Candidate | null {
  const [brut, ...parametres] = entree.split(';');
  const tag = brut?.trim() ?? '';

  if (tag === '' || tag === '*' || !ETIQUETTE.test(tag)) return null;

  const parametreQ = parametres
    .map((p) => p.trim())
    .find((p) => p.toLowerCase().startsWith('q='));

  if (parametreQ === undefined) return { tag, poids: POIDS_PAR_DEFAUT, rang };

  const poids = poidsDeQ(parametreQ.slice(2).trim());
  if (poids === null || poids === 0) return null;

  return { tag, poids, rang };
}

/**
 * L'étiquette la mieux notée d'un en-tête `Accept-Language`, ou `undefined`.
 *
 * Accepte la valeur telle que Node la remet : une chaîne, un tableau (en-tête
 * répété — les valeurs se concatènent, comme le ferait un serveur conforme), ou
 * `undefined`.
 */
export function preferredAcceptLanguage(
  header: string | readonly string[] | undefined | null,
): string | undefined {
  if (header === undefined || header === null) return undefined;

  const brut = Array.isArray(header) ? header.join(',') : String(header);

  const candidats = brut
    .split(',')
    .map((entree, rang) => candidat(entree, rang))
    .filter((c): c is Candidate => c !== null);

  if (candidats.length === 0) return undefined;

  // Le tri est STABLE en ES2019+, mais le rang est comparé explicitement : une
  // égalité de poids doit se départager par l'ordre d'écriture, et le dire.
  const [meilleur] = [...candidats].sort((a, b) => b.poids - a.poids || a.rang - b.rang);

  return meilleur?.tag;
}

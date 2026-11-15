/**
 * Sans dépendance : le journal (`logger-enhanced.ts`) l'importe, et le module
 * de signature importe le journal (#9600).
 */
const SIGNED_ADDRESS_TAIL = /\/attachments\/signed\/[^?#]*(?:[?#].*)?$/;

/**
 * Le TEXTE CHERCHÉ (#10506, revue de conformité O3) : la valeur de `q`,
 * `query`, `search` ou `term` dans une chaîne de requête devient `[redacted]`.
 * Une recherche porte souvent le nom d'une personne — l'adresse d'une requête
 * lente ou refusée ne doit jamais l'écrire en clair dans un journal.
 */
const SEARCH_TEXT_PARAM = /([?&](?:q|query|search|term)=)[^&#]*/g;

/**
 * L'adresse telle qu'un JOURNAL peut l'écrire : tout ce qui suit
 * `/attachments/signed/` — le jeton, la clé de stockage (elle porte le `User.id`
 * de l'auteur) et une éventuelle chaîne de requête — devient `[redacted]`. Le
 * jeton suffit, pendant sa vie, à lire les octets à la place de son lecteur
 * (audit #9600, L1-B). Le texte d'une recherche est tu de même (#10506). Toute
 * autre adresse traverse intacte.
 */
export function redactReaderFileUrl(url: string): string {
  return url
    .replace(SIGNED_ADDRESS_TAIL, '/attachments/signed/[redacted]')
    .replace(SEARCH_TEXT_PARAM, '$1[redacted]');
}

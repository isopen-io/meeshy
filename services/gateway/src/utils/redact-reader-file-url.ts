/**
 * Sans dépendance : le journal (`logger-enhanced.ts`) l'importe, et le module
 * de signature importe le journal (#9600).
 */
const SIGNED_ADDRESS_TAIL = /\/attachments\/signed\/[^?#]*(?:[?#].*)?$/;

/**
 * L'adresse telle qu'un JOURNAL peut l'écrire : tout ce qui suit
 * `/attachments/signed/` — le jeton, la clé de stockage (elle porte le `User.id`
 * de l'auteur) et une éventuelle chaîne de requête — devient `[redacted]`. Le
 * jeton suffit, pendant sa vie, à lire les octets à la place de son lecteur
 * (audit #9600, L1-B). Toute autre adresse traverse intacte.
 */
export function redactReaderFileUrl(url: string): string {
  return url.replace(SIGNED_ADDRESS_TAIL, '/attachments/signed/[redacted]');
}

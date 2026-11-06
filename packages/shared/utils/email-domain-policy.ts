/**
 * SEULES DE VRAIES ADRESSES OUVRENT UN COMPTE (#16491) — la source de vérité
 * UNIQUE de la taxonomie des domaines d'e-mail que Meeshy n'accepte pas.
 *
 * - `reserved` : les domaines que les RFC 2606, 6761 et 6762 réservent à la
 *   documentation, aux tests et au réseau local (`example.com/.net/.org`, les
 *   TLD `.example`, `.test`, `.invalid`, `.localhost`, `.local`), sous-domaines
 *   compris. Aucune boîte n'y est joignable.
 * - `disposable` : les messageries JETABLES les plus répandues. Une liste
 *   curée, pas exhaustive : elle ferme la porte au geste banal, pas à un
 *   adversaire qui achète un domaine.
 * - `deliverable` : tout le reste.
 *
 * La comparaison porte sur le domaine normalisé (casse ignorée, espaces et
 * point final retirés ; un domaine internationalisé est comparé tel quel). Une
 * adresse sans domaine n'est jamais déclarée distribuable.
 *
 * Fonctions PURES : la décision d'appliquer la règle (et son échappatoire
 * d'environnement) appartient à la passerelle.
 */

export type EmailDomainClass = 'reserved' | 'disposable' | 'deliverable';

export const RESERVED_EMAIL_DOMAINS: readonly string[] = ['example.com', 'example.net', 'example.org'];

export const RESERVED_EMAIL_TLDS: readonly string[] = ['example', 'test', 'invalid', 'localhost', 'local'];

export const DISPOSABLE_EMAIL_DOMAINS: readonly string[] = [
  'mailinator.com',
  'mailinator.net',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'jetable.org',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamail.biz',
  'guerrillamail.de',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'pokemail.net',
  'spam4.me',
  '10minutemail.com',
  '10minutemail.net',
  'temp-mail.org',
  'temp-mail.io',
  'tempmail.com',
  'tempmail.net',
  'tempmailo.com',
  'tempail.com',
  'trashmail.com',
  'trashmail.de',
  'trashmail.net',
  'maildrop.cc',
  'getnada.com',
  'nada.email',
  'dispostable.com',
  'throwawaymail.com',
  'fakeinbox.com',
  'mailnesia.com',
  'emailondeck.com',
  'mohmal.com',
  'moakt.com',
  'tempr.email',
  'discard.email',
  'spamgourmet.com',
  'mintemail.com',
  'mytemp.email',
  'burnermail.io',
  '33mail.com',
  'mailcatch.com',
  'getairmail.com',
  'dropmail.me',
  'emailfake.com',
  '1secmail.com',
];

const RESERVED_DOMAINS = new Set(RESERVED_EMAIL_DOMAINS);
const RESERVED_TLDS = new Set(RESERVED_EMAIL_TLDS);
const DISPOSABLE_DOMAINS = new Set(DISPOSABLE_EMAIL_DOMAINS);

/** Le domaine normalisé d'une adresse, ou `''` quand elle n'en a pas. */
export function emailDomainOf(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 0) return '';
  return trimmed.slice(at + 1).replace(/\.+$/, '');
}

/** Le domaine et chacun de ses suffixes : `a.b.c` → `a.b.c`, `b.c`, `c`. */
function suffixesOf(domain: string): readonly string[] {
  const labels = domain.split('.');
  return labels.map((_, index) => labels.slice(index).join('.'));
}

export function classifyEmailDomain(email: string): EmailDomainClass {
  const domain = emailDomainOf(email);
  if (domain === '') return 'reserved';

  const suffixes = suffixesOf(domain);
  const tld = suffixes[suffixes.length - 1] ?? '';
  if (RESERVED_TLDS.has(tld) || suffixes.some((suffix) => RESERVED_DOMAINS.has(suffix))) return 'reserved';
  if (suffixes.some((suffix) => DISPOSABLE_DOMAINS.has(suffix))) return 'disposable';
  return 'deliverable';
}

export function isEmailDomainAllowed(email: string): boolean {
  return classifyEmailDomain(email) === 'deliverable';
}

/**
 * Correspondance d'une IPv4 à une plage d'ALLOW-LIST — la loi, écrite une fois et
 * gardée par des témoins.
 *
 * Ce prédicat garde l'accès anonyme aux liens de partage : quand un lien porte
 * `allowedIpRanges`, un visiteur n'entre que si son IP tombe dans l'une des
 * plages (`routes/anonymous.ts`). C'est une ALLOW-LIST — le sens dangereux de
 * l'erreur est donc la PERMISSIVITÉ (admettre une IP hors plage), jamais la
 * sévérité.
 *
 * L'implémentation précédente, inline dans `anonymous.ts`, était sur-permissive
 * de trois façons distinctes, toutes du côté dangereux :
 *
 * 1. **CIDR sans frontière d'octet.** `ip.startsWith(net.slice(0, prefix/8))` sur
 *    `192.168.1.0/24` comparait le PRÉFIXE de chaîne `"192.168.1"`, donc
 *    `"192.168.10.5".startsWith("192.168.1")` était `true` — un `/24` admettait
 *    aussi `192.168.1x.x` et `192.168.1xx.x`, ~10× le bloc visé.
 * 2. **Préfixes non alignés sur l'octet SILENCIEUSEMENT élargis.** `/25`, `/20`,
 *    `/12` étaient tronqués par `Math.floor(prefix / 8)` au `/8` inférieur : un
 *    `/25` (128 hôtes) était appliqué comme un `/24` (256) ou plus large.
 * 3. **Plage `a-b` comparée LEXICOGRAPHIQUEMENT.** `"192.168.1.9" <= "192.168.1.10"`
 *    est `false` (`'9' > '1'`), donc `192.168.1.1-192.168.1.100` REJETAIT
 *    `.9`, `.19`, `.90`… — l'erreur miroir (fail-closed, refus d'IP légitimes).
 *
 * La correction compare des ENTIERS uint32, jamais des chaînes. Toute entrée
 * malformée (octet > 255, préfixe hors [0,32], IPv6 non mappée, `x-forwarded-for`
 * multi-valeur) rend `false` : sur une allow-list, l'échec de parsing REFUSE —
 * fail-closed, le bon défaut pour un contrôle d'accès.
 */

const IPV4_DOTTED = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Convertit une IPv4 pointée en entier uint32, ou `null` si la forme est invalide.
 * Tolère le préfixe IPv4-mappé-en-IPv6 (`::ffff:192.168.1.1`) que Node place
 * parfois dans `request.ip` derrière un proxy — sans lui, un visiteur légitime
 * serait refusé.
 */
export function parseIpv4(ip: string): number | null {
  const normalized = ip.trim().replace(/^::ffff:/i, '');
  const match = IPV4_DOTTED.exec(normalized);
  if (!match) return null;

  let result = 0;
  for (let i = 1; i <= 4; i += 1) {
    const octet = Number(match[i]);
    if (octet > 255) return null;
    result = result * 256 + octet;
  }
  return result >>> 0;
}

function matchCidr(ipInt: number, range: string): boolean {
  const slash = range.indexOf('/');
  const netInt = parseIpv4(range.slice(0, slash));
  if (netInt === null) return false;

  const prefix = Number(range.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  if (prefix === 0) return true;

  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return ((ipInt & mask) >>> 0) === ((netInt & mask) >>> 0);
}

function matchDashRange(ipInt: number, range: string): boolean {
  const dash = range.indexOf('-');
  const startInt = parseIpv4(range.slice(0, dash));
  const endInt = parseIpv4(range.slice(dash + 1));
  if (startInt === null || endInt === null) return false;

  const low = Math.min(startInt, endInt);
  const high = Math.max(startInt, endInt);
  return ipInt >= low && ipInt <= high;
}

/**
 * `true` si `ip` (IPv4) appartient à `range`. Trois formes reconnues :
 * CIDR (`192.168.1.0/24`), plage inclusive (`192.168.1.1-192.168.1.100`), ou IP
 * exacte (`192.168.1.5`). Toute entrée malformée rend `false` (fail-closed).
 */
export function isIpInRange(ip: string, range: string): boolean {
  const ipInt = parseIpv4(ip);
  if (ipInt === null) return false;

  if (range.includes('/')) return matchCidr(ipInt, range);
  if (range.includes('-')) return matchDashRange(ipInt, range);

  const exactInt = parseIpv4(range);
  if (exactInt === null) return false;
  return ipInt === exactInt;
}

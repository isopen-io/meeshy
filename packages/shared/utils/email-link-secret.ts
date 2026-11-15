/**
 * UN LIEN À JETON D'E-MAIL N'ENTRE QUE PAR L'E-MAIL QUI LE PORTE (#10870, #10871).
 *
 * Connexion par lien magique, vérification d'adresse, réinitialisation,
 * révocation des sessions, suppression de compte, changement d'adresse : ces
 * liens portent le jeton d'UN compte. Présentés au bout d'un lien suivi
 * `/l/<jeton>` qu'un autre utilisateur a créé, ou par `meeshy://`, ils
 * connecteraient le lecteur au compte du créateur (fixation de session).
 *
 * Règle UNIQUE : le web la lit au retour d'un lien suivi et d'un lien profond
 * (`apps/web/src/lib/links/`), la passerelle la lit à la création, à
 * l'édition et au service d'un lien suivi (`TrackingLinkService`). Elle se lit
 * sur une forme NORMALISÉE — casse, barres doublées, `\`, encodage (simple ou
 * multiple, séquences invalides tolérées), caractères invisibles, paramètres
 * `;`, espaces autour d'un segment (l'app iOS les retire avant de comparer),
 * segments `.` et `..`, barre finale — et chaque adresse vaut pour tout ce qui
 * est SOUS elle (`/auth/verify-email/x` compris). Une adresse se lit comme la
 * lisent WHATWG ET RFC 3986 (Foundation, `Uri` Android) : il suffit qu'UNE
 * lecture y voie un secret. Et la passerelle ne sert que la sérialisation
 * WHATWG de ce qu'elle a jugé (`servedTrackingTarget`).
 */

/** Les alias que la passerelle écrit dans les e-mails, vers leur adresse canonique. */
export const EMAIL_LINK_ALIASES: Readonly<Record<string, string>> = {
  '/auth/email-link/magic-link': '/auth/magic-link',
  '/auth/email-link/verify-email': '/auth/verify-email',
  '/auth/email-link/reset-password': '/reset-password',
};

/** Les adresses canoniques des liens à jeton d'e-mail. */
export const EMAIL_LINK_PATHS: ReadonlySet<string> = new Set([
  '/auth/verify-email',
  '/auth/magic-link',
  '/auth/magic-link/validate',
  '/auth/revoke-sessions',
  '/reset-password',
  '/account/deletion',
  '/settings/verify-email-change',
]);

const MAX_DECODE_ROUNDS = 4;

const decodeRound = (path: string): string =>
  path.replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });

const decodePath = (path: string, round = 0): string => {
  const decoded = decodeRound(path);
  return decoded === path || round >= MAX_DECODE_ROUNDS ? decoded : decodePath(decoded, round + 1);
};

const DEFAULT_IGNORABLE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g;

const normalizeSegment = (segment: string): string =>
  (segment.replace(DEFAULT_IGNORABLE, '').split(/[;?#]/)[0] ?? '').replace(/^[\s\u0085]+|[\s\u0085]+$/g, '');

const withoutDotSegments = (path: string): string =>
  '/' +
  path
    .split('/')
    .map(normalizeSegment)
    .filter((segment) => segment !== '' && segment !== '.')
    .reduce<readonly string[]>((kept, segment) => (segment === '..' ? kept.slice(0, -1) : [...kept, segment]), [])
    .join('/');

const normalizePath = (pathname: string): string =>
  withoutDotSegments(decodePath(pathname).toLowerCase().replace(/\\/g, '/'));

const SECRET_PREFIXES: readonly string[] = [...EMAIL_LINK_PATHS, '/auth/email-link', '/auth/reset-password'];

const isUnder = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

/**
 * Le chemin est-il celui d'un lien à JETON d'e-mail ? Lu sur sa forme
 * normalisée : `/AUTH//Magic-Link/`, `/auth%2Fmagic-link`, `/x/../auth/magic-link`
 * et l'alias `/auth/email-link/…` répondent tous oui.
 */
export function carriesEmailLinkSecret(pathname: string): boolean {
  const path = normalizePath(pathname);
  const canonical = EMAIL_LINK_ALIASES[path] ?? path;
  return SECRET_PREFIXES.some((prefix) => isUnder(canonical, prefix));
}

/** Le décodage itéré des chemins, pour `email-link-url.ts` (même lecture, une seule définition). */
export const decodeEmailLinkPath = (path: string): string => decodePath(path);

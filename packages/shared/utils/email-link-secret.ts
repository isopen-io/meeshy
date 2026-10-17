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

const hashRoutePath = (hash: string): string | null => {
  const route = hash.replace(/^#/, '').split('?')[0] ?? '';
  return route.startsWith('/') ? route : null;
};

/**
 * La lecture RFC 3986 d'une adresse BRUTE — celle de Foundation (iOS) et de
 * l'`Uri` Android : l'autorité s'arrête au premier `/`, `?` ou `#`, jamais à
 * `\`. `https://evil\@meeshy.me/auth/magic-link` y a pour chemin
 * `/auth/magic-link` quand WHATWG y lit `/@meeshy.me/auth/magic-link`.
 */
const rfc3986Readings = (raw: string): readonly string[] => {
  const rest = /^[a-z][a-z0-9+.-]*:(.*)$/is.exec(raw.trim())?.[1];
  if (rest === undefined) return [];
  const afterAuthority = rest.startsWith('//') ? rest.slice(2).replace(/^[^/?#]*/, '') : rest;
  const path = afterAuthority.split(/[?#]/)[0] ?? '';
  const fragment = afterAuthority.includes('#') ? afterAuthority.slice(afterAuthority.indexOf('#')) : '';
  const hashPath = hashRoutePath(fragment);
  return [path, ...(hashPath === null ? [] : [hashPath])];
};

const whatwgReadings = (url: URL): readonly string[] => {
  const hashPath = hashRoutePath(url.hash);
  return [url.pathname, ...(hashPath === null ? [] : [hashPath])];
};

const parseUrl = (raw: string): URL | null => {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

const MAX_NESTING = 3;

/**
 * Les valeurs de paramètres (requête et fragment) d'une adresse : `/login?next=…`
 * et `…/validate?returnUrl=…` mènent le navigateur à une AUTRE page de Meeshy.
 */
const parameterValues = (url: URL): readonly string[] => {
  const fragment = url.hash.replace(/^#/, '');
  const fragmentQuery = fragment.includes('?') ? fragment.slice(fragment.indexOf('?') + 1) : fragment;
  return [...url.searchParams.values(), ...new URLSearchParams(fragmentQuery).values()];
};

const carriesAt = (raw: string, depth: number): boolean => {
  const url = parseUrl(raw);
  if (url === null) return true;
  const direct = [...whatwgReadings(url), ...rfc3986Readings(raw)].some(carriesEmailLinkSecret);
  return direct || (depth < MAX_NESTING && parameterValues(url).some((value) => nestedCarries(value, depth + 1)));
};

const nestedCarries = (value: string, depth: number): boolean => {
  const decoded = decodePath(value).trim();
  if (decoded.startsWith('/') || decoded.startsWith('\\')) return carriesEmailLinkSecret(decoded);
  return /^[a-z][a-z0-9+.-]*:/i.test(decoded) && parseUrl(decoded) !== null && carriesAt(decoded, depth);
};

/**
 * La CIBLE d'un lien suivi porte-t-elle un lien à jeton d'e-mail ? FERMÉE :
 * oui dès qu'UNE lecture y voit un chemin à secret — WHATWG (navigateurs,
 * Node, redirection de la passerelle), RFC 3986 sur l'adresse brute
 * (Foundation, `Uri` Android) —, le fragment-route compris, quel que soit
 * l'hôte ; et oui dès qu'un PARAMÈTRE (`next`, `returnUrl`, …) renvoie vers un
 * tel chemin, sur trois niveaux. Une adresse illisible répond OUI.
 */
export function urlCarriesEmailLinkSecret(raw: string): boolean {
  return carriesAt(raw, 0);
}

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/**
 * L'adresse qu'un lien suivi SERT : la sérialisation WHATWG de sa cible, jamais
 * l'adresse brute — la forme jugée est la forme servie, et une sérialisation
 * WHATWG se relit à l'identique par chaque analyseur. `null` ⇒ rien à servir :
 * adresse illisible, autre chose que http(s), ou porteuse d'un secret d'e-mail.
 */
export function servedTrackingTarget(raw: string): string | null {
  const url = parseUrl(raw);
  if (url === null || !WEB_PROTOCOLS.has(url.protocol) || urlCarriesEmailLinkSecret(raw)) return null;
  return urlCarriesEmailLinkSecret(url.href) ? null : url.href;
}

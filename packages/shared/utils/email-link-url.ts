/**
 * LES ADRESSES COMPLÈTES qui portent un lien à jeton d'e-mail (#10870, #10871) — lues comme WHATWG, Foundation
 * et Android les lisent, liens imbriqués compris, et la cible qu'un lien suivi peut SERVIR.
 *
 * Séparé de `email-link-secret.ts` : ce dernier est lu AU DÉMARRAGE du web (`email-link-boot`), ces lectures-ci
 * ne servent qu'à la passerelle et à la route `/l/:jeton`. Dans un même module, le découpage du web les rangeait
 * dans la première peinture (module partagé par l'entrée et une route paresseuse) : 91,19 Ko pour 91.
 */
import { carriesEmailLinkSecret, decodeEmailLinkPath as decodePath } from './email-link-secret.js';

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

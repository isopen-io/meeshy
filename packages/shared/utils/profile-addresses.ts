/**
 * LES ADRESSES PERSONNELLES d'une fiche (#18863, chantier #18857).
 *
 * Une adresse est une DÉCLARATION de son propriétaire : un titre, une URL de site, un
 * glyphe, et le cercle à partir duquel elle se lit. Comme la ville (`profile-city.ts`),
 * un cercle illisible FERME — jamais `PUBLIC` par défaut — et le propriétaire lit tout
 * ce qu'il affiche. Le niveau du lecteur n'est pas calculé ici : il vient de la loi
 * d'accès des cercles ; cette fonction ne compare que le plancher choisi.
 *
 * L'URL est un lien SORTANT que d'autres personnes vont ouvrir : seul `http(s)` passe, sans
 * identifiants, vers un nom de domaine public (aucune adresse IP, aucun nom interne).
 * C'est la même règle côté écriture (passerelle) et pour les clients qui prévalident.
 */
import { RELATION_LEVELS, isRelationLevel, relationLevelIfAtLeast, type RelationLevel } from '../types/relation.js';

export const ADDRESS_TITLE_MAX_LENGTH = 24;
export const ADDRESS_URL_MAX_LENGTH = 2048;
export const ADDRESS_MAX_COUNT = 12;

export const ADDRESS_GLYPHS = ['site', 'music', 'photos', 'videos', 'shop', 'contact', 'agenda', 'favorite'] as const;
export type AddressGlyph = (typeof ADDRESS_GLYPHS)[number];
export const DEFAULT_ADDRESS_GLYPH: AddressGlyph = 'site';

export const isAddressGlyph = (value: unknown): value is AddressGlyph =>
  typeof value === 'string' && (ADDRESS_GLYPHS as readonly string[]).includes(value);

/** Les cercles qu'une adresse peut choisir : toute l'échelle accordable (Atome est réservé). */
export const isAddressCircle = (value: unknown): value is RelationLevel => isRelationLevel(value);

const CONTROL_OR_MARKUP = /[<>\u0000-\u001f\u007f]/;

/** Rogne ; vide, trop long ou balisé = refus (`null`). */
export const normalizeAddressTitle = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0 || CONTROL_OR_MARKUP.test(trimmed)) return null;
  return [...trimmed].length > ADDRESS_TITLE_MAX_LENGTH ? null : trimmed;
};

const EXPLICIT_HTTP = /^https?:\/\//i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const HOST_WITH_PORT = /^[^/?#:]+:\d+(?:[/?#]|$)/;
const INTERNAL_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.intranet', '.private', '.localdomain', '.home.arpa'];

const isPublicDomain = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') || /^\d+(?:\.\d+){0,3}$/.test(host)) return false;
  const labels = host.split('.');
  if (labels.length < 2 || labels.some((label) => label.length === 0)) return false;
  if (!/^[a-z][a-z0-9-]*$/.test(labels[labels.length - 1] ?? '')) return false;
  if (host === 'localhost') return false;
  return !INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
};

/** L'adresse telle qu'elle sera stockée et suivie, ou `null` si elle n'est pas publiable. */
export const normalizeAddressUrl = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0 || trimmed.length > ADDRESS_URL_MAX_LENGTH || /[\s\u0000-\u001f\u007f]/.test(trimmed)) return null;
  const hasScheme = ANY_SCHEME.test(trimmed) && !HOST_WITH_PORT.test(trimmed);
  if (hasScheme && !EXPLICIT_HTTP.test(trimmed)) return null;
  const candidate = EXPLICIT_HTTP.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    const open = (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === '';
    return open && isPublicDomain(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
};

export type AddressColumns = {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly glyph: string;
  readonly circle: string;
  readonly position: number;
  readonly isShown: boolean;
  readonly trackingToken?: string | null;
};

/** Ce qu'un lecteur reçoit : le contenu, jamais la position ni les clics ; le cercle au seul propriétaire. */
export type ServedAddress = {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly glyph: AddressGlyph;
  readonly trackedPath?: string;
  readonly circle?: RelationLevel;
};

const served = (row: AddressColumns, circle?: RelationLevel): ServedAddress => ({
  id: row.id,
  title: row.title,
  url: row.url,
  glyph: isAddressGlyph(row.glyph) ? row.glyph : DEFAULT_ADDRESS_GLYPH,
  ...(row.trackingToken ? { trackedPath: `/l/${row.trackingToken}` } : {}),
  ...(circle === undefined ? {} : { circle }),
});

export type AddressReader = { readonly isSelf: boolean; readonly viewerLevel: RelationLevel };

/**
 * Ce lecteur lit-il une adresse de ce cercle ? La MÊME loi pour la fiche et pour le lien de
 * suivi de l'adresse (`/l/<jeton>`) : un cercle illisible ne s'ouvre qu'au propriétaire.
 */
export const addressOpensTo = (circle: unknown, reader: AddressReader): boolean => {
  if (reader.isSelf) return true;
  return isAddressCircle(circle) && relationLevelIfAtLeast(reader.viewerLevel, circle) !== null;
};

export const servedAddresses = (rows: ReadonlyArray<AddressColumns>, reader: AddressReader): ServedAddress[] =>
  [...rows]
    .filter((row) => row.isShown && addressOpensTo(row.circle, reader))
    .sort((a, b) => a.position - b.position)
    .map((row) => served(row, reader.isSelf && isAddressCircle(row.circle) ? row.circle : undefined));

/** Une rangée verrouillée de la fiche : le cercle qui ouvre ces adresses et leur nombre — rien d'autre. */
export type LockedAddressCount = { readonly circle: RelationLevel; readonly count: number };

/** `reachable` faux : blocage ou compte désactivé, le lecteur ne peut atteindre aucun cercle. */
export type LockedAddressReader = AddressReader & { readonly reachable: boolean };

/**
 * Ce qui est fermé se voit, verrouillé (loi 4 de la planche, #19274) : combien d'adresses
 * affichées chaque cercle plus proche ouvrirait. La MÊME loi que la fiche
 * (`addressOpensTo`) : une adresse servie n'est jamais comptée, une adresse comptée n'est
 * jamais servie. Seuls le cercle et le compte partent — ni titre, ni URL, ni glyphe, ni
 * jeton, ni identifiant. Une adresse masquée ou à cercle illisible ne se compte pas.
 */
export const lockedAddressCounts = (rows: ReadonlyArray<AddressColumns>, reader: LockedAddressReader): LockedAddressCount[] => {
  if (reader.isSelf || !reader.reachable) return [];
  const locked = rows.filter((row) => row.isShown && isAddressCircle(row.circle) && !addressOpensTo(row.circle, reader));
  return RELATION_LEVELS.flatMap((circle): LockedAddressCount[] => {
    const count = locked.filter((row) => row.circle === circle).length;
    return count === 0 ? [] : [{ circle, count }];
  });
};

/** « Voir comme » : ce que lirait un lecteur de ce cercle, depuis la lecture du propriétaire. */
export const addressesSeenAs = (own: ReadonlyArray<ServedAddress>, level: RelationLevel): ServedAddress[] =>
  own.flatMap((address): ServedAddress[] => {
    if (!isAddressCircle(address.circle) || relationLevelIfAtLeast(level, address.circle) === null) return [];
    const { circle: _circle, ...visible } = address;
    return [visible];
  });

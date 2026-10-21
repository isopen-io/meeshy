/**
 * LE MOTEUR DES PACKS, À DOMAINES (#10148, LP0) — le moteur des packs de
 * stickers (#9141, #9190) généralisé, pour que les stickers, les cadres de
 * gloire (rangs, prestige, succès, moments) et les cadres de capture (appel,
 * photo, vidéo) s'installent, se retirent et se téléchargent par le MÊME code.
 * `docs/product/cadres-de-gloire/PROMPT-developpement.md` § 5.10.2.
 *
 * Les stickers sont le premier domaine, à contrat servi inchangé :
 * `sticker-pack.ts` garde tous ses exports, en alias de ce qui vit ici.
 *
 * Ce fichier ne porte AUCUN schéma : `sticker-pack.ts` l'importe, et les
 * chunks web des stickers ne doivent pas embarquer ceux des cadres. Le
 * registre vit dans `content-pack-index.ts`, la présence dans `pack-presence.ts`.
 *
 * La loi ne lit ni registre ni base : l'appelant lui passe les DONNÉES (les
 * défauts du domaine, l'atmosphère choisie), comme `isStickerPackInstalled`.
 *
 * @see schema.prisma — `StickerPack`, `UserStickerPack` (aucun changement de schéma en v1, D-P1)
 */
import type { GloryAtmosphere } from './glory-atmospheres.js';

/** `banner` : le FOND de bannière (un dessin qui s'affiche sans photo) ; `banner-frame` : le CADRE posé sur la photo, centre transparent (#10932). */
export const PACK_DOMAINS = ['sticker', 'glory-frame', 'capture-frame', 'wallpaper', 'avatar-ring', 'banner', 'banner-frame'] as const;
export type PackDomain = (typeof PACK_DOMAINS)[number];

/** `builtin` : dessiné ou embarqué par le client ; `official` : publié par Meeshy ; `community` : proposé par un tiers (stickers seuls). */
export const PACK_ORIGINS = ['builtin', 'official', 'community'] as const;
export type PackOrigin = (typeof PACK_ORIGINS)[number];

export const PACK_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type PackStatus = (typeof PACK_STATUSES)[number];

/** Les sept langues dans lesquelles un pack officiel nomme et décrit ce qu'il porte. */
export const PACK_LANGUAGES = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const;
export type PackLanguage = (typeof PACK_LANGUAGES)[number];

/** Le slug devient l'adresse du pack. Sans point : aucune clé de domaine ne peut entrer en collision avec un slug nu. */
export const PACK_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Les limites communes à tous les domaines. */
export const PACK_LIMITS = {
  maxSlugLength: 24,
  maxNameLength: 40,
  maxDescriptionLength: 280,
  maxAuthorLength: 40,
  /** Les propositions en attente d'un même auteur. */
  maxPendingPerAuthor: 3,
  maxReviewNoteLength: 280,
} as const;

/** Le prix maximal d'un pack, en Meeshes. */
export const PACK_PRICE_MAX = 10_000;

/** Les segments d'adresse de l'API des packs et les onglets fixes des boutiques, qu'aucun slug ne peut prendre. */
export const PACK_ROUTE_SEGMENTS = ['submissions', 'pending', 'installed', 'mine', 'favorites', 'shop'] as const;

export const isPackDomain = (value: unknown): value is PackDomain =>
  typeof value === 'string' && (PACK_DOMAINS as readonly string[]).includes(value);

const isPackSlug = (slug: string): boolean => slug.length <= PACK_LIMITS.maxSlugLength && PACK_SLUG_PATTERN.test(slug);

// ── La clé de choix d'installation ─────────────────────────────────────

/**
 * La clé de `UserStickerPack.packSlug` : le slug NU pour un sticker (les lignes
 * existantes ne bougent pas), `<domaine>.<slug>` sinon.
 */
export const packChoiceKey = (domain: PackDomain, slug: string): string => (domain === 'sticker' ? slug : `${domain}.${slug}`);

export function parsePackChoiceKey(key: string): { readonly domain: PackDomain; readonly slug: string } | null {
  const dot = key.indexOf('.');
  if (dot === -1) return isPackSlug(key) ? { domain: 'sticker', slug: key } : null;
  const domain = key.slice(0, dot);
  const slug = key.slice(dot + 1);
  if (!isPackDomain(domain) || domain === 'sticker' || !isPackSlug(slug)) return null;
  return { domain, slug };
}

// ── La possession (#10632) ──────────────────────────────────────────────

/** Ce que la loi de possession lit d'un pack : son adresse et son prix (`null`/absent = gratuit). */
export type PackOwnable = { readonly domain: PackDomain; readonly slug: string; readonly price?: number | null };

/**
 * LA règle de possession : un pack gratuit est possédé par tout compte
 * inscrit ; un pack payant l'est si et seulement si une ligne
 * `UserPackOwnership` existe pour `packChoiceKey(domaine, slug)`. Installer
 * n'est pas posséder : le RENDU d'un choix exige la possession.
 */
export const isPackOwned = (pack: PackOwnable, ownedKeys: ReadonlySet<string>): boolean =>
  pack.price === undefined || pack.price === null || ownedKeys.has(packChoiceKey(pack.domain, pack.slug));

// ── Installé, réservé, retirable ────────────────────────────────────────

/** Ce que la loi lit d'un pack d'un registre : son slug et son défaut d'installation. */
export type PackDefault = { readonly slug: string; readonly installedByDefault: boolean };

/** Les packs intégrés ou officiels de chaque domaine, tels que l'appelant les connaît. */
export type PackRegistries = { readonly [D in PackDomain]?: readonly PackDefault[] };

export type PackChoice = { readonly installed: boolean } | undefined;

/** LA règle : le choix explicite de l'utilisateur, sinon le défaut du pack dans le registre de SON domaine, sinon non installé. */
export function isPackInstalled(domain: PackDomain, slug: string, choice: PackChoice, registries: PackRegistries): boolean {
  if (choice !== undefined) return choice.installed;
  return registries[domain]?.find((pack) => pack.slug === slug)?.installedByDefault ?? false;
}

/**
 * Un slug qu'un tiers ne peut pas prendre DANS CE DOMAINE : un intégré de ce
 * domaine ou un segment d'adresse. Jamais à travers les domaines : les clés
 * sont déjà espacées par `packChoiceKey`, et réserver aux stickers les slugs
 * des cadres changerait la réponse de `POST /sticker-packs/submissions`.
 */
export const isReservedPackSlug = (domain: PackDomain, slug: string, registries: PackRegistries): boolean =>
  (PACK_ROUTE_SEGMENTS as readonly string[]).includes(slug) || (registries[domain]?.some((pack) => pack.slug === slug) ?? false);

export type PackRemovalContext = { readonly chosenAtmosphere: GloryAtmosphere | null };

/** Retirable si le pack l'est, et jamais le pack de l'atmosphère choisie (PP7) — la passerelle applique la même règle. */
export const isPackRemovable = (
  entry: { readonly removable: boolean; readonly atmosphere?: GloryAtmosphere },
  context: PackRemovalContext,
): boolean => entry.removable && (entry.atmosphere === undefined || entry.atmosphere !== context.chosenAtmosphere);

// ── Les fichiers adressés par contenu ───────────────────────────────────

/** Un fichier de pack : `src` = les 16 premiers caractères de son SHA-256, puis son extension (`PackAssetRefSchema`). */
export type PackAssetRef = { readonly src: string; readonly bytes: number; readonly sha256: string };

// ── Ce que sert la passerelle ───────────────────────────────────────────

/** Le résumé commun à tous les domaines — exactement celui que servent déjà les packs de stickers, `kinds` mis à part. */
export type PackSummaryBase = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly builtin: boolean;
  readonly status: PackStatus;
  readonly itemCount: number;
  readonly coverUrl: string | null;
  readonly installed: boolean;
  readonly installCount: number;
};

export type PackDownloadBytes = { readonly story: number; readonly square: number | null };
export type PackNames = { readonly [L in PackLanguage]?: { readonly name: string; readonly description: string } };

/** Le résumé d'un pack de N'IMPORTE quel domaine. Les stickers gardent leur projection, `StickerPackSummary`, identique à l'octet. */
export type PackSummary = PackSummaryBase & {
  readonly domain: PackDomain;
  readonly origin: PackOrigin;
  readonly version: number;
  /** Servi et affiché AVANT l'installation ; `null` pour un pack sans octets à télécharger. */
  readonly downloadBytes: PackDownloadBytes | null;
  readonly removable: boolean;
  readonly names: PackNames;
  /** Le prix en Meeshes ; `null` ou absent = gratuit (additif, ignoré par les anciens clients). */
  readonly price?: number | null;
  /** Gratuit ⇒ `true` ; payant ⇒ une ligne de possession existe (additif). */
  readonly owned?: boolean;
  /** L'atlas des vignettes, pour montrer le pack sans l'installer. */
  readonly preview: PackAssetRef | null;
};

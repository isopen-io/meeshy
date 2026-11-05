/**
 * L'ÉDITEUR D'UN PACK (#16274) — tout pack, ceux de Meeshy compris, appartient
 * à un éditeur, et tout éditeur appartient à un VRAI compte Meeshy.
 *
 * L'entité est `PartnerProfile` (#11327), généralisée des lens à tous les
 * domaines : un compte possède au plus UN éditeur (`userId @unique`), qui porte
 * son nom de BOUTIQUE (`displayName`, distinct du nom d'utilisateur), son
 * adresse (`slug`), son logo et sa vérification. Les clients de la boutique ne
 * reçoivent que `PackPublisherRef` : jamais le compte propriétaire, que seule
 * l'administration (BIGBOSS/ADMIN) voit.
 *
 * L'identité « Meeshy » est RÉSERVÉE : seul le compte officiel, désigné par la
 * configuration de la passerelle (`MEESHY_OFFICIAL_ACCOUNT_ID`), la porte. Les
 * packs du dépôt lui sont attribués par l'index des packs, sans réécrire un
 * seul registre.
 *
 * @see services/gateway/decisions/2026-11-05-un-editeur-de-packs-est-un-compte-meeshy.md
 */

export const PACK_PUBLISHER_LIMITS = {
  maxSlugLength: 40,
  /** Le suffixe aléatoire qui départage deux éditeurs au même nom. */
  slugSuffixLength: 4,
} as const;

/** Ce que la boutique sert d'un éditeur : son adresse et son nom de boutique — jamais le compte qui le possède. */
export type PackPublisherRef = {
  readonly slug: string;
  readonly name: string;
  readonly verified: boolean;
  /** L'éditeur du compte officiel Meeshy. */
  readonly official: boolean;
};

export const MEESHY_PUBLISHER_SLUG = 'meeshy';
export const MEESHY_PUBLISHER_NAME = 'Meeshy';

export const MEESHY_PUBLISHER: PackPublisherRef = Object.freeze({
  slug: MEESHY_PUBLISHER_SLUG,
  name: MEESHY_PUBLISHER_NAME,
  verified: true,
  official: true,
});

export const PACK_PUBLISHER_ERROR_CODES = {
  /** Le compte n'a vérifié ni son adresse e-mail ni son numéro, ou il est désactivé. */
  ACCOUNT_UNVERIFIED: 'PUBLISHER_ACCOUNT_UNVERIFIED',
  /** La proposition nomme un éditeur que le compte connecté ne possède pas. */
  NOT_OWNER: 'PUBLISHER_NOT_OWNER',
  /** La proposition se présente sous l'identité réservée de Meeshy. */
  RESERVED: 'PUBLISHER_RESERVED',
} as const;

/** Les segments de route sous `/publishers` : aucun éditeur ne prend leur adresse. */
const ROUTE_SLUGS: ReadonlySet<string> = new Set(['me', 'admin']);

const INVISIBLE_OR_CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/** Le nom replié : compatibilité Unicode, invisibles retirés, accents retirés, minuscules. */
const folded = (name: string): string =>
  name
    .normalize('NFKC')
    .replace(INVISIBLE_OR_CONTROL, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** L'adresse d'un éditeur, tirée de son nom de boutique ; `editeur` quand le nom n'a aucune lettre latine. */
export function publisherSlugOf(name: string): string {
  const slug = folded(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PACK_PUBLISHER_LIMITS.maxSlugLength - PACK_PUBLISHER_LIMITS.slugSuffixLength - 1)
    .replace(/-+$/g, '');
  return slug.length === 0 ? 'editeur' : slug;
}

/**
 * Vrai pour un nom ou un slug qu'aucun tiers ne peut porter : tout ce qui, une
 * fois replié, CONTIENT « meeshy » (« Meeshy Officiel », « Team-Meeshy »,
 * « Mée​shy » à espace invisible…), et les segments de route.
 */
export function isReservedPublisherIdentity(name: string): boolean {
  const compact = folded(name).replace(/[^a-z0-9]/g, '');
  return compact.includes(MEESHY_PUBLISHER_SLUG) || ROUTE_SLUGS.has(publisherSlugOf(name));
}

/**
 * L'éditeur qu'une proposition NOMME (`publisher` du manifeste) ; `null` si elle
 * n'en nomme aucun — un ancien client, rattaché à l'éditeur du compte connecté.
 * Une valeur présente mais qui n'est pas une chaîne rend `''` : elle ne
 * correspond à aucun éditeur, donc la proposition est refusée (fail-closed).
 */
export function claimedPublisherSlug(input: unknown): string | null {
  if (input === null || typeof input !== 'object') return null;
  const raw = (input as Record<string, unknown>).publisher;
  if (raw === undefined || raw === null || raw === '') return null;
  return typeof raw === 'string' ? raw : '';
}

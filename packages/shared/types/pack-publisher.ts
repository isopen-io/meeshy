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
 * Les CONFUSABLES vers le latin (UTS #39, `confusables.txt`, extrait minuscule) :
 * les lettres cyrilliques et grecques qui se LISENT comme une lettre latine, et
 * les chiffres qui se lisent comme une lettre. La pleine largeur est déjà
 * repliée par NFKC. Appliquée après la mise en minuscules.
 */
const CONFUSABLE_TO_LATIN: Readonly<Record<string, string>> = {
  // cyrillique
  а: 'a', в: 'b', ь: 'b', с: 'c', ԁ: 'd', е: 'e', ё: 'e', є: 'e', һ: 'h', н: 'h', і: 'i', ї: 'i', ӏ: 'l', ј: 'j', к: 'k', м: 'm',
  п: 'n', о: 'o', р: 'p', ԛ: 'q', г: 'r', ѕ: 's', т: 't', и: 'u', ц: 'u', ѵ: 'v', ԝ: 'w', ш: 'w', х: 'x', у: 'y', ү: 'y', з: '3',
  // grec
  α: 'a', β: 'b', ϲ: 'c', δ: 'd', ε: 'e', η: 'n', ι: 'i', ϳ: 'j', κ: 'k', μ: 'u', ν: 'v', ο: 'o', ρ: 'p', σ: 'o', τ: 't', υ: 'u',
  ω: 'w', χ: 'x', γ: 'y', ζ: 'z', ϱ: 'p', ς: 'c',
  // chiffres
  '0': 'o', '1': 'l',
};

/** Les CAPITALES confusables, qui imitent une capitale latine différente de leur minuscule (Μ grec ≠ μ). */
const CAPITAL_CONFUSABLE_TO_LATIN: Readonly<Record<string, string>> = {
  А: 'a', В: 'b', Е: 'e', Ё: 'e', К: 'k', М: 'm', Н: 'h', О: 'o', Р: 'p', С: 'c', Т: 't', Х: 'x', У: 'y', Ѕ: 's', І: 'i', Ј: 'j',
  Α: 'a', Β: 'b', Ε: 'e', Ζ: 'z', Η: 'h', Ι: 'i', Κ: 'k', Μ: 'm', Ν: 'n', Ο: 'o', Ρ: 'p', Τ: 't', Υ: 'y', Χ: 'x',
};

const mapped = (text: string, table: Readonly<Record<string, string>>): string => [...text].map((char) => table[char] ?? char).join('');

/** Le squelette d'un nom : capitales confusables d'abord, puis replié, puis chaque minuscule confusable remplacée par la lettre latine qu'elle imite. */
const skeleton = (name: string): string =>
  mapped(folded(mapped(name.normalize('NFKC'), CAPITAL_CONFUSABLE_TO_LATIN)), CONFUSABLE_TO_LATIN);

/**
 * Les alphabets qu'un nom d'éditeur peut employer (UTS #39, profil « Highly
 * Restrictive ») : une lettre d'un alphabet absent de cette liste fait refuser
 * le nom (fail-closed).
 */
const SCRIPTS = [
  ['Latin', /\p{Script=Latin}/u],
  ['Cyrillic', /\p{Script=Cyrillic}/u],
  ['Greek', /\p{Script=Greek}/u],
  ['Arabic', /\p{Script=Arabic}/u],
  ['Hebrew', /\p{Script=Hebrew}/u],
  ['Armenian', /\p{Script=Armenian}/u],
  ['Georgian', /\p{Script=Georgian}/u],
  ['Devanagari', /\p{Script=Devanagari}/u],
  ['Bengali', /\p{Script=Bengali}/u],
  ['Tamil', /\p{Script=Tamil}/u],
  ['Telugu', /\p{Script=Telugu}/u],
  ['Thai', /\p{Script=Thai}/u],
  ['Ethiopic', /\p{Script=Ethiopic}/u],
  ['Han', /\p{Script=Han}/u],
  ['Hiragana', /\p{Script=Hiragana}/u],
  ['Katakana', /\p{Script=Katakana}/u],
  ['Hangul', /\p{Script=Hangul}/u],
  ['Bopomofo', /\p{Script=Bopomofo}/u],
] as const;

type Script = (typeof SCRIPTS)[number][0];

/** Les seuls mélanges qu'admet le profil : le japonais, le chinois à bopomofo et le coréen, chacun avec les sinogrammes. */
const MIXES: readonly ReadonlySet<Script>[] = [new Set<Script>(['Han', 'Hiragana', 'Katakana']), new Set<Script>(['Han', 'Bopomofo']), new Set<Script>(['Han', 'Hangul'])];

/** Hors des lettres : les chiffres, l'espace et la ponctuation courante, rien d'autre. */
const ALLOWED_NON_LETTER = /^[\p{Nd} \-_.,'’&+!?()#@:·—–]$/u;
const ASCII_LETTER = /^[A-Za-z]$/;
const LETTER = /\p{L}/u;
const MARK = /\p{M}/u;

/** Une lettre latine admise : une lettre ASCII, accentuée ou non (NFD) — jamais une petite capitale, une lettre IPA ou modificative. */
const isPlainLatin = (char: string): boolean => ASCII_LETTER.test(char.normalize('NFD').replace(/\p{M}/gu, ''));

/** L'alphabet d'une lettre, ou `null` pour un alphabet que le profil n'admet pas. */
const scriptOf = (char: string): Script | null => SCRIPTS.find(([, pattern]) => pattern.test(char))?.[0] ?? null;

/**
 * Vrai pour un nom écrit selon la liste blanche : chaque caractère est une
 * lettre d'un alphabet admis (latine ASCII éventuellement accentuée), une
 * marque combinante, un chiffre, l'espace ou une ponctuation courante ; et
 * toutes les lettres appartiennent à UN SEUL alphabet (ou à un mélange admis).
 * Lu en NFC, jamais en NFKC : une forme de compatibilité (pleine largeur,
 * exposant, ligature, ™) est elle-même refusée, au lieu d'être repliée.
 */
const isWhitelistedName = (name: string): boolean => {
  const chars = [...name.normalize('NFC')];
  const scripts = new Set<Script>();
  for (const char of chars) {
    if (MARK.test(char)) continue;
    if (!LETTER.test(char)) {
      if (!ALLOWED_NON_LETTER.test(char)) return false;
      continue;
    }
    const script = scriptOf(char);
    if (script === null) return false;
    if (script === 'Latin' && !isPlainLatin(char)) return false;
    scripts.add(script);
  }
  return scripts.size <= 1 || MIXES.some((mix) => [...scripts].every((script) => mix.has(script)));
};

/**
 * Vrai pour un nom ou un slug qu'aucun tiers ne peut porter : tout nom hors de
 * la liste blanche (`isWhitelistedName` : un seul alphabet, lettres latines
 * ASCII accentuées seulement, chiffres et ponctuation courante), tout nom dont
 * le SQUELETTE de confusables CONTIENT « meeshy » (« Meeshy Officiel »,
 * « Team-Meeshy », « Мееѕһу » entièrement cyrillique…), et les segments de route.
 */
export function isReservedPublisherIdentity(name: string): boolean {
  if (!isWhitelistedName(name)) return true;
  const compact = skeleton(name).replace(/[^a-z0-9]/g, '');
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

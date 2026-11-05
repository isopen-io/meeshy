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
 * @see services/gateway/decisions/2026-11-05-un-editeur-de-packs-est-un-compte-meeshy-16274.md
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
  /** Un autre éditeur porte déjà ce nom de boutique, à la casse, aux accents et aux confusables près (`publisherNameKey`). */
  NAME_TAKEN: 'PUBLISHER_NAME_TAKEN',
  /** La disponibilité du nom n'a pas pu être établie (anciens profils pas encore rattrapés) : réessayer plus tard (503, `Retry-After`). */
  RETRY_LATER: 'PUBLISHER_RETRY_LATER',
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
 * les lettres cyrilliques et grecques qui se LISENT comme une lettre latine, les
 * petites capitales et les sosies IPA latins, et l'écriture « leet » — chiffres
 * et ponctuation qui se lisent comme une lettre (« M33SHY », « Mee§hy »). La
 * pleine largeur est déjà repliée par NFKC. Appliquée après la mise en minuscules.
 */
const CONFUSABLE_TO_LATIN: Readonly<Record<string, string>> = {
  // cyrillique
  а: 'a', в: 'b', ь: 'b', с: 'c', ԁ: 'd', е: 'e', ё: 'e', є: 'e', һ: 'h', н: 'h', і: 'i', ї: 'i', ӏ: 'l', ј: 'j', к: 'k', м: 'm',
  п: 'n', о: 'o', р: 'p', ԛ: 'q', г: 'r', ѕ: 's', т: 't', и: 'u', ц: 'u', ѵ: 'v', ԝ: 'w', ш: 'w', х: 'x', у: 'y', ү: 'y', з: 'e',
  // grec
  α: 'a', β: 'b', ϲ: 'c', δ: 'd', ε: 'e', η: 'n', ι: 'i', ϳ: 'j', κ: 'k', μ: 'u', ν: 'v', ο: 'o', ρ: 'p', σ: 'o', τ: 't', υ: 'u',
  ω: 'w', χ: 'x', γ: 'y', ζ: 'z', ϱ: 'p', ς: 'c',
  // petites capitales latines
  ᴀ: 'a', ʙ: 'b', ᴄ: 'c', ᴅ: 'd', ᴇ: 'e', ꜰ: 'f', ɢ: 'g', ʜ: 'h', ɪ: 'i', ᴊ: 'j', ᴋ: 'k', ʟ: 'l', ᴍ: 'm', ɴ: 'n', ᴏ: 'o', ᴘ: 'p',
  ʀ: 'r', ꜱ: 's', ᴛ: 't', ᴜ: 'u', ᴠ: 'v', ᴡ: 'w', ʏ: 'y', ᴢ: 'z',
  // sosies IPA
  ɑ: 'a', ɡ: 'g', ɩ: 'i',
  // leet : chiffres et ponctuation
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '§': 's', '$': 's', '€': 'e', '|': 'i', '!': 'i', '@': 'a',
};

/** Les CAPITALES confusables, qui imitent une capitale latine différente de leur minuscule (Μ grec ≠ μ). */
const CAPITAL_CONFUSABLE_TO_LATIN: Readonly<Record<string, string>> = {
  А: 'a', В: 'b', Е: 'e', Ё: 'e', К: 'k', М: 'm', Н: 'h', О: 'o', Р: 'p', С: 'c', Т: 't', Х: 'x', У: 'y', Ѕ: 's', І: 'i', Ј: 'j',
  Α: 'a', Β: 'b', Ε: 'e', Ζ: 'z', Η: 'h', Ι: 'i', Κ: 'k', Μ: 'm', Ν: 'n', Ο: 'o', Ρ: 'p', Τ: 't', Υ: 'y', Χ: 'x',
};

/**
 * Les confusables de PLUSIEURS caractères (UTS #39, séquences de
 * `confusables.txt`) : « rn » se lit « m », « vv » se lit « w », « cl » se lit
 * « d ». Puis « l » et « i », indiscernables sans empattement, se confondent.
 * Appliqués dans cet ordre, après les confusables d'un caractère.
 */
const SEQUENCE_CONFUSABLES: readonly (readonly [RegExp, string])[] = [
  [/rn/g, 'm'],
  [/vv/g, 'w'],
  [/cl/g, 'd'],
  [/l/g, 'i'],
];

const mapped = (text: string, table: Readonly<Record<string, string>>): string => [...text].map((char) => table[char] ?? char).join('');

/** Le squelette d'un nom : capitales confusables, replié, confusables d'un caractère, puis séquences confusables. */
const skeleton = (name: string): string =>
  SEQUENCE_CONFUSABLES.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    mapped(folded(mapped(name.normalize('NFKC'), CAPITAL_CONFUSABLE_TO_LATIN)), CONFUSABLE_TO_LATIN),
  );

const SEPARATOR = /[\p{P}\p{Z}\p{Cc}\p{Cf}]/u;
const ASCII_ALNUM = /^[a-z0-9]+$/;
const VISIBLE_UNKNOWN = /[\p{L}\p{N}\p{S}]/u;
/** Un caractère que le squelette ne sait pas lire : il peut valoir N'IMPORTE quelle lettre. */
const JOKER = '*';
/**
 * Au plus deux jokers dans la fenêtre « meeshy » pour un nom bien formé : sans
 * cette borne, tout nom de six lettres d'un autre alphabet serait réservé. Un
 * nom MAL formé (`isWhitelistedName`) n'a pas cette indulgence : chaque
 * caractère inconnu peut y valoir une lettre (« ᎷᎬᎬSHY »).
 */
const MAX_JOKERS = 2;

/**
 * Ce que l'œil lit d'un caractère, FERMÉ PAR DÉFAUT : un confusable connu
 * (ponctuation leet comprise) se remplace par la lettre qu'il imite, une lettre
 * latine (diacritiques retirés) ou un chiffre se garde, et tout autre caractère
 * visible — lettre, chiffre ou symbole inconnu (❘, ɛ, ß… ; ⓜ et ℳ sont déjà
 * repliés par NFKC) — devient un JOKER. Le reste de la ponctuation, les espaces
 * et les invisibles tombent.
 */
const readAs = (char: string, leetPunctuation: boolean): string => {
  if (!leetPunctuation && LEET_PUNCTUATION.test(char)) return '';
  const lower = char.toLowerCase();
  const confusable = CONFUSABLE_TO_LATIN[lower];
  if (confusable !== undefined) return confusable;
  if (SEPARATOR.test(char) || MARK.test(char)) return '';
  const base = lower.normalize('NFD').replace(/\p{M}/gu, '');
  if (ASCII_ALNUM.test(base)) return mapped(base, CONFUSABLE_TO_LATIN);
  return VISIBLE_UNKNOWN.test(char) ? JOKER : '';
};

/** La ponctuation leet : elle peut REMPLACER une lettre (« Mee§hy ») ou S'INSÉRER entre deux (« M|eeshy ») — les deux lectures sont faites. */
const LEET_PUNCTUATION = /^[§$€|!@]$/u;

/** Le squelette de LECTURE d'un nom : chaque caractère lu (`readAs`), puis les séquences confusables. */
const readingSkeleton = (name: string, leetPunctuation: boolean): string =>
  SEQUENCE_CONFUSABLES.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    [...mapped(name.normalize('NFKC'), CAPITAL_CONFUSABLE_TO_LATIN)].map((char) => readAs(char, leetPunctuation)).join(''),
  );

/**
 * Vrai si `read` contient une suite qui se lit `target`, chaque joker valant
 * UNE lettre (au plus `maxJokers` fois) ou RIEN — un sosie inséré entre deux
 * lettres ne rallonge pas la fenêtre.
 */
const canRead = (read: readonly string[], target: string, maxJokers: number): boolean => {
  const memo = new Map<string, boolean>();
  const from = (i: number, j: number, used: number): boolean => {
    if (j === target.length) return true;
    if (i === read.length) return false;
    const key = `${i}:${j}:${used}`;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const char = read[i];
    const result =
      char === JOKER
        ? (j > 0 && from(i + 1, j, used)) || (used < maxJokers && from(i + 1, j + 1, used + 1))
        : char === target[j] && from(i + 1, j + 1, used);
    memo.set(key, result);
    return result;
  };
  return read.some((_, start) => from(start, 0, 0));
};

/**
 * Vrai pour un nom qui PEUT se lire comme Meeshy (« Meeshy Officiel »,
 * « Мееѕһу », « ᴍeeshy », « rneeshy », « ⓜeeshy », « M❘eeshy », « Mee☆shy »…) :
 * la seule réserve qui fait REFUSER une proposition. Deux contrôles, et l'un
 * suffit : le SOCLE (tout ce qui n'est pas `[a-z0-9]` retiré, puis la
 * sous-chaîne « meeshy »), et la lecture FERMÉE PAR DÉFAUT, où un caractère
 * inconnu vaut une lettre ou rien. Un nom seulement mal formé n'est pas une
 * usurpation.
 */
export function impersonatesMeeshy(name: string): boolean {
  const lenient = isWhitelistedName(name);
  return [true, false].some((leetPunctuation) => {
    const read = readingSkeleton(name, leetPunctuation);
    if (read.replace(/[^a-z0-9]/g, '').includes(MEESHY_PUBLISHER_SLUG)) return true;
    return canRead([...read], MEESHY_PUBLISHER_SLUG, lenient ? MAX_JOKERS : read.length);
  });
}

/**
 * La CLÉ d'un nom d'éditeur : deux noms de même clé se lisent pareil (casse,
 * accents, ponctuation, confusables). Un nom de boutique est unique par sa clé.
 * Les lettres des autres alphabets sont gardées ; un nom sans lettre ni chiffre
 * garde son squelette entier.
 */
export function publisherNameKey(name: string): string {
  const full = skeleton(name).replace(/[\p{Cc}\p{Cf}\p{Z}]/gu, '');
  const compact = full.replace(/[^\p{L}\p{N}]/gu, '');
  return compact.length > 0 ? compact : full;
}

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

/**
 * Les mélanges admis : ceux du profil Highly Restrictive (le latin avec le
 * japonais, le chinois à bopomofo ou le coréen), et le latin avec l'arabe,
 * courant dans les noms de boutique bilingues.
 */
const MIXES: readonly ReadonlySet<Script>[] = [
  new Set<Script>(['Latin', 'Arabic']),
  new Set<Script>(['Latin', 'Han', 'Hiragana', 'Katakana']),
  new Set<Script>(['Latin', 'Han', 'Bopomofo']),
  new Set<Script>(['Latin', 'Han', 'Hangul']),
];

const LETTER = /\p{L}/u;
const MARK = /\p{M}/u;
const PICTOGRAPH = /\p{Extended_Pictographic}/u;
const ZERO_WIDTH_JOINER = '\u200D';
/** Hors des lettres, tout ce qui SE VOIT : chiffres, ponctuation, symboles, emoji, et l'espace ordinaire. */
const VISIBLE_NON_LETTER = /^[\p{N}\p{P}\p{S} ]$/u;

/**
 * Les lettres latines étendues LÉGITIMES qui ne se replient pas en ASCII par
 * NFD : celles des langues écrites (danois, allemand, polonais, français,
 * vietnamien, islandais, turc, croate…), puis tout le Latin étendu B et l'IPA,
 * où vivent les orthographes africaines et autres (ɛ ɔ ɓ ɗ ə ɲ ŋ ƙ ƴ ʋ ɣ ƒ ʃ ʒ :
 * bambara, peul, haoussa, ewe, azéri…).
 */
const LEGITIMATE_EXTENDED_LATIN: ReadonlySet<string> = new Set([...'øØßẞłŁœŒæÆđĐþÞðÐıŋŊħĦŧŦƒǆǅǄĳĲ']);
const LATIN_EXTENDED_B_AND_IPA = /^[\u0180-\u02AF]$/u;
/**
 * La LISTE NOIRE : les lettres latines qui ne servent qu'à imiter une autre
 * lettre — petites capitales (U+1D00–U+1D2B, ꜰ ꜱ et celles de l'IPA), sosies
 * IPA (ɑ ɡ ʍ ɩ), lettres de clic qui se lisent « | » ou « ! », iota latin,
 * lettres modificatives et pleine largeur.
 */
const LOOKALIKE_LATIN: ReadonlySet<string> = new Set([...'ɑɡʍɩɪʏʜʟɴʀʙɢꜰꜱǀǁǂǃƖ']);
const SMALL_CAPITAL_OR_MODIFIER = /^[\u1D00-\u1D2B\uFF21-\uFF3A\uFF41-\uFF5A\p{Lm}]$/u;
const ASCII_LETTER = /^[A-Za-z]$/;

/** Une lettre latine valide : hors liste noire, ASCII une fois ses diacritiques retirés (NFD), étendue légitime, ou du Latin étendu B / de l'IPA. */
const isValidLatin = (char: string): boolean =>
  !LOOKALIKE_LATIN.has(char) &&
  !SMALL_CAPITAL_OR_MODIFIER.test(char) &&
  (ASCII_LETTER.test(char.normalize('NFD').replace(/\p{M}/gu, '')) || LEGITIMATE_EXTENDED_LATIN.has(char) || LATIN_EXTENDED_B_AND_IPA.test(char));

/** La marque de prolongation des kana (ー), commune à l'écriture japonaise : comptée comme katakana. */
const PROLONGED_SOUND_MARK = '\u30FC';

/** L'alphabet d'une lettre, ou `null` pour un alphabet que le profil n'admet pas. */
const scriptOf = (char: string): Script | null =>
  char === PROLONGED_SOUND_MARK ? 'Katakana' : (SCRIPTS.find(([, pattern]) => pattern.test(char))?.[0] ?? null);

/** Une jointure n'est admise qu'au sein d'une séquence d'emoji (famille, métier…). */
const isEmojiJoiner = (chars: readonly string[], index: number): boolean =>
  index > 0 && PICTOGRAPH.test(chars[index - 1] ?? '') && PICTOGRAPH.test(chars[index + 1] ?? '');

/**
 * Vrai pour un nom bien formé : chaque caractère est une lettre d'un alphabet
 * admis (jamais un sosie latin), une marque combinante, un caractère visible
 * (chiffre, ponctuation, symbole, emoji) ou l'espace ; et ses lettres tiennent
 * dans UN alphabet ou dans un mélange admis. Lu en NFC : une forme de
 * compatibilité (pleine largeur, exposant) reste ce qu'elle est.
 */
const isWhitelistedName = (name: string): boolean => {
  const chars = [...name.normalize('NFC')];
  const scripts = new Set<Script>();
  for (const [index, char] of chars.entries()) {
    if (MARK.test(char)) continue;
    if (char === ZERO_WIDTH_JOINER && isEmojiJoiner(chars, index)) continue;
    if (!LETTER.test(char)) {
      if (!VISIBLE_NON_LETTER.test(char)) return false;
      continue;
    }
    const script = scriptOf(char);
    if (script === null) return false;
    if (script === 'Latin' && !isValidLatin(char)) return false;
    scripts.add(script);
  }
  return scripts.size <= 1 || MIXES.some((mix) => [...scripts].every((script) => mix.has(script)));
};

/**
 * Vrai pour un nom ou un slug qu'aucun tiers ne peut porter : tout nom mal
 * formé (`isWhitelistedName`), tout nom qui se lit comme Meeshy
 * (`impersonatesMeeshy`), et les segments de route.
 */
export function isReservedPublisherIdentity(name: string): boolean {
  if (!isWhitelistedName(name)) return true;
  return impersonatesMeeshy(name) || ROUTE_SLUGS.has(publisherSlugOf(name));
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

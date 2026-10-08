// Valeurs SYNTHÉTIQUES déterministes, et le prédicat qui reconnaît chacune.
//
// Règle unique : une valeur synthétique se dérive d'un hachage du SEL de
// l'exécution et de l'`_id` du document (plus un chemin quand un document porte
// plusieurs valeurs du même genre) — JAMAIS de la valeur d'origine. Un hachage
// d'un numéro ou d'une adresse se retrouve en essayant les numéros : ce ne serait
// pas une anonymisation.
//
// Chaque générateur a son prédicat `is…`, qui reconnaît la forme COMPLÈTE de
// ce qu'il produit (jamais un préfixe ni un suffixe) : le contrôle final ne sait
// reconnaître que ce qu'on sait produire, et c'est voulu — une valeur qui n'a
// pas la forme synthétique est, par défaut, une valeur réelle.

import { createHash, randomBytes } from 'node:crypto';

export const ANON_PREFIX = 'anon-';
export const EMAIL_DOMAIN = 'example.invalid';
export const PLACEHOLDER_DIR = 'anonymized/';
export const SYNTHETIC_USER_AGENT = 'Mozilla/5.0 (Anonymized) Meeshy/0';
export const SYNTHETIC_DEVICE = 'anonymized-device';
export const SYNTHETIC_TIME_OF_DAY = 'T12:34:56.789Z';

export function newSalt() {
  return randomBytes(32).toString('hex');
}

export function digest(salt, ...parts) {
  return createHash('sha256').update([salt, ...parts.map(String)].join('\u0000')).digest();
}

export function hex(salt, length, ...parts) {
  return digest(salt, ...parts).toString('hex').slice(0, length);
}

function uint(salt, ...parts) {
  return digest(salt, ...parts).readUInt32BE(0);
}

function base36(salt, length, ...parts) {
  const bytes = digest(salt, ...parts);
  const value = BigInt(`0x${bytes.toString('hex')}`);
  return value.toString(36).padStart(length, '0').slice(-length);
}

const FIRST_NAMES = Object.freeze([
  'Alix', 'Ambre', 'Andréa', 'Aurèle', 'Bastien', 'Céleste', 'Clémence', 'Côme', 'Dalia', 'Elio',
  'Eliott', 'Eden', 'Fanny', 'Gaspard', 'Iris', 'Jade', 'Joachim', 'Lila', 'Lino', 'Lou',
  'Maël', 'Margaux', 'Milo', 'Nina', 'Noé', 'Olympe', 'Pacôme', 'Rose', 'Sacha', 'Tess',
  'Timéo', 'Victoire', 'Zélie', 'Yanis', 'Ninon', 'Aubin',
]);

const LAST_NAMES = Object.freeze([
  'Aubépine', 'Bellerive', 'Boisjoli', 'Clairefont', 'Combelune', 'Doucerive', 'Fontclaire', 'Grandpré',
  'Hautval', 'Lunebois', 'Malvoisin', 'Merlerouge', 'Montargent', 'Noirval', 'Orvallée', 'Pierrefeuille',
  'Plumeroc', 'Rivebelle', 'Roseval', 'Sablonnière', 'Sauvebois', 'Terrefine', 'Valombre', 'Vertpré',
]);

const WORDS = Object.freeze([
  'abricot', 'aurore', 'balade', 'boussole', 'brise', 'cahier', 'canal', 'carnet', 'cerisier', 'colline',
  'comète', 'crayon', 'dune', 'écharpe', 'escale', 'étoile', 'falaise', 'fanal', 'feuille', 'fontaine',
  'galet', 'grenier', 'horizon', 'jardin', 'lanterne', 'lavande', 'lumière', 'marelle', 'mésange', 'moulin',
  'nuage', 'orage', 'pavot', 'phare', 'pinède', 'plume', 'prairie', 'quai', 'rivière', 'roseau',
  'sentier', 'sillage', 'source', 'tilleul', 'tisane', 'tonnelle', 'verger', 'voilier', 'le', 'la',
  'un', 'une', 'du', 'des', 'près', 'sous', 'vers', 'avec', 'et', 'puis',
]);

const NAME_SET = new Set([...FIRST_NAMES, ...LAST_NAMES]);
const WORD_SET = new Set(WORDS);

export function firstName(salt, ...parts) {
  return FIRST_NAMES[uint(salt, 'first', ...parts) % FIRST_NAMES.length];
}

export function lastName(salt, ...parts) {
  return LAST_NAMES[uint(salt, 'last', ...parts) % LAST_NAMES.length];
}

export function fullName(salt, ...parts) {
  return `${firstName(salt, ...parts)} ${lastName(salt, ...parts)}`;
}

export function isSyntheticName(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  return value.split(' ').every((part) => NAME_SET.has(part));
}

export function username(salt, ...parts) {
  return `anon_${base36(salt, 12, 'username', ...parts)}`;
}

export function isSyntheticUsername(value) {
  return typeof value === 'string' && /^anon_[0-9a-z]{12}$/.test(value);
}

export function email(salt, ...parts) {
  return `${ANON_PREFIX}${hex(salt, 16, 'email', ...parts)}@${EMAIL_DOMAIN}`;
}

const SYNTHETIC_EMAIL = /^anon-[0-9a-f]{16}@example\.invalid$/;

export function isSyntheticEmail(value) {
  return typeof value === 'string' && SYNTHETIC_EMAIL.test(value);
}

// Plage FICTIVE du plan de numérotation nord-américain : 555-0100 à 555-0199 est
// réservé à la fiction dans TOUS les indicatifs régionaux (NANPA). Indicatifs
// 201 à 999 : 79 900 numéros, alloués par RANG pour les comptes (aucune
// collision possible), par hachage pour les carnets d'adresses.
const PHONE_AREA_FIRST = 201;
export const PHONE_SPACE = (999 - PHONE_AREA_FIRST + 1) * 100;

export function phoneAt(index) {
  const slot = ((index % PHONE_SPACE) + PHONE_SPACE) % PHONE_SPACE;
  const area = PHONE_AREA_FIRST + Math.floor(slot / 100);
  return `+1${area}55501${String(slot % 100).padStart(2, '0')}`;
}

export function phone(salt, ...parts) {
  return phoneAt(uint(salt, 'phone', ...parts));
}

export function isSyntheticPhone(value) {
  return typeof value === 'string' && /^\+1[2-9]\d{2}55501\d{2}$/.test(value);
}

export const SYNTHETIC_PHONE_COUNTRY = 'US';

// Plages de DOCUMENTATION (RFC 5737, RFC 3849) : jamais routées.
const TEST_NETS = Object.freeze(['192.0.2', '198.51.100', '203.0.113']);

export function ipv4(salt, ...parts) {
  const n = uint(salt, 'ip', ...parts);
  return `${TEST_NETS[n % TEST_NETS.length]}.${1 + (Math.floor(n / 3) % 254)}`;
}

const SYNTHETIC_IPV4 = /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\.(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const DOCUMENTATION_IPV6 = /^2001:0?db8(?::[0-9a-f]{0,4}){1,6}$/i;

export function isSyntheticIp(value) {
  return typeof value === 'string' && (SYNTHETIC_IPV4.test(value) || DOCUMENTATION_IPV6.test(value));
}

export function token(salt, ...parts) {
  return `${ANON_PREFIX}${hex(salt, 48, 'token', ...parts)}`;
}

const SYNTHETIC_TOKEN = /^anon-[0-9a-f]{32}(?:[0-9a-f]{16})?$/;

/** Un jeton (48 hex) ou une empreinte (32 hex) synthétique — forme COMPLÈTE, jamais un préfixe. */
export function isSyntheticToken(value) {
  return typeof value === 'string' && SYNTHETIC_TOKEN.test(value);
}

export function text(salt, minWords, maxWords, ...parts) {
  const span = maxWords - minWords + 1;
  const count = minWords + (uint(salt, 'len', ...parts) % span);
  const words = Array.from({ length: count }, (_, i) => WORDS[uint(salt, 'w', i, ...parts) % WORDS.length]);
  const [head, ...tail] = words;
  return `${head.charAt(0).toUpperCase()}${head.slice(1)}${tail.length ? ` ${tail.join(' ')}` : ''}.`;
}

export function sentence(salt, ...parts) {
  return text(salt, 4, 14, ...parts);
}

export function label(salt, ...parts) {
  return text(salt, 2, 3, ...parts).slice(0, -1);
}

export function isSyntheticText(value) {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  const tokens = value.replace(/\.$/, '').toLowerCase().split(' ');
  return tokens.length > 0 && tokens.every((t) => WORD_SET.has(t));
}

export function date(salt, fromYear, years, ...parts) {
  const day = uint(salt, 'date', ...parts) % (years * 365);
  const base = Date.UTC(fromYear, 0, 1) + day * 86_400_000;
  return new Date(`${new Date(base).toISOString().slice(0, 10)}${SYNTHETIC_TIME_OF_DAY}`);
}

export function isSyntheticDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime()) && value.toISOString().endsWith(SYNTHETIC_TIME_OF_DAY);
}

const SYNTHETIC_DATE_TEXT = /^\d{4}-\d{2}-\d{2}T12:34:56\.789Z$/;

export function isSyntheticDateText(value) {
  return typeof value === 'string' && SYNTHETIC_DATE_TEXT.test(value);
}

export function isSyntheticDateNumber(value) {
  return typeof value === 'number' && Number.isInteger(value) && isSyntheticDate(new Date(value));
}

export function coordinate(salt, ...parts) {
  return ((uint(salt, 'geo', ...parts) % 1000) - 500) / 1000;
}

/** Millièmes entiers dans [-0,5 ; 0,5[ : la forme exacte de `coordinate`, pas une simple borne. */
export function isSyntheticCoordinate(value) {
  if (typeof value !== 'number' || Math.abs(value) > 0.5) return false;
  const thousandths = value * 1000;
  return Math.abs(thousandths - Math.round(thousandths)) < 1e-9;
}

export function fingerprint(salt, ...parts) {
  return `${ANON_PREFIX}${hex(salt, 32, 'fp', ...parts)}`;
}

const EXTENSION_CATEGORY = Object.freeze({
  image: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif', 'avif', 'bmp', 'svg', 'tiff'],
  audio: ['m4a', 'mp3', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'caf', 'amr', 'weba'],
  video: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp'],
});

export const PLACEHOLDER_FILES = Object.freeze({
  image: `${PLACEHOLDER_DIR}placeholder.png`,
  audio: `${PLACEHOLDER_DIR}placeholder.wav`,
  video: `${PLACEHOLDER_DIR}placeholder.mp4`,
  file: `${PLACEHOLDER_DIR}placeholder.bin`,
});

export function extensionOf(value) {
  if (typeof value !== 'string') return '';
  const clean = value.split(/[?#]/)[0];
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(clean);
  return match ? match[1].toLowerCase() : '';
}

export function mediaCategory({ mimeType, path }) {
  const mime = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  const ext = extensionOf(path);
  const found = Object.entries(EXTENSION_CATEGORY).find(([, list]) => list.includes(ext));
  return found ? found[0] : 'file';
}

export function placeholderFor(hints) {
  return PLACEHOLDER_FILES[mediaCategory(hints)];
}

const PLACEHOLDER_SET = new Set(Object.values(PLACEHOLDER_FILES));

export function isPlaceholderPath(value) {
  return typeof value === 'string' && PLACEHOLDER_SET.has(value);
}

export function fileName(salt, original, ...parts) {
  const ext = extensionOf(original);
  return `${ANON_PREFIX}${hex(salt, 16, 'file', ...parts)}${ext ? `.${ext}` : ''}`;
}

const SYNTHETIC_FILE_NAME = /^anon-[0-9a-f]{16}(?:\.[a-z0-9]{1,5})?$/;

export function isSyntheticFileName(value) {
  return typeof value === 'string' && SYNTHETIC_FILE_NAME.test(value);
}

/** Un nom de clé d'objet JSON remplacé : `k_` + 12 hex. */
export function keyName(salt, ...parts) {
  return `k_${hex(salt, 12, 'key', ...parts)}`;
}

export function hashtag(salt, ...parts) {
  return `anon${hex(salt, 12, 'tag', ...parts)}`;
}

export function isSyntheticHashtag(value) {
  return typeof value === 'string' && /^anon[0-9a-f]{12}$/.test(value);
}

// Miroir de `searchTokensFor` (services/gateway/src/utils/search-tokens.ts) —
// un témoin du script confronte les deux, pour que la recherche de personne
// trouve les comptes anonymisés sous leurs nouveaux noms.
function fold(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function searchTokensFor(account) {
  const words = new Set();
  for (const raw of [account.username, account.displayName, account.firstName, account.lastName]) {
    if (!raw) continue;
    for (const word of fold(raw).split(' ')) if (word) words.add(word);
  }
  const initials = [account.firstName, account.lastName].map((v) => (v ? fold(v).charAt(0) : '')).join('');
  if (initials.length >= 2) words.add(initials);
  const tokens = new Set();
  for (const word of words) {
    for (let n = 2; n <= Math.min(word.length, 12); n++) tokens.add(word.slice(0, n));
  }
  return [...tokens].sort().slice(0, 96);
}

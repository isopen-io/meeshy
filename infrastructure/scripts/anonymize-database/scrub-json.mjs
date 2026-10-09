// Nettoyage des champs JSON libres (traductions, transcriptions, métadonnées,
// contextes de notification, effets de story, réglages, analytics…) et son
// contrôle.
//
// FERMÉ PAR DÉFAUT. Un JSON libre n'a pas de schéma : on ne cherche donc pas les
// clés à effacer, on nomme ce qu'on a le droit de GARDER. Toute chaîne est
// remplacée, à n'importe quelle profondeur, SAUF :
//  - une forme technique qui ne porte rien de personnel : ObjectId, UUID, date
//    ISO, nombre court écrit en chaîne, emoji ;
//  - une valeur synthétique, reconnue à sa forme COMPLÈTE (jamais un préfixe) ;
//  - sous une clé de la liste BLANCHE (énumérations : `kind`, `type`, `status`,
//    `language`…, ou suffixe `Id`/`Type`/`Language`/…), une valeur qui a la
//    forme d'une énumération (minuscules, MAJUSCULES_SOULIGNÉES, camelCase,
//    locale, MIME, couleur, heure, version), sans e-mail, IP ni numéro, et dont
//    aucun mot n'est un mot d'identité d'un compte de la base.
// La politique `settings` (réglages) étend cette tolérance à toute clé.
//
// Ce qui n'est pas une chaîne n'est pas gardé pour autant : sous une clé de
// secret (`…Key`, `…Code`, `token`, `otp`…) TOUTE valeur part ; sous une clé de
// lieu (`location`, `center`, `coordinates`…) tout nombre devient une
// coordonnée synthétique et tout texte part ; un numéro écrit en nombre, une
// date de naissance, un binaire sont remplacés ; une CLÉ d'objet qui n'a pas la
// forme d'un identifiant (ou qui nomme un compte) est renommée.
//
// Le contrôle (`jsonViolations`) rejoue la même loi en lecture seule.

import * as s from './synth.mjs';
import { normalizePhone } from './context.mjs';

export { normalizePhone };

const keySet = (...keys) => new Set(keys.map((k) => k.toLowerCase()));

const TEXT_KEYS = keySet(
  'text', 'translatedText', 'content', 'caption', 'alt', 'title', 'subtitle', 'body', 'message',
  'preview', 'messagePreview', 'description', 'summary', 'transcript', 'transcription', 'originalText',
  'comment', 'note', 'notes', 'reason', 'word', 'label', 'conversationTitle', 'conversationName',
  'quote', 'bio', 'question', 'answer',
);
const PERSON_KEYS = keySet('displayName', 'firstName', 'lastName', 'fullName', 'nickname', 'senderName', 'authorName', 'actorName', 'reporterName', 'participantName');
const USERNAME_KEYS = keySet('username', 'handle', 'newUsername', 'oldUsername');
const EMAIL_KEYS = keySet('email', 'emails', 'pendingEmail');
const PHONE_KEYS = keySet('phone', 'phoneNumber', 'phoneNumbers', 'mobile');
const PHONE_FAMILY = /phone|mobile|msisdn|whatsapp/i;
const IP_KEYS = keySet('ip', 'ipAddress', 'clientIp', 'remoteAddress', 'remoteIp');
const UA_KEYS = keySet('userAgent', 'ua');
const MEDIA_KEYS = keySet(
  'url', 'fileUrl', 'audioUrl', 'videoUrl', 'imageUrl', 'thumbnailUrl', 'coverUrl', 'subtitleUrl',
  'avatar', 'avatarUrl', 'banner', 'bannerUrl', 'photo', 'photoUrl', 'image', 'src', 'path',
  'filePath', 'thumbnailPath', 'audioPath', 'localPath', 'uri', 'virtualBackgroundUrl',
);
const FILE_NAME_KEYS = keySet('fileName', 'originalName', 'filename');
const FINGERPRINT_KEYS = keySet('deviceFingerprint', 'fingerprint');
const GEO_NUMBER_KEYS = keySet('latitude', 'longitude', 'lat', 'lng', 'lon');
const GEO_CONTAINER_KEYS = keySet('location', 'loc', 'geo', 'geoPoint', 'coords', 'coordinates', 'center', 'centre', 'gps', 'latLng', 'place', 'venue', 'geometry');
const GEO_TEXT_KEYS = keySet('address', 'city', 'region', 'street', 'placeName', 'locationName', 'geoLocation', 'geoCoordinates', 'formattedAddress', 'postalCode', 'zipCode');
const GEO_TEXT_FAMILY = /(city|address|street|postalCode|zipCode|ssid|wifi)$/i;
const BIRTH_FAMILY = /birth|^dob$|naissance|anniversaire/i;

const SAFE_KEYS = keySet(
  'id', '_id', 'type', 'kind', 'mode', 'status', 'state', 'format', 'mimeType', 'codec', 'language', 'languages',
  'locale', 'country', 'translationModel', 'model', 'ttsModel', 'provider', 'engine', 'version', 'emoji',
  'reaction', 'icon', 'color', 'accentColor', 'theme', 'platform', 'source', 'medium', 'action', 'event',
  'severity', 'level', 'role', 'scope', 'category', 'plane', 'unit', 'currency', 'encoding', 'algorithm',
  'quality', 'visibility', 'priority', 'channel', 'transport', 'direction', 'axis', 'bucket',
  'template', 'font', 'fontFamily', 'align', 'alignment', 'fit', 'blend', 'filter', 'effect', 'transition',
  'easing', 'animation', 'shape', 'style', 'variant', 'size', 'position', 'anchor', 'orientation', 'aspectRatio',
  'precision', 'outcome', 'trigger', 'surface', 'consent', 'reactionType', 'notificationLocKey', 'locKey',
  'timezone', 'currentNode', 'languageCode', 'countryCode', 'currencyCode', 'errorCode', 'statusCode',
);
const SAFE_SUFFIX = /(Id|Ids|At|Language|Languages|Type|Kind|Status|Mode|Model|Format|Version|Level|Locale)$/;
const PASCAL_KEYS = keySet('type', 'kind', '__typename');
const SECRET_KEY = /token|secret|password|passwd|passphrase|credential|otp|salt$|nonce|cipher|private|hmac|(?:key|keys|code|codes|pin)$/i;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const E164_RE = /^\+\d{8,15}$/;
const PHONE_LIKE = /\+?\d[\d\s().-]{7,}\d/;
const TECHNICAL = [
  /^[0-9a-f]{24}$/i,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/,
  /^-?\d{1,6}(\.\d{1,3})?$/,
  /^[^\p{L}\p{N}\s]{1,16}$/u,
];
const ENUM_SHAPES = [
  /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/,
  /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/,
  /^[a-z]+(?:[A-Z][a-z0-9]*)+$/,
  /^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})+$/,
  /^[a-z]+\/[a-z0-9.+-]{1,40}$/,
  /^#[0-9a-f]{3,8}$/i,
  /^\d{1,2}:\d{2}(?::\d{2})?$/,
  /^v?\d+(?:\.\d+){1,3}$/,
];
const PASCAL = /^[A-Z][a-z]+(?:[A-Z][a-z0-9]+)*$/;
const IDENTIFIER_KEY = /^[A-Za-z_$][A-Za-z0-9_$-]{0,63}$/;
const KEPT_BSON = new Set(['ObjectId', 'Long', 'Int32', 'Double', 'Decimal128', 'Timestamp', 'MinKey', 'MaxKey']);

function looksLikeIpv6(v) {
  return (v.match(/[0-9a-f:]{2,}/gi) ?? []).some((c) => (c.includes('::') && /[0-9a-f]/i.test(c.replace(/:/g, ''))) || (c.split(':').length >= 5 && c.split(':').every((g) => /^[0-9a-f]{0,4}$/i.test(g))));
}

const isTechnical = (v) => v === '' || TECHNICAL.some((re) => re.test(v));

function isSynthetic(v) {
  return (
    s.isSyntheticText(v) || s.isSyntheticName(v) || s.isSyntheticUsername(v) || s.isSyntheticEmail(v) ||
    s.isSyntheticPhone(v) || s.isSyntheticIp(v) || s.isSyntheticToken(v) || s.isPlaceholderPath(v) ||
    s.isSyntheticFileName(v) || v === s.SYNTHETIC_USER_AGENT || v === s.SYNTHETIC_DEVICE
  );
}

const hasPersonalPattern = (v) => new RegExp(EMAIL_RE.source).test(v) || new RegExp(IPV4_RE.source).test(v) || PHONE_LIKE.test(v) || looksLikeIpv6(v);
const namesSomeone = (v, ctx) => typeof ctx.namesSomeone === 'function' && ctx.namesSomeone(v);
const isSafeKey = (key) => SAFE_KEYS.has(key.toLowerCase()) || SAFE_SUFFIX.test(key);
const isSecretKey = (key) => !SAFE_KEYS.has(key.toLowerCase()) && SECRET_KEY.test(key);

/** Une valeur qu'une clé de la liste blanche (ou un réglage) a le droit de garder. */
function admissibleEnum(key, v, ctx) {
  if (v.length > 40) return false;
  const shaped = ENUM_SHAPES.some((re) => re.test(v)) || (key !== null && PASCAL_KEYS.has(key.toLowerCase()) && PASCAL.test(v));
  return shaped && !hasPersonalPattern(v) && !namesSomeone(v, ctx);
}

function keeps(key, v, ctx, policy) {
  if (isTechnical(v) || isSynthetic(v)) return true;
  if (key !== null && GEO_TEXT_FAMILY.test(key)) return false;
  const enumKey = policy === 'settings' || (key !== null && isSafeKey(key));
  return enumKey && admissibleEnum(key, v, ctx);
}

/** Valeur synthétique TYPÉE pour une chaîne entière qui EST un identifiant personnel. */
function typedByShape(v, ctx, seed) {
  if (new RegExp(`^${EMAIL_RE.source}$`).test(v)) return ctx.recall?.('email', v) ?? s.email(ctx.salt, ...seed);
  if (E164_RE.test(v)) return ctx.recall?.('phone', v) ?? s.phone(ctx.salt, ...seed);
  if (new RegExp(`^${IPV4_RE.source}$`).test(v) || looksLikeIpv6(v)) return s.ipv4(ctx.salt, ...seed);
  return null;
}

function fallback(key, v, ctx, seed, policy) {
  if (keeps(key, v, ctx, policy)) return v;
  return typedByShape(v, ctx, seed) ?? (v.length > 40 || /\s/.test(v) ? s.sentence(ctx.salt, ...seed) : s.label(ctx.salt, ...seed));
}

const idOf = (raw) => (typeof raw === 'string' ? raw : raw?._bsontype === 'ObjectId' ? raw.toHexString() : null);

function personOf(obj, ctx) {
  const id = idOf(obj.userId) ?? idOf(obj.id);
  return id && ctx.users ? ctx.users.get(id) ?? null : null;
}

function personValue(key, person, ctx, seed) {
  if (!person) return key === 'firstname' || key === 'nickname' ? s.firstName(ctx.salt, ...seed) : key === 'lastname' ? s.lastName(ctx.salt, ...seed) : s.fullName(ctx.salt, ...seed);
  if (key === 'firstname' || key === 'nickname') return person.firstName;
  if (key === 'lastname') return person.lastName;
  return person.displayName ?? `${person.firstName} ${person.lastName}`;
}

function mapStrings(value, fn) {
  if (typeof value === 'string') return value === '' ? value : fn(value, 0);
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value.map((v, i) => (v === '' ? v : fn(v, i)));
  return undefined;
}

function mediaPlaceholder(original, obj, media) {
  if (s.isPlaceholderPath(original)) return original;
  const target = s.placeholderFor({ mimeType: obj.mimeType ?? obj.format, path: original });
  media?.(original, target);
  return target;
}

function typedByKey(k, value, obj, ctx, at, media) {
  if (TEXT_KEYS.has(k)) return mapStrings(value, (v, i) => (isSynthetic(v) ? v : s.sentence(ctx.salt, ...at(i))));
  if (PERSON_KEYS.has(k)) return mapStrings(value, (_, i) => personValue(k, personOf(obj, ctx), ctx, at(i)));
  if (USERNAME_KEYS.has(k)) return mapStrings(value, (v, i) => ctx.recall?.('username', v) ?? personOf(obj, ctx)?.username ?? (s.isSyntheticUsername(v) ? v : s.username(ctx.salt, ...at(i))));
  if (EMAIL_KEYS.has(k)) return mapStrings(value, (v, i) => ctx.recall?.('email', v) ?? (s.isSyntheticEmail(v) ? v : s.email(ctx.salt, ...at(i))));
  if (PHONE_KEYS.has(k)) return mapStrings(value, (v, i) => ctx.recall?.('phone', v) ?? (s.isSyntheticPhone(v) ? v : s.phone(ctx.salt, ...at(i))));
  if (IP_KEYS.has(k)) return mapStrings(value, (v, i) => (s.isSyntheticIp(v) ? v : s.ipv4(ctx.salt, ...at(i))));
  if (UA_KEYS.has(k)) return mapStrings(value, () => s.SYNTHETIC_USER_AGENT);
  if (FINGERPRINT_KEYS.has(k)) return mapStrings(value, (_, i) => s.fingerprint(ctx.salt, ...at(i)));
  if (FILE_NAME_KEYS.has(k)) return mapStrings(value, (v, i) => (s.isSyntheticFileName(v) ? v : s.fileName(ctx.salt, v, ...at(i))));
  if (MEDIA_KEYS.has(k)) return mapStrings(value, (v) => mediaPlaceholder(v, obj, media));
  return undefined;
}

const isBsonValue = (value) => value?._bsontype !== undefined;
const isUuidBinary = (value) => value?._bsontype === 'Binary' && value.sub_type === 4 && value.length() === 16;
/** Ce qui reste tel quel : nombres, booléens, dates valides, ObjectId et scalaires BSON, UUID binaires. */
const keptScalar = (value) => typeof value === 'number' || typeof value === 'boolean' || (value instanceof Date) || (isBsonValue(value) && (KEPT_BSON.has(value._bsontype) || isUuidBinary(value)));
const isOpaqueBinary = (value) => Buffer.isBuffer(value) || value instanceof Uint8Array || (isBsonValue(value) && !KEPT_BSON.has(value._bsontype) && !isUuidBinary(value));

function geoValue(key, value, ctx, seed) {
  if (typeof value === 'number') return s.coordinate(ctx.salt, ...seed);
  if (typeof value === 'string') return key !== null && PASCAL_KEYS.has(key.toLowerCase()) && admissibleEnum(key, value, ctx) ? value : null;
  if (Array.isArray(value)) return value.map((v, i) => geoValue(null, v, ctx, [...seed, i]));
  if (value === null || value === undefined || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v], i) => [scrubKeyName(k, ctx, seed, i), geoValue(k, v, ctx, [...seed, k])]));
}

function birthValue(value, ctx, seed) {
  const fresh = s.date(ctx.salt, 1970, 30, ...seed, 'birth');
  if (value instanceof Date) return fresh;
  if (typeof value === 'number') return fresh.getTime();
  if (typeof value === 'string') return fresh.toISOString();
  return null;
}

function scrubEntry(key, value, obj, ctx, seed, media, policy) {
  const k = key.toLowerCase();
  const at = (i) => [...seed, key, i];
  if (value === null || value === undefined) return value;
  if (isSecretKey(key)) return typeof value === 'boolean' ? value : null;
  if (GEO_NUMBER_KEYS.has(k) && typeof value === 'number') return s.coordinate(ctx.salt, ...seed, key);
  if (GEO_NUMBER_KEYS.has(k) && typeof value === 'string') return String(s.coordinate(ctx.salt, ...seed, key));
  if (GEO_CONTAINER_KEYS.has(k)) return geoValue(null, value, ctx, [...seed, key]);
  if (GEO_TEXT_KEYS.has(k) && typeof value === 'string') return null;
  if (BIRTH_FAMILY.test(key)) return birthValue(value, ctx, [...seed, key]);
  if (PHONE_FAMILY.test(key) && typeof value === 'number') return s.phone(ctx.salt, ...seed, key);
  const typed = typedByKey(k, value, obj, ctx, at, media);
  if (typed !== undefined) return typed;
  if (typeof value === 'string') return fallback(key, value, ctx, [...seed, key], policy);
  if (Array.isArray(value)) return value.map((v, i) => (typeof v === 'string' ? fallback(key, v, ctx, at(i), policy) : scrubJson(v, ctx, at(i), media, policy)));
  return scrubJson(value, ctx, [...seed, key], media, policy);
}

/** Une clé d'objet qu'on garde : forme technique, synthétique, ou identifiant qui ne nomme personne. */
function keyKept(key, ctx) {
  if (isTechnical(key) || isSynthetic(key)) return true;
  return IDENTIFIER_KEY.test(key) && !hasPersonalPattern(key) && !namesSomeone(key, ctx);
}

function scrubKeyName(key, ctx, seed, index) {
  if (keyKept(key, ctx)) return key;
  return typedByShape(key, ctx, [...seed, 'clé', index]) ?? s.keyName(ctx.salt, ...seed, index);
}

/**
 * Rend une COPIE nettoyée de `value`. `seed` situe la valeur (identifiant du
 * document + chemin), `media(original, remplaçant)` est appelé pour chaque
 * référence de fichier remplacée — c'est lui qui alimente le manifeste.
 * `policy` : `strict` (défaut) ou `settings`.
 */
export function scrubJson(value, ctx, seed, media, policy = 'strict') {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return fallback(null, value, ctx, seed, policy);
  if (Array.isArray(value)) return value.map((v, i) => scrubJson(v, ctx, [...seed, i], media, policy));
  if (keptScalar(value)) return value;
  if (isOpaqueBinary(value) || typeof value !== 'object') return null;
  return Object.fromEntries(
    Object.entries(value).map(([key, v], i) => [scrubKeyName(key, ctx, seed, i), scrubEntry(key, v, value, ctx, seed, media, policy)]),
  );
}

/** Une chaîne de premier niveau soumise à la loi d'un réglage (énumération gardée, le reste remplacé). */
export function scrubSetting(value, ctx, seed) {
  return typeof value === 'string' ? fallback(null, value, ctx, seed, 'settings') : value;
}

const KEY_CHECKS = [
  [TEXT_KEYS, s.isSyntheticText, 'texte'],
  [PERSON_KEYS, s.isSyntheticName, 'nom'],
  [USERNAME_KEYS, (v, ctx) => s.isSyntheticUsername(v) || ctx.keptUsernames?.has(v), 'pseudo'],
  [EMAIL_KEYS, s.isSyntheticEmail, 'e-mail'],
  [PHONE_KEYS, s.isSyntheticPhone, 'téléphone'],
  [IP_KEYS, s.isSyntheticIp, 'IP'],
  [UA_KEYS, (v) => v === s.SYNTHETIC_USER_AGENT, 'agent'],
  [FINGERPRINT_KEYS, s.isSyntheticToken, 'empreinte'],
  [FILE_NAME_KEYS, s.isSyntheticFileName, 'nom de fichier'],
  [MEDIA_KEYS, s.isPlaceholderPath, 'fichier'],
  [GEO_TEXT_KEYS, () => false, 'lieu'],
];

function stringViolation(key, v, ctx, policy, path) {
  if (new RegExp(EMAIL_RE.source).test(v) && !s.isSyntheticEmail(v)) return { path, rule: 'e-mail hors domaine réservé' };
  if ((v.match(IPV4_RE) ?? []).some((m) => !s.isSyntheticIp(m)) || (looksLikeIpv6(v) && !s.isSyntheticIp(v))) return { path, rule: 'adresse IP hors plage de documentation' };
  if (E164_RE.test(v) && !s.isSyntheticPhone(v)) return { path, rule: 'numéro hors plage fictive' };
  const typed = key === null ? null : KEY_CHECKS.find(([keys]) => keys.has(key.toLowerCase()));
  if (typed) return v === '' || typed[1](v, ctx) ? null : { path, rule: `${typed[2]} non synthétique` };
  return keeps(key, v, ctx, policy) ? null : { path, rule: 'texte libre non synthétique' };
}

const isNullish = (v) => v === null || v === undefined;

function geoViolations(value, ctx, path, key = null) {
  if (isNullish(value)) return [];
  if (typeof value === 'number') return s.isSyntheticCoordinate(value) ? [] : [{ path, rule: 'coordonnée réelle' }];
  if (typeof value === 'string') return key !== null && PASCAL_KEYS.has(key.toLowerCase()) && admissibleEnum(key, value, ctx) ? [] : [{ path, rule: 'lieu en clair' }];
  if (Array.isArray(value)) return value.flatMap((v, i) => geoViolations(v, ctx, `${path}[${i}]`));
  if (typeof value !== 'object' || value instanceof Date) return [];
  return Object.entries(value).flatMap(([k, v]) => [...(keyKept(k, ctx) ? [] : [{ path: `${path}.${k}`, rule: 'clé porteuse d’un identifiant personnel' }]), ...geoViolations(v, ctx, `${path}.${k}`, k)]);
}

function entryViolations(k, v, ctx, policy, here) {
  const lower = k.toLowerCase();
  if (isNullish(v)) return [];
  if (isSecretKey(k)) return typeof v === 'boolean' || s.isSyntheticToken(v) ? [] : [{ path: here, rule: 'secret conservé' }];
  if (GEO_NUMBER_KEYS.has(lower)) {
    const n = typeof v === 'string' ? Number(v) : v;
    return typeof n === 'number' && s.isSyntheticCoordinate(n) ? [] : [{ path: here, rule: 'coordonnée réelle' }];
  }
  if (GEO_CONTAINER_KEYS.has(lower)) return geoViolations(v, ctx, here);
  if (BIRTH_FAMILY.test(k)) return s.isSyntheticDate(v) || s.isSyntheticDateText(v) || s.isSyntheticDateNumber(v) ? [] : [{ path: here, rule: 'date de naissance réelle' }];
  if (PHONE_FAMILY.test(k) && typeof v === 'number') return [{ path: here, rule: 'numéro écrit en nombre' }];
  return jsonViolations(v, ctx, policy, here, k);
}

/** Les chemins d'un JSON nettoyé qui gardent une forme réelle. Ne rend jamais la valeur. */
export function jsonViolations(value, ctx, policy = 'strict', path = '', key = null) {
  if (isNullish(value)) return [];
  if (typeof value === 'string') {
    const v = stringViolation(key, value, ctx, policy, path);
    return v ? [v] : [];
  }
  if (Array.isArray(value)) return value.flatMap((x, i) => jsonViolations(x, ctx, policy, `${path}[${i}]`, key));
  if (keptScalar(value)) return [];
  if (isOpaqueBinary(value) || typeof value !== 'object') return [{ path, rule: 'binaire ou valeur opaque conservé' }];
  return Object.entries(value).flatMap(([k, v]) => {
    const here = path ? `${path}.${k}` : k;
    const keyLeak = keyKept(k, ctx) ? [] : [{ path: here, rule: 'clé porteuse d’un identifiant personnel' }];
    return [...keyLeak, ...entryViolations(k, v, ctx, policy, here)];
  });
}

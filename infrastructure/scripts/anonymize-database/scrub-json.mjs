// Nettoyage des champs JSON libres (traductions, transcriptions, métadonnées,
// contextes de notification, effets de story, réglages, analytics…) et son
// contrôle.
//
// FERMÉ PAR DÉFAUT. Un JSON libre n'a pas de schéma : on ne cherche donc pas les
// clés à effacer, on nomme celles qu'on a le droit de GARDER. Toute chaîne est
// remplacée, à n'importe quelle profondeur, dans les objets comme dans les
// tableaux, SAUF :
//  - une forme technique qui ne peut rien porter de personnel : ObjectId,
//    UUID, condensé hexadécimal, date ISO, nombre écrit en chaîne, emoji ;
//  - une valeur déjà synthétique (relancer ne réécrit pas le synthétique) ;
//  - sous une clé de la liste BLANCHE (énumérations : `kind`, `type`, `status`,
//    `language`, `format`, `mimeType`…, ou suffixe `Id`/`Type`/`Language`/…),
//    une valeur courte d'un seul mot, sans e-mail, IP ni numéro, et qui ne
//    contient le nom, le pseudo ou l'adresse d'aucun compte de la base.
// La politique `settings` (réglages d'interface) étend cette tolérance à toute
// clé : un réglage est une énumération, un texte libre ou un chemin y est remplacé.
// Nombres, booléens, dates et binaires restent. Les clés connues reçoivent une
// valeur synthétique TYPÉE (e-mail, numéro, IP, nom, fichier…), les autres un
// libellé synthétique.
//
// Le contrôle (`jsonViolations`) rejoue la même loi en lecture seule : toute
// chaîne qui n'est ni technique, ni synthétique, ni une énumération admise est
// une violation.

import * as s from './synth.mjs';

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
const GEO_TEXT_KEYS = keySet('address', 'city', 'region', 'street', 'placeName', 'locationName', 'geoLocation', 'geoCoordinates', 'formattedAddress', 'venue');
const SECRET_KEY = /token|secret|password|passwd|api_?key|private_?key|credential|^otp|otpCode|^salt$|nonce/i;

const SAFE_KEYS = keySet(
  'id', '_id', 'type', 'kind', 'mode', 'status', 'state', 'format', 'mimeType', 'codec', 'language', 'languages',
  'locale', 'country', 'translationModel', 'model', 'ttsModel', 'provider', 'engine', 'version', 'emoji',
  'reaction', 'icon', 'color', 'accentColor', 'theme', 'platform', 'source', 'medium', 'action', 'event',
  'severity', 'level', 'role', 'scope', 'category', 'plane', 'unit', 'currency', 'encoding', 'algorithm',
  'quality', 'visibility', 'priority', 'channel', 'transport', 'direction', 'code', 'slug', 'axis', 'bucket',
  'template', 'font', 'fontFamily', 'align', 'alignment', 'fit', 'blend', 'filter', 'effect', 'transition',
  'easing', 'animation', 'shape', 'style', 'variant', 'size', 'position', 'anchor', 'orientation', 'aspectRatio',
  'precision', 'outcome', 'trigger', 'surface', 'consent', 'reactionType', 'notificationLocKey', 'locKey',
  'timezone', 'currentNode',
);
const SAFE_SUFFIX = /(Id|Ids|At|Language|Languages|Type|Kind|Status|Mode|Model|Format|Code|Key|Version|Level|Locale)$/;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const E164_RE = /^\+\d{8,15}$/;
const PHONE_LIKE = /\+?\d[\d\s().-]{7,}\d/;
const TECHNICAL = [
  /^[0-9a-f]{24}$/i,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^(?=.*[a-f])[0-9a-f]{16,}$/i,
  /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/,
  /^-?\d{1,6}(\.\d+)?$/,
  /^[^\p{L}\p{N}\s]{1,16}$/u,
];
const IPV6 = /^(?=[0-9a-f:]*::)[0-9a-f:]{2,39}$|^(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i;
const TOKEN = /^[A-Za-z0-9_.:#+-]{1,40}$/;
const MIME = /^[a-z]+\/[a-z0-9.+-]{1,40}$/;

const isTechnical = (v) => v === '' || TECHNICAL.some((re) => re.test(v));

function isSynthetic(v) {
  return (
    s.isSyntheticText(v) || s.isSyntheticName(v) || s.isSyntheticUsername(v) || s.isSyntheticEmail(v) ||
    s.isSyntheticPhone(v) || s.isSyntheticIp(v) || s.isSyntheticToken(v) || s.isPlaceholderPath(v) ||
    v === s.SYNTHETIC_USER_AGENT || v === s.SYNTHETIC_DEVICE
  );
}

const hasPersonalPattern = (v) => new RegExp(EMAIL_RE.source).test(v) || new RegExp(IPV4_RE.source).test(v) || PHONE_LIKE.test(v);

function namesSomeone(v, ctx) {
  if (!ctx.identityWords || ctx.identityWords.size === 0) return false;
  return v.toLowerCase().split(/[^\p{L}\p{N}]+/u).some((part) => part.length >= 3 && ctx.identityWords.has(part));
}

const isSafeKey = (key) => SAFE_KEYS.has(key.toLowerCase()) || SAFE_SUFFIX.test(key);

/** Une valeur qu'une clé de la liste blanche (ou un réglage) a le droit de garder. */
function admissibleEnum(v, ctx) {
  return (TOKEN.test(v) || MIME.test(v)) && !hasPersonalPattern(v) && !namesSomeone(v, ctx);
}

function keeps(key, v, ctx, policy) {
  if (isTechnical(v) || isSynthetic(v)) return true;
  const enumKey = policy === 'settings' || (key !== null && isSafeKey(key));
  return enumKey && admissibleEnum(v, ctx);
}

/** Valeur synthétique TYPÉE pour une chaîne entière qui EST un identifiant personnel. */
function typedByShape(v, ctx, seed) {
  if (new RegExp(`^${EMAIL_RE.source}$`).test(v)) return ctx.byEmail?.get(v.toLowerCase()) ?? s.email(ctx.salt, ...seed);
  if (E164_RE.test(v)) return ctx.byPhone?.get(normalizePhone(v)) ?? s.phone(ctx.salt, ...seed);
  if (new RegExp(`^${IPV4_RE.source}$`).test(v) || IPV6.test(v)) return s.ipv4(ctx.salt, ...seed);
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
  if (USERNAME_KEYS.has(k)) return mapStrings(value, (v, i) => ctx.byUsername?.get(v.toLowerCase()) ?? personOf(obj, ctx)?.username ?? (s.isSyntheticUsername(v) ? v : s.username(ctx.salt, ...at(i))));
  if (EMAIL_KEYS.has(k)) return mapStrings(value, (v, i) => ctx.byEmail?.get(v.toLowerCase()) ?? (s.isSyntheticEmail(v) ? v : s.email(ctx.salt, ...at(i))));
  if (PHONE_KEYS.has(k)) return mapStrings(value, (v, i) => ctx.byPhone?.get(normalizePhone(v)) ?? (s.isSyntheticPhone(v) ? v : s.phone(ctx.salt, ...at(i))));
  if (IP_KEYS.has(k)) return mapStrings(value, (v, i) => (s.isSyntheticIp(v) ? v : s.ipv4(ctx.salt, ...at(i))));
  if (UA_KEYS.has(k)) return mapStrings(value, () => s.SYNTHETIC_USER_AGENT);
  if (FINGERPRINT_KEYS.has(k)) return mapStrings(value, (_, i) => s.fingerprint(ctx.salt, ...at(i)));
  if (FILE_NAME_KEYS.has(k)) return mapStrings(value, (v, i) => (s.isSyntheticFileName(v) ? v : s.fileName(ctx.salt, v, ...at(i))));
  if (MEDIA_KEYS.has(k)) return mapStrings(value, (v) => mediaPlaceholder(v, obj, media));
  return undefined;
}

function scrubEntry(key, value, obj, ctx, seed, media, policy) {
  const k = key.toLowerCase();
  const at = (i) => [...seed, key, i];
  if (SECRET_KEY.test(key) && typeof value === 'string') return null;
  if (GEO_NUMBER_KEYS.has(k) && typeof value === 'number') return s.coordinate(ctx.salt, ...seed, key);
  if (k === 'coordinates' && Array.isArray(value) && value.every((v) => typeof v === 'number')) {
    return value.map((_, i) => s.coordinate(ctx.salt, ...seed, key, i));
  }
  if ((k === 'coordinates' || GEO_TEXT_KEYS.has(k)) && typeof value === 'string') return null;
  const typed = typedByKey(k, value, obj, ctx, at, media);
  if (typed !== undefined) return typed;
  if (typeof value === 'string') return fallback(key, value, ctx, [...seed, key], policy);
  if (Array.isArray(value)) return value.map((v, i) => (typeof v === 'string' ? fallback(key, v, ctx, at(i), policy) : scrubJson(v, ctx, at(i), media, policy)));
  return scrubJson(value, ctx, [...seed, key], media, policy);
}

function scrubKeyName(key, ctx, seed) {
  return isSynthetic(key) ? key : typedByShape(key, ctx, [...seed, 'clé']) ?? key;
}

export function normalizePhone(value) {
  return typeof value === 'string' ? value.replace(/[^\d+]/g, '') : value;
}

const isBinary = (value) => value?._bsontype !== undefined || Buffer.isBuffer(value);

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
  if (typeof value !== 'object' || value instanceof Date || isBinary(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [scrubKeyName(key, ctx, seed), scrubEntry(key, v, value, ctx, seed, media, policy)]),
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
  if (new RegExp(EMAIL_RE.source).test(v) && (v.match(EMAIL_RE) ?? []).some((m) => !s.isSyntheticEmail(m))) return { path, rule: 'e-mail hors domaine réservé' };
  if ((v.match(IPV4_RE) ?? []).some((m) => !s.isSyntheticIp(m))) return { path, rule: 'adresse IPv4 hors plage de documentation' };
  if (E164_RE.test(v) && !s.isSyntheticPhone(v)) return { path, rule: 'numéro hors plage fictive' };
  if (key !== null && SECRET_KEY.test(key)) return s.isSyntheticToken(v) ? null : { path, rule: 'secret conservé' };
  const typed = key === null ? null : KEY_CHECKS.find(([keys]) => keys.has(key.toLowerCase()));
  if (typed) return v === '' || typed[1](v, ctx) ? null : { path, rule: `${typed[2]} non synthétique` };
  if (isTechnical(v) || isSynthetic(v)) return null;
  const enumKey = policy === 'settings' || (key !== null && isSafeKey(key));
  if (enumKey && (TOKEN.test(v) || MIME.test(v)) && !hasPersonalPattern(v)) return null;
  return { path, rule: 'texte libre non synthétique' };
}

/** Les chemins d'un JSON nettoyé qui gardent une forme réelle. Ne rend jamais la valeur. */
export function jsonViolations(value, ctx, policy = 'strict', path = '', key = null) {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') {
    const v = stringViolation(key, value, ctx, policy, path);
    return v ? [v] : [];
  }
  if (Array.isArray(value)) return value.flatMap((x, i) => jsonViolations(x, ctx, policy, `${path}[${i}]`, key));
  if (typeof value !== 'object' || value instanceof Date || isBinary(value)) return [];
  return Object.entries(value).flatMap(([k, v]) => {
    const here = path ? `${path}.${k}` : k;
    const keyLeak = !isSynthetic(k) && typedByShape(k, { salt: '' }, []) !== null ? [{ path: here, rule: 'clé porteuse d’un identifiant personnel' }] : [];
    if (GEO_NUMBER_KEYS.has(k.toLowerCase()) && typeof v === 'number') {
      return [...keyLeak, ...(s.isSyntheticCoordinate(v) ? [] : [{ path: here, rule: 'coordonnée réelle' }])];
    }
    return [...keyLeak, ...jsonViolations(v, ctx, policy, here, k)];
  });
}

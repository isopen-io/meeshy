// Nettoyage des champs JSON libres (traductions, transcriptions, métadonnées,
// contextes de notification, effets de story…) et son contrôle.
//
// Deux filets superposés, parce qu'un JSON libre n'a pas de schéma :
//  1. par CLÉ — une clé qui porte une donnée personnelle (`text`, `email`,
//     `url`, `latitude`…) reçoit une valeur synthétique, où qu'elle soit ;
//  2. par VALEUR — dans TOUTE chaîne restante, une adresse e-mail, une adresse
//     IPv4 ou un numéro E.164 est remplacé, quelle que soit sa clé (un candidat
//     ICE porte une adresse IP sous la clé `candidate`).
// Le contrôle (`jsonViolations`) rejoue les deux règles en lecture seule.

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
  'filePath', 'thumbnailPath', 'audioPath', 'localPath', 'uri',
);
const FILE_NAME_KEYS = keySet('fileName', 'originalName', 'filename');
const FINGERPRINT_KEYS = keySet('deviceFingerprint', 'fingerprint');
const GEO_NUMBER_KEYS = keySet('latitude', 'longitude', 'lat', 'lng', 'lon');
const GEO_TEXT_KEYS = keySet('address', 'city', 'region', 'street', 'placeName', 'locationName', 'geoLocation', 'geoCoordinates', 'formattedAddress', 'venue');
const SECRET_KEYS = keySet('token', 'secret', 'password', 'apiKey', 'refreshToken', 'accessToken', 'sessionToken', 'privateKey');

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const E164_RE = /^\+\d{8,15}$/;

function scrubValueText(value, ctx, seed) {
  if (E164_RE.test(value) && !s.isSyntheticPhone(value)) return s.phone(ctx.salt, ...seed);
  return value
    .replace(EMAIL_RE, (m) => (s.isSyntheticEmail(m) ? m : s.email(ctx.salt, ...seed, m.length)))
    .replace(IPV4_RE, (m) => (s.isSyntheticIp(m) ? m : s.ipv4(ctx.salt, ...seed, m.length)));
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

function scrubKey(key, value, obj, ctx, seed, media) {
  const k = key.toLowerCase();
  const at = (i) => [...seed, key, i];
  if (SECRET_KEYS.has(k)) return typeof value === 'string' ? null : value;
  if (GEO_NUMBER_KEYS.has(k) && typeof value === 'number') return s.coordinate(ctx.salt, ...seed, key);
  if (k === 'coordinates' && Array.isArray(value) && value.every((v) => typeof v === 'number')) {
    return value.map((_, i) => s.coordinate(ctx.salt, ...seed, key, i));
  }
  if (k === 'coordinates' && typeof value === 'string') return null;
  if (GEO_TEXT_KEYS.has(k) && typeof value === 'string') return null;
  const replaced =
    TEXT_KEYS.has(k) ? mapStrings(value, (_, i) => s.sentence(ctx.salt, ...at(i)))
    : PERSON_KEYS.has(k) ? mapStrings(value, (_, i) => personValue(k, personOf(obj, ctx), ctx, at(i)))
    : USERNAME_KEYS.has(k) ? mapStrings(value, (v, i) => ctx.byUsername?.get(v.toLowerCase()) ?? personOf(obj, ctx)?.username ?? s.username(ctx.salt, ...at(i)))
    : EMAIL_KEYS.has(k) ? mapStrings(value, (v, i) => ctx.byEmail?.get(v.toLowerCase()) ?? s.email(ctx.salt, ...at(i)))
    : PHONE_KEYS.has(k) ? mapStrings(value, (v, i) => ctx.byPhone?.get(normalizePhone(v)) ?? s.phone(ctx.salt, ...at(i)))
    : IP_KEYS.has(k) ? mapStrings(value, (_, i) => s.ipv4(ctx.salt, ...at(i)))
    : UA_KEYS.has(k) ? mapStrings(value, () => s.SYNTHETIC_USER_AGENT)
    : FINGERPRINT_KEYS.has(k) ? mapStrings(value, (_, i) => s.fingerprint(ctx.salt, ...at(i)))
    : FILE_NAME_KEYS.has(k) ? mapStrings(value, (v, i) => s.fileName(ctx.salt, v, ...at(i)))
    : MEDIA_KEYS.has(k) ? mapStrings(value, (v) => mediaPlaceholder(v, obj, media))
    : undefined;
  return replaced === undefined ? scrubJson(value, ctx, [...seed, key], media) : replaced;
}

function mediaPlaceholder(original, obj, media) {
  if (s.isPlaceholderPath(original)) return original;
  const target = s.placeholderFor({ mimeType: obj.mimeType ?? obj.format, path: original });
  media?.(original, target);
  return target;
}

export function normalizePhone(value) {
  return typeof value === 'string' ? value.replace(/[^\d+]/g, '') : value;
}

/**
 * Rend une COPIE nettoyée de `value`. `seed` situe la valeur (identifiant du
 * document + chemin), `media(original, remplaçant)` est appelé pour chaque
 * référence de fichier remplacée — c'est lui qui alimente le manifeste.
 */
export function scrubJson(value, ctx, seed, media) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubValueText(value, ctx, seed);
  if (Array.isArray(value)) return value.map((v, i) => scrubJson(v, ctx, [...seed, i], media));
  if (typeof value !== 'object' || value instanceof Date || isBinary(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, scrubKey(key, v, value, ctx, seed, media)]));
}

function isBinary(value) {
  return value?._bsontype !== undefined || Buffer.isBuffer(value);
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
  [SECRET_KEYS, () => false, 'secret'],
];

function stringViolations(value, path) {
  const out = [];
  const foreignEmail = (value.match(EMAIL_RE) ?? []).some((m) => !s.isSyntheticEmail(m));
  const foreignIp = (value.match(IPV4_RE) ?? []).some((m) => !s.isSyntheticIp(m));
  if (foreignEmail) out.push({ path, rule: 'e-mail hors domaine réservé' });
  if (foreignIp) out.push({ path, rule: 'adresse IPv4 hors plage de documentation' });
  if (E164_RE.test(value) && !s.isSyntheticPhone(value)) out.push({ path, rule: 'numéro hors plage fictive' });
  return out;
}

/** Les chemins d'un JSON nettoyé qui gardent une forme réelle. Ne rend jamais la valeur. */
export function jsonViolations(value, ctx, path = '') {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return stringViolations(value, path);
  if (Array.isArray(value)) return value.flatMap((v, i) => jsonViolations(v, ctx, `${path}[${i}]`));
  if (typeof value !== 'object' || value instanceof Date || isBinary(value)) return [];
  return Object.entries(value).flatMap(([key, v]) => {
    const here = path ? `${path}.${key}` : key;
    const k = key.toLowerCase();
    if (GEO_NUMBER_KEYS.has(k) && typeof v === 'number') return s.isSyntheticCoordinate(v) ? [] : [{ path: here, rule: 'coordonnée réelle' }];
    const check = KEY_CHECKS.find(([keys]) => keys.has(k));
    const strings = typeof v === 'string' ? [v] : Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null;
    if (check && strings) {
      return strings.filter((x) => x !== '' && !check[1](x, ctx)).length > 0 ? [{ path: here, rule: `${check[2]} non synthétique` }] : [];
    }
    return jsonViolations(v, ctx, here);
  });
}

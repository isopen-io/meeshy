// Petits outils partagés par l'inventaire : composer une mise à jour Mongo à
// partir d'un document, et les prédicats du contrôle d'échantillonnage.

import * as s from './synth.mjs';
import { scrubJson, scrubSetting, jsonViolations } from './scrub-json.mjs';

const present = (v) => v !== null && v !== undefined && v !== '';

/**
 * Une mise à jour en cours de composition pour UN document. Elle ne touche
 * qu'aux champs PRÉSENTS : un champ absent reste absent (sur le connecteur
 * MongoDB de Prisma, absent et `null` ne se requêtent pas pareil).
 */
export function patchFor(doc, ctx, collection, record) {
  const id = doc._id.toHexString();
  const $set = {};
  const $unset = {};
  const media = (field) => (original, replacement) => record({ collection, id, field, original, replacement });
  const self = {
    id,
    doc,
    set(key, value) {
      $set[key] = value;
      return self;
    },
    unset(key) {
      $unset[key] = '';
      return self;
    },
    replace(key, fn) {
      if (present(doc[key])) $set[key] = fn(doc[key]);
      return self;
    },
    nullify(...keys) {
      keys.filter((k) => doc[k] !== null && doc[k] !== undefined).forEach((k) => {
        $set[k] = null;
      });
      return self;
    },
    text(...keys) {
      keys.forEach((k) => self.replace(k, () => s.sentence(ctx.salt, id, k)));
      return self;
    },
    label(...keys) {
      keys.forEach((k) => self.replace(k, () => s.label(ctx.salt, id, k)));
      return self;
    },
    json(...keys) {
      keys
        .filter((k) => doc[k] !== null && doc[k] !== undefined)
        .forEach((k) => {
          $set[k] = scrubJson(doc[k], ctx, [id, k], media(k));
        });
      return self;
    },
    settingsJson(...keys) {
      keys
        .filter((k) => doc[k] !== null && doc[k] !== undefined)
        .forEach((k) => {
          $set[k] = scrubJson(doc[k], ctx, [id, k], media(k), 'settings');
        });
      return self;
    },
    settings(...keys) {
      keys
        .filter((k) => typeof doc[k] === 'string' || Array.isArray(doc[k]))
        .forEach((k) => {
          $set[k] = Array.isArray(doc[k]) ? doc[k].map((v, i) => scrubSetting(v, ctx, [id, k, i])) : scrubSetting(doc[k], ctx, [id, k]);
        });
      return self;
    },
    file(key, hints = {}) {
      if (!present(doc[key])) return self;
      if (s.isPlaceholderPath(doc[key])) return self;
      const replacement = s.placeholderFor({ mimeType: hints.mimeType ?? doc.mimeType, path: doc[key] });
      media(key)(doc[key], replacement);
      $set[key] = replacement;
      return self;
    },
    dropFile(key) {
      if (!present(doc[key])) return self;
      if (!s.isPlaceholderPath(doc[key])) media(key)(doc[key], null);
      $set[key] = null;
      return self;
    },
    emptyArrays(...keys) {
      keys.filter((k) => Array.isArray(doc[k]) && doc[k].length > 0).forEach((k) => {
        $set[k] = [];
      });
      return self;
    },
    ip(...keys) {
      keys.forEach((k) => self.replace(k, () => s.ipv4(ctx.salt, id, k)));
      return self;
    },
    userAgent(...keys) {
      keys.forEach((k) => self.replace(k, () => s.SYNTHETIC_USER_AGENT));
      return self;
    },
    fingerprint(...keys) {
      keys.forEach((k) => self.replace(k, () => s.fingerprint(ctx.salt, id, k)));
      return self;
    },
    token(...keys) {
      keys.forEach((k) => self.replace(k, () => s.token(ctx.salt, id, k)));
      return self;
    },
    build() {
      const update = {};
      if (Object.keys($set).length > 0) update.$set = $set;
      if (Object.keys($unset).length > 0) update.$unset = $unset;
      return Object.keys(update).length > 0 ? update : null;
    },
  };
  return self;
}

const nullable = (pred) => (v, doc, ctx) => v === null || v === undefined || v === '' || pred(v, doc, ctx);
const each = (pred) => (v, doc, ctx) => v === null || v === undefined || (Array.isArray(v) && v.every((x) => pred(x, doc, ctx)));

export const ok = Object.freeze({
  text: nullable(s.isSyntheticText),
  texts: each(s.isSyntheticText),
  name: nullable(s.isSyntheticName),
  email: nullable(s.isSyntheticEmail),
  emails: each(s.isSyntheticEmail),
  phone: nullable(s.isSyntheticPhone),
  phones: each(s.isSyntheticPhone),
  ip: nullable(s.isSyntheticIp),
  userAgent: nullable((v) => v === s.SYNTHETIC_USER_AGENT),
  token: nullable(s.isSyntheticToken),
  fileName: nullable(s.isSyntheticFileName),
  placeholder: nullable(s.isPlaceholderPath),
  date: nullable(s.isSyntheticDate),
  absent: (v) => v === null || v === undefined,
  empty: (v) => v === null || v === undefined || (Array.isArray(v) && v.length === 0),
  username: (v, _doc, ctx) => s.isSyntheticUsername(v) || ctx.keptUsernames.has(v),
  usernames: each((v, _doc, ctx) => s.isSyntheticUsername(v) || ctx.keptUsernames.has(v)),
  json: 'json',
  settingsJson: 'settings',
  setting: (v, _doc, ctx) => jsonViolations(v, ctx, 'settings').length === 0,
});

export function jsonCheck(value, ctx, policy = 'strict') {
  return jsonViolations(value, ctx, policy);
}

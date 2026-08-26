/**
 * Normalisation des identifiants d'un carnet d'adresses appareil.
 *
 * Le carnet est une donnée NON MAÎTRISÉE : codes courts (`*123#`), libellés
 * (`SOS`), chaînes vides, doublons de formats, entrées malformées. La règle
 * unique de ce module : **une entrée atypique est écartée, jamais fatale**.
 * Aucun contact « exotique » ne doit faire échouer la synchronisation entière.
 *
 * Pendant : les identifiants sortent normalisés (E.164 / email lowercase /
 * pseudo lowercase) et chaque contact porte un `contactKey` stable — hash de
 * ses identifiants triés — qui sert de clé d'upsert idempotente entre deux
 * synchronisations.
 */

import { createHash } from 'crypto';
import { getCountries, type CountryCode } from 'libphonenumber-js';
import {
  normalizePhoneWithCountry,
  normalizeEmail,
  looksLikePhoneNumber,
  LINE_BREAKING_CHARS_SOURCE,
} from './normalize.js';

export const MAX_CONTACTS_PER_SYNC = 2000;
export const MAX_IDENTIFIERS_PER_CONTACT = 25;
export const MAX_DISPLAY_NAME_LENGTH = 200;

const SUPPORTED_COUNTRIES = new Set<string>(getCountries());
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
const USERNAME_SHAPE = /^[a-z0-9_-]{2,16}$/;

// Séparateurs de ligne — MÊME jeu que `normalize.normalizeDisplayName` (SSOT
// dans normalize.ts). Ici ils sont REMPLACÉS par un espace plutôt que supprimés :
// un `"Awa\nDiallo"` d'un carnet d'adresses est deux segments d'un nom, pas un
// mot collé.
const LINE_BREAKING_CHARS = new RegExp(`[${LINE_BREAKING_CHARS_SOURCE}]`, 'g');

export type RawContactEntry = {
  displayName?: unknown;
  phoneNumbers?: unknown;
  emails?: unknown;
  usernames?: unknown;
};

export type NormalizedContact = {
  /** Hash SHA-256 des identifiants normalisés — stable entre deux syncs */
  contactKey: string;
  displayName: string | null;
  /** Numéros au format E.164, validés */
  phoneNumbers: string[];
  /** Emails trim + lowercase */
  emails: string[];
  /** Pseudos vCard lowercase, conformes à la charte username plateforme */
  usernames: string[];
};

/**
 * Résout le code pays par défaut envoyé par le client.
 *
 * `Locale.current.region?.identifier` (iOS) peut valoir un identifiant UN M49
 * numérique (« 419 » = Amérique latine) ou un code inconnu de libphonenumber :
 * on l'IGNORE au lieu de rejeter le lot — un code pays absent dégrade le
 * matching des numéros locaux, il ne le casse pas.
 */
export function resolveDefaultCountry(input: unknown): CountryCode | undefined {
  if (typeof input !== 'string') return undefined;
  const candidate = input.trim().toUpperCase();
  return SUPPORTED_COUNTRIES.has(candidate) ? (candidate as CountryCode) : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(LINE_BREAKING_CHARS, ' ').trim();
  if (trimmed === '') return null;
  if (trimmed.length <= MAX_DISPLAY_NAME_LENGTH) return trimmed;
  // Reculer d'une unité quand la coupe atterrit sur un substitut HAUT : sans
  // cela, un nom > 200 unités finissant par un caractère hors-BMP (émoji, CJK)
  // garde une demi-paire orpheline rendue `�`. Même coupe sûre que
  // `SecuritySanitizer.truncate` (it. 268). Une entrée ASCII/BMP est inchangée.
  const lastCharCode = trimmed.charCodeAt(MAX_DISPLAY_NAME_LENGTH - 1);
  const isHighSurrogate = lastCharCode >= 0xd800 && lastCharCode <= 0xdbff;
  const end = isHighSurrogate ? MAX_DISPLAY_NAME_LENGTH - 1 : MAX_DISPLAY_NAME_LENGTH;
  return trimmed.slice(0, end);
}

function normalizePhones(values: string[], defaultCountry?: CountryCode): string[] {
  const seen = new Set<string>();
  for (const raw of values) {
    if (seen.size >= MAX_IDENTIFIERS_PER_CONTACT) break;
    // Pré-filtre AVANT libphonenumber : `*123#`, `SOS`, une chaîne vide ne sont
    // pas des numéros. Sans ce garde, chaque entrée déclenchait une ParseError
    // — des centaines d'exceptions levées/attrapées et autant de lignes de log
    // par synchronisation d'un carnet réel.
    if (!looksLikePhoneNumber(raw)) continue;
    const normalized = normalizePhoneWithCountry(raw, defaultCountry);
    if (normalized?.isValid) seen.add(normalized.phoneNumber);
  }
  return Array.from(seen);
}

function normalizeEmails(values: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of values) {
    if (seen.size >= MAX_IDENTIFIERS_PER_CONTACT) break;
    const email = normalizeEmail(raw);
    if (EMAIL_SHAPE.test(email)) seen.add(email);
  }
  return Array.from(seen);
}

function normalizeUsernames(values: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of values) {
    if (seen.size >= MAX_IDENTIFIERS_PER_CONTACT) break;
    const handle = raw.trim().replace(/^@+/, '').toLowerCase();
    if (USERNAME_SHAPE.test(handle)) seen.add(handle);
  }
  return Array.from(seen);
}

function computeContactKey(contact: Omit<NormalizedContact, 'contactKey'>): string {
  const parts = [
    ...contact.phoneNumbers.map((p) => `tel:${p}`),
    ...contact.emails.map((e) => `mail:${e}`),
    ...contact.usernames.map((u) => `user:${u}`),
  ].sort();
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

/**
 * Normalise un lot de contacts appareil.
 *
 * Tolérant par construction : une entrée non-objet, un champ du mauvais type,
 * un identifiant illisible sont ignorés silencieusement. Un lot surdimensionné
 * est TRONQUÉ (jamais rejeté). Les entrées appareil en double — même carnet,
 * deux fiches partageant les mêmes identifiants — sont fusionnées sur leur
 * `contactKey`, la première fiche gardant son `displayName`.
 */
export function normalizeContacts(
  entries: unknown,
  defaultCountry?: string | CountryCode
): NormalizedContact[] {
  if (!Array.isArray(entries)) return [];
  const country = resolveDefaultCountry(defaultCountry);
  const byKey = new Map<string, NormalizedContact>();

  for (const entry of entries) {
    if (byKey.size >= MAX_CONTACTS_PER_SYNC) break;
    if (typeof entry !== 'object' || entry === null) continue;

    const raw = entry as RawContactEntry;
    const phoneNumbers = normalizePhones(asStringArray(raw.phoneNumbers), country);
    const emails = normalizeEmails(asStringArray(raw.emails));
    const usernames = normalizeUsernames(asStringArray(raw.usernames));
    if (phoneNumbers.length === 0 && emails.length === 0 && usernames.length === 0) continue;

    const partial = {
      displayName: normalizeDisplayName(raw.displayName),
      phoneNumbers,
      emails,
      usernames,
    };
    const contactKey = computeContactKey(partial);
    if (byKey.has(contactKey)) continue;
    byKey.set(contactKey, { contactKey, ...partial });
  }

  return Array.from(byKey.values());
}

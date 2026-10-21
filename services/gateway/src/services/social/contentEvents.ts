import { createHmac } from 'crypto';
import {
  COUNTING_EVENT_TYPES,
  SAMPLEABLE_V2_TYPES,
  SOCIAL_EVENT_V2_TYPES,
  type SocialEventV2Type,
} from '@meeshy/shared/types/social-events-v2';
import { readerKeySecret } from '../posts/readerKey';

/**
 * Le RANGEMENT des événements v2 (#10510) — collection `ContentEvent`,
 * append-only, bornée par TTL, écrite en UNE commande par requête.
 *
 * Ce module ne sait rien de l'audience ni du consentement : il reçoit des
 * documents déjà décidés, les écrit, et dit combien étaient des rejeux.
 */

export const CONTENT_EVENT_COLLECTION = 'ContentEvent';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Conservation du brut : 30 j pour le défilement, la lecture et la visibilité ; 90 j pour le reste. */
export const CONTENT_EVENT_SHORT_RETENTION_MS = 30 * DAY_MS;
export const CONTENT_EVENT_RETENTION_MS = 90 * DAY_MS;
/**
 * Un reçu de déduplication vit 30 jours (#10553) : le comptage n'a plus d'âge
 * limite, et une file hors ligne peut renvoyer un événement déjà compté bien
 * après les 72 h d'autrefois. Passé ce délai, un renvoi recompte.
 */
export const CONTENT_EVENT_RECEIPT_RETENTION_MS = 30 * DAY_MS;

const SHORT_LIVED: ReadonlySet<string> = new Set(SAMPLEABLE_V2_TYPES);

export const contentEventRetentionMs = (type: string): number =>
  SHORT_LIVED.has(type) ? CONTENT_EVENT_SHORT_RETENTION_MS : CONTENT_EVENT_RETENTION_MS;

/** `AAAAMMJJ` UTC — la clé de partition des agrégats quotidiens. */
export const utcDayOf = (date: Date): number =>
  date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();

/**
 * La CLÉ d'un événement : HMAC de son `eventId` sous le secret des clés de
 * lecteur. L'`eventId` brut n'est rangé NULLE PART (revue de conformité, O1) :
 * la clé ne permet ni de le retrouver, ni de le rapprocher d'une autre ligne —
 * chaque événement a le sien, et une ligne n'en porte qu'un.
 */
export const eventKeyOf = (eventId: string, secret: string = readerKeySecret()): string =>
  createHmac('sha256', secret).update(`social-event:${eventId.toLowerCase()}`).digest('hex');

// ─── Réglages ────────────────────────────────────────────────────────────────

type Env = Readonly<Record<string, string | undefined>>;

export type SocialEventsV2Settings = {
  readonly enabled: boolean;
  /** Le taux servi au client pour les types échantillonnables. */
  readonly sampling: Readonly<Partial<Record<SocialEventV2Type, number>>>;
};

/**
 * `SOCIAL_EVENTS_V2_ENABLED=false` est l'interrupteur d'urgence : tous les
 * types v2 deviennent `ignored`, sans écriture. `SOCIAL_EVENTS_V2_SAMPLING`
 * (0 < taux ≤ 1, défaut 1) règle le défilement, la lecture et la visibilité
 * sans nouvelle version d'application.
 */
export function socialEventsV2Settings(env: Env = process.env): SocialEventsV2Settings {
  const enabled = (env.SOCIAL_EVENTS_V2_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
  const raw = Number.parseFloat(env.SOCIAL_EVENTS_V2_SAMPLING ?? '1');
  const rate = Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 1;
  return {
    enabled,
    sampling: Object.fromEntries(SAMPLEABLE_V2_TYPES.map((type) => [type, rate])),
  };
}

export const acceptedEventTypes = (settings: SocialEventsV2Settings): readonly string[] => [
  ...COUNTING_EVENT_TYPES,
  ...(settings.enabled ? SOCIAL_EVENT_V2_TYPES : []),
];

// ─── Écriture ────────────────────────────────────────────────────────────────

export type RawCommandPrisma = {
  $runCommandRaw(command: Record<string, unknown>): Promise<unknown>;
};

/** Un document en JSON étendu, tel que `$runCommandRaw` le transmet à MongoDB. */
export type ExtendedJsonDocument = Readonly<Record<string, unknown>>;

export type InsertOutcome = {
  /** Index (dans `documents`) des lignes réellement écrites. */
  readonly inserted: ReadonlySet<number>;
  /** Index des lignes refusées comme DOUBLON (E11000) : des rejeux. */
  readonly duplicates: ReadonlySet<number>;
};

type WriteError = { readonly index?: number; readonly code?: number };

const writeErrorsOf = (result: unknown): readonly WriteError[] => {
  if (typeof result !== 'object' || result === null) return [];
  const errors = (result as { writeErrors?: unknown }).writeErrors;
  return Array.isArray(errors) ? (errors as WriteError[]) : [];
};

/**
 * UN `insert` non ordonné pour toute la requête : un doublon (E11000 sur
 * l'index unique de la clé d'événement) n'arrête pas le reste. Toute autre
 * erreur d'écriture remonte — elle n'est pas un rejeu.
 */
export async function insertDocuments(
  prisma: RawCommandPrisma,
  collection: string,
  documents: readonly ExtendedJsonDocument[],
): Promise<InsertOutcome> {
  if (documents.length === 0) return { inserted: new Set(), duplicates: new Set() };
  const result = await prisma.$runCommandRaw({ insert: collection, documents: [...documents], ordered: false });
  const errors = writeErrorsOf(result);
  const failed = errors.filter((error) => error.code !== 11000);
  if (failed.length > 0) {
    throw new Error(`[contentEvents] ${failed.length} écriture(s) refusée(s) sur ${collection} (code ${failed[0].code})`);
  }
  const duplicates = new Set(errors.map((error) => error.index).filter((index): index is number => typeof index === 'number'));
  const inserted = new Set(documents.map((_, index) => index).filter((index) => !duplicates.has(index)));
  return { inserted, duplicates };
}

export const ejsonDate = (date: Date) => ({ $date: date.toISOString() });
export const ejsonObjectId = (id: string) => ({ $oid: id });

/** Ôte les clés `undefined` : un document rangé ne porte que ce qui est connu. */
export const compact = <T extends Record<string, unknown>>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;

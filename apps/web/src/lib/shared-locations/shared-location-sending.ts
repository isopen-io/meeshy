import {
  SHARED_LOCATION_ERROR_CODES,
  SHARED_LOCATION_RECIPIENTS_MAX,
  type SharedLocationDurationMinutes,
  type SharedLocationPrecision,
} from '@meeshy/shared/types/shared-location-constants';

/**
 * **ÉMETTRE MA POSITION À DES PERSONNES, LA LOI DU FIL** (#18345, iso
 * `packages/MeeshySDK/.../Relations/SharedLocationSending.swift`). Le contrat est
 * `packages/shared/types/shared-location.ts` ; ce module en est l'écriture web, sans Zod
 * (le chunk de la fiche n'en embarque pas). L'appareil envoie UNE fois sa position
 * complète, et la passerelle la tronque destinataire par destinataire à la précision
 * choisie : rien ici ne floute, rien ne décide d'un droit. Ces fonctions bornent la
 * charge comme le serveur la borne, pour qu'un relevé absurde ne parte jamais.
 */

export type SharedLocationFix = { readonly latitude: number; readonly longitude: number; readonly accuracy?: number };
/** `expiresInSeconds` : l'échéance de la personne quand elle tombe avant le terme du partage — la passerelle la tient (#18205). */
export type SharedLocationRecipient = { readonly userId: string; readonly precision: SharedLocationPrecision; readonly expiresInSeconds?: number };
export type SharedLocationStartPayload = {
  readonly recipients: readonly SharedLocationRecipient[];
  readonly durationMinutes: SharedLocationDurationMinutes;
  readonly position: SharedLocationFix;
};

/** Ce que l'interface dit d'un envoi qui n'a pas abouti. `unconfirmed` : l'accusé n'est pas revenu, la passerelle a PU prendre l'envoi. */
export type SharedLocationSendOutcome = 'invalid' | 'not-sharing' | 'rate-limited' | 'unavailable' | 'offline' | 'unconfirmed' | 'failed';
export type SharedLocationVerdict =
  | { readonly kind: 'started'; readonly expiresAt: number }
  | { readonly kind: 'refused'; readonly outcome: SharedLocationSendOutcome };

const MAX_ACCURACY_METERS = 100_000;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

const finiteWithin = (value: number, bound: number): boolean => Number.isFinite(value) && Math.abs(value) <= bound;

/** `null` : un relevé hors du globe ou non fini ne part jamais. */
export function sharedLocationFixOf(raw: { readonly latitude: number; readonly longitude: number; readonly accuracy?: number | null }): SharedLocationFix | null {
  if (!finiteWithin(raw.latitude, 90) || !finiteWithin(raw.longitude, 180)) return null;
  const accuracy = raw.accuracy;
  const base = { latitude: raw.latitude, longitude: raw.longitude };
  return typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? { ...base, accuracy: Math.min(accuracy, MAX_ACCURACY_METERS) } : base;
}

/**
 * La charge de `location:share-start` : démarrer de nouveau REMPLACE le partage, la liste
 * est toujours entière. Un doublon (insensible à la casse) garde sa DERNIÈRE précision ;
 * `null` sans destinataire valide ou au-delà du plafond.
 */
export function sharedLocationStartPayloadOf({
  recipients,
  durationMinutes,
  fix,
}: {
  readonly recipients: readonly SharedLocationRecipient[];
  readonly durationMinutes: SharedLocationDurationMinutes;
  readonly fix: SharedLocationFix;
}): SharedLocationStartPayload | null {
  const latest = new Map(recipients.filter((r) => OBJECT_ID.test(r.userId)).map((r) => [r.userId.toLowerCase(), r] as const));
  const ordered = [...latest.entries()].map(([userId, { precision, expiresInSeconds }]) => ({ userId, precision, ...(expiresInSeconds === undefined ? {} : { expiresInSeconds }) }));
  if (ordered.length === 0 || ordered.length > SHARED_LOCATION_RECIPIENTS_MAX) return null;
  return { recipients: ordered, durationMinutes, position: fix };
}

/**
 * La même charge sans les échéances par personne, pour une passerelle d'avant #18205 qui refuse la clé (`INVALID`) ;
 * `null` quand il n'y en avait aucune : un refus n'a alors rien à voir avec elles.
 */
export function sharedLocationPayloadWithoutDeadlines(payload: SharedLocationStartPayload): SharedLocationStartPayload | null {
  if (!payload.recipients.some((recipient) => recipient.expiresInSeconds !== undefined)) return null;
  return { ...payload, recipients: payload.recipients.map(({ userId, precision }) => ({ userId, precision })) };
}

const REFUSALS: Readonly<Record<string, SharedLocationSendOutcome>> = {
  [SHARED_LOCATION_ERROR_CODES.INVALID]: 'invalid',
  [SHARED_LOCATION_ERROR_CODES.NOT_SHARING]: 'not-sharing',
  [SHARED_LOCATION_ERROR_CODES.RATE_LIMITED]: 'rate-limited',
  [SHARED_LOCATION_ERROR_CODES.UNAVAILABLE]: 'unavailable',
};

type Wire = Readonly<Record<string, unknown>>;
const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);

/** L'accusé de `location:share-start` et de `location:share-update`. Un code inconnu vaut un échec, jamais une raison inventée. */
export function readSharedLocationAck(raw: unknown): SharedLocationVerdict {
  const ack = objectOf(raw);
  if (ack?.success === true) {
    const expiresAt = objectOf(ack.data)?.expiresAt;
    const at = typeof expiresAt === 'string' ? Date.parse(expiresAt) : Number.NaN;
    return Number.isNaN(at) ? { kind: 'refused', outcome: 'failed' } : { kind: 'started', expiresAt: at };
  }
  const code = typeof ack?.code === 'string' ? ack.code : '';
  return { kind: 'refused', outcome: REFUSALS[code] ?? 'failed' };
}

/** L'accusé de `location:share-stop` : seul un succès explicite vaut un arrêt. */
export const sharedLocationStopAccepted = (raw: unknown): boolean => objectOf(raw)?.success === true;

/**
 * La cadence : sous le débit servi (120 par minute), un relevé ne part que si l'on a
 * vraiment bougé, ou au battement qui garde la position fraîche chez les destinataires.
 */
export const SHARED_LOCATION_UPDATE_GATE = { minimumIntervalMs: 5_000, minimumDistanceMeters: 50, heartbeatMs: 120_000 } as const;

export type SharedLocationSent = { readonly fix: SharedLocationFix; readonly at: number };

const RADIANS = Math.PI / 180;

/** La distance au sol, en mètres (haversine) : de quoi juger qu'on a bougé, jamais plus. */
export function sharedLocationDistanceMeters(from: SharedLocationFix, to: SharedLocationFix): number {
  const dLat = (to.latitude - from.latitude) * RADIANS;
  const dLon = (to.longitude - from.longitude) * RADIANS;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(from.latitude * RADIANS) * Math.cos(to.latitude * RADIANS) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function shouldSendSharedLocation(fix: SharedLocationFix, now: number, last: SharedLocationSent | null): boolean {
  if (last === null) return true;
  const elapsed = now - last.at;
  if (elapsed < SHARED_LOCATION_UPDATE_GATE.minimumIntervalMs) return false;
  return elapsed >= SHARED_LOCATION_UPDATE_GATE.heartbeatMs || sharedLocationDistanceMeters(last.fix, fix) >= SHARED_LOCATION_UPDATE_GATE.minimumDistanceMeters;
}

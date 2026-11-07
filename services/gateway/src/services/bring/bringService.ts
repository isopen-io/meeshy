/**
 * LE BRING (#13936, décision porteur D-3 du 2026-10-31, #13945) — faire sonner le
 * téléphone de l'autre, pour l'urgence extrême.
 *
 * ## La loi, et rien que la loi
 *
 * Qui peut sonner qui, c'est `resolveRelationAccess({ feature: 'bring' })` sur le
 * niveau du site unique (`niveauEffectif`) : dès Ami, jamais envers soi, rien si
 * l'un a bloqué l'autre, aucun refus d'âge. Le CONSENTEMENT que la loi exige pour
 * le Bring n'est pas un consentement RGPD mais une PRÉFÉRENCE DE RÉCEPTION du
 * DESTINATAIRE (#14407, `RELATION_RECEPTION_PREFERENCE_FEATURES`), active par
 * défaut (D-3) : elle se coupe pour une personne (`RelationFeatureSetting.
 * bringBlockedAt`) ou pour tout le monde (`notification.bringEnabled`), et
 * l'orchestrateur la traduit en `consent: 'granted'` tant qu'elle n'est pas
 * coupée. Les deux coupures se servent en `BRING_BLOCKED` — « Bring
 * indisponible » chez l'expéditeur, sans dire laquelle. Ce service ne compare
 * aucun niveau.
 *
 * ## Le quota
 *
 * `RELATION_THRESHOLDS.bring.perDay` selon le niveau EFFECTIF au moment de
 * l'envoi, par paire ORIENTÉE et par jour calendaire du destinataire
 * (`bringDayOf`). Compté par le limiteur Redis existant — un compteur par jour et
 * par paire, partagé par les trois plafonds : un lien baissé dans la journée
 * garde ce qu'il a déjà consommé. Un refus ne coûte rien (le compte est rendu) ;
 * un compteur injoignable ne sonne pas (`BRING_UNAVAILABLE`, fail-closed) — un
 * son qui passe Ne pas déranger ne part pas sans être compté.
 *
 * ## Un Bring en vol
 *
 * L'index de paire, posé en `SETNX`, PORTE l'état entier (durée de vie = la
 * fenêtre de sonnerie), doublé d'une entrée par identifiant pour l'arrêt : un
 * second appui, même concurrent, rend LE MÊME (200), sans consommer ni resonner.
 * L'interrupteur du service (`BRING_ENABLED`) est vérifié avant tout. L'arrêt (destinataire ou expéditeur)
 * efface les deux, prévient les deux rooms `user:<id>` et pousse un arrêt
 * silencieux à TOUS les appareils du destinataire. À l'expiration, le serveur
 * n'émet rien : chaque client cesse à `expiresAt`.
 *
 * ## Un blocage n'est annoncé à personne
 *
 * Bloquer l'expéditeur, ou bloquer son Bring, pendant qu'il sonne arrête la
 * sonnerie chez le destinataire, et le dit à celui qui bloque. Le bloqué n'en
 * reçoit rien ; la raison servie est celle du geste de celui qui bloque
 * (`recipient` / `sender`), jamais « bloqué ».
 */
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import {
  BRING_ERROR_CODES,
  BRING_RING_WINDOW_MS,
  type BringAvailability,
  type BringErrorCode,
  type BringRingEventData,
  type BringSent,
  type BringStopReason,
  type BringStoppedEventData,
} from '@meeshy/shared/types/bring';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { declaredAgeClass } from '@meeshy/shared/utils/age';
import { resolveRelationAccess } from '@meeshy/shared/utils/relation-access';
import type { RelationThresholds } from '@meeshy/shared/utils/relation-levels';
import type { CacheStore } from '../CacheStore';
import type { PushNotificationService } from '../PushNotificationService';
import type { RelationIo } from '../../socketio/relationEvents';
import { isBlockedBetween } from '../../utils/blocking';
import { RECIPIENT_LANG_SELECT, recipientLanguage, type RecipientLanguagePrefs } from '../../utils/recipient-language';
import { niveauEffectif } from '../friendship';
import { bringDayOf } from './bringDay';
import { buildBringRingPushes, buildBringStoppedPushes } from './bringPush';
import { ACCOUNT_STATE_SELECT, isUsableAccount, type AccountState } from '../relations/usableAccount';

export type BringDb = Pick<PrismaClient, 'user' | 'friendRequest' | 'userRelation' | 'relationFeatureSetting' | 'userPreferences'>;

/** Le décompte du quota : `null` quand le compteur est injoignable. */
export type BringQuota = {
  readonly consume: (perDay: number, key: string, cost: number) => Promise<{ readonly remaining: number; readonly exceeded: boolean } | null>;
  readonly release: (perDay: number, key: string) => Promise<void>;
};

export type BringDeps = {
  readonly prisma: BringDb;
  readonly cache: Pick<CacheStore, 'get' | 'set' | 'setnx' | 'del'>;
  readonly quota: BringQuota;
  readonly thresholds: RelationThresholds;
  readonly io: RelationIo | undefined;
  readonly push: Pick<PushNotificationService, 'sendToUser'>;
  readonly now: () => Date;
  readonly criticalAlerts: boolean;
  /** L'interrupteur du SERVICE (`BRING_ENABLED`, éteint par défaut) : coupé, personne ne sonne personne. */
  readonly enabled: boolean;
  readonly report: (message: string, error: unknown) => void;
};

export type BringRefusal = { readonly ok: false; readonly status: number; readonly code: BringErrorCode; readonly message: string };
export type BringOutcome<T> = { readonly ok: true; readonly status: number; readonly data: T } | BringRefusal;

type BringState = {
  readonly bringId: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly sentAt: string;
  readonly expiresAt: string;
  readonly quotaKey: string;
  readonly perDay: number | null;
};

const WINDOW_SECONDS = Math.ceil(BRING_RING_WINDOW_MS / 1000);
const stateKey = (bringId: string) => `bring:${bringId}`;
const pairKey = (fromUserId: string, toUserId: string) => `bring:pair:${fromUserId}:${toUserId}`;
const BRING_ID = /^[0-9a-f]{24}$/;

const refuse = (status: number, code: BringErrorCode, message: string): BringRefusal => ({ ok: false, status, code, message });
const NOT_ALLOWED = refuse(403, BRING_ERROR_CODES.NOT_ALLOWED, 'Bring indisponible');
const BLOCKED = refuse(403, BRING_ERROR_CODES.BLOCKED, 'Bring indisponible');
const QUOTA = refuse(429, BRING_ERROR_CODES.QUOTA_EXCEEDED, "Plus de Bring aujourd'hui vers cette personne");
const UNAVAILABLE = refuse(503, BRING_ERROR_CODES.UNAVAILABLE, 'Bring momentanément indisponible');
const NOT_FOUND = refuse(404, BRING_ERROR_CODES.NOT_FOUND, 'Bring introuvable');
const DISABLED = refuse(403, BRING_ERROR_CODES.DISABLED, 'Bring indisponible');

const USER_SELECT = {
  id: true,
  role: true,
  ...ACCOUNT_STATE_SELECT,
  timezone: true,
  birthDate: true,
  displayName: true,
  username: true,
  avatar: true,
  ...RECIPIENT_LANG_SELECT,
} as const;

type Party = RecipientLanguagePrefs & AccountState & {
  readonly id: string;
  readonly timezone: string | null;
  readonly birthDate: Date | null;
  readonly displayName: string | null;
  readonly username: string;
  readonly avatar: string | null;
};

type Judged =
  | {
      readonly ok: true;
      readonly level: RelationLevel;
      readonly perDay: number | null;
      readonly sender: Party;
      readonly recipient: Party;
      /** La langue de CADRAGE du destinataire (titre et corps du push). */
      readonly language: string;
      /** `notification.showSenderName` du destinataire : faux ⇒ ni nom ni avatar sur l'écran verrouillé. */
      readonly showSenderName: boolean;
    }
  | BringRefusal;

/** Le plafond du jour pour un niveau OUVERT par la loi ; `null` = illimité. */
const perDayFor = (thresholds: RelationThresholds, level: RelationLevel): number | null => {
  const quotas: Readonly<Record<string, number | null>> = thresholds.bring.perDay;
  return Object.prototype.hasOwnProperty.call(quotas, level) ? (quotas[level] ?? null) : 0;
};

/**
 * L'interrupteur GLOBAL « Recevoir des Bring » (`notification.bringEnabled`, #14407) :
 * absent ⇒ reçu. Une lecture qui échoue FERME — un son qui passe Ne pas déranger ne
 * part pas sur un doute.
 */
type ReceptionPrefs = { readonly receives: boolean; readonly showSenderName: boolean };

async function receptionPrefs(prisma: Pick<PrismaClient, 'userPreferences'>, userId: string): Promise<ReceptionPrefs> {
  try {
    const row = await prisma.userPreferences.findUnique({ where: { userId }, select: { notification: true } });
    const notification = (row?.notification ?? {}) as Record<string, unknown>;
    return { receives: notification.bringEnabled !== false, showSenderName: notification.showSenderName !== false };
  } catch {
    return { receives: false, showSenderName: false };
  }
}

async function judge(deps: BringDeps, fromUserId: string, toUserId: string): Promise<Judged> {
  if (!deps.enabled) return DISABLED;
  const [blocked, level, sender, recipient, setting, prefs] = await Promise.all([
    isBlockedBetween(deps.prisma, fromUserId, toUserId),
    niveauEffectif(deps.prisma, fromUserId, toUserId),
    deps.prisma.user.findUnique({ where: { id: fromUserId }, select: USER_SELECT }),
    deps.prisma.user.findUnique({ where: { id: toUserId }, select: USER_SELECT }),
    deps.prisma.relationFeatureSetting.findUnique({
      where: { ownerId_otherId: { ownerId: toUserId, otherId: fromUserId } },
      select: { bringBlockedAt: true },
    }),
    receptionPrefs(deps.prisma, toUserId),
  ]);
  if (!isUsableAccount(sender) || !isUsableAccount(recipient)) return NOT_ALLOWED;

  const now = deps.now();
  const verdict = resolveRelationAccess({
    viewerId: fromUserId,
    targetId: toUserId,
    grantedByViewer: level,
    grantedByTarget: level,
    sharesCommunity: false,
    blockedEitherWay: blocked,
    viewerMinor: declaredAgeClass(sender.birthDate, now),
    targetMinor: declaredAgeClass(recipient.birthDate, now),
    viewerRole: sender.role,
    targetRole: recipient.role,
    feature: 'bring',
    consent: prefs.receives && !setting?.bringBlockedAt ? 'granted' : 'refused',
  });
  if (!verdict.allowed) return verdict.reason === 'consent' ? BLOCKED : NOT_ALLOWED;

  const perDay = perDayFor(deps.thresholds, verdict.effectiveLevel);
  if (perDay === 0) return NOT_ALLOWED;
  return {
    ok: true,
    level: verdict.effectiveLevel,
    perDay,
    sender,
    recipient,
    language: recipientLanguage(recipient, 'fr'),
    showSenderName: prefs.showSenderName,
  };
}

const quotaKeyOf = (fromUserId: string, toUserId: string, day: string) => `${fromUserId}:${toUserId}:${day}`;

/** Ce qui reste aujourd'hui, LU sans rien consommer (un décompte de coût nul). */
async function remainingToday(deps: BringDeps, perDay: number | null, key: string): Promise<number | null | undefined> {
  if (perDay === null) return null;
  const read = await deps.quota.consume(perDay, key, 0);
  return read === null ? undefined : read.remaining;
}

export async function bringAvailability(deps: BringDeps, fromUserId: string, toUserId: string): Promise<BringAvailability> {
  const judged = await judge(deps, fromUserId, toUserId);
  const timezone = judged.ok ? judged.recipient.timezone : null;
  const { day, resetsAt } = bringDayOf(deps.now(), timezone);
  const closed: BringAvailability = { userId: toUserId, available: false, perDay: 0, remainingToday: 0, resetsAt: resetsAt.toISOString() };
  if (judged.ok === false) return closed;

  const remaining = await remainingToday(deps, judged.perDay, quotaKeyOf(fromUserId, toUserId, day));
  if (remaining === undefined) return closed;
  return { userId: toUserId, available: true, perDay: judged.perDay, remainingToday: remaining, resetsAt: resetsAt.toISOString() };
}

const parseState = (raw: string | null): BringState | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<BringState>;
    return typeof value.bringId === 'string' && typeof value.fromUserId === 'string' && typeof value.toUserId === 'string'
      ? (value as BringState)
      : null;
  } catch {
    return null;
  }
};

/** Le Bring EN VOL d'une paire orientée : l'index de paire PORTE l'état entier (posé d'un seul `SETNX`). */
async function inFlight(deps: BringDeps, fromUserId: string, toUserId: string): Promise<BringState | null> {
  return parseState(await deps.cache.get(pairKey(fromUserId, toUserId)));
}

const sentView = (state: BringState, remaining: number | null): BringSent => ({
  bringId: state.bringId,
  toUserId: state.toUserId,
  sentAt: state.sentAt,
  expiresAt: state.expiresAt,
  perDay: state.perDay,
  remainingToday: remaining,
});

const safely = (send: () => void): void => {
  try {
    send();
  } catch {
    /* le geste est déjà fait */
  }
};

function dispatch(deps: BringDeps, pushes: ReturnType<typeof buildBringRingPushes>): void {
  for (const push of pushes) {
    deps.push.sendToUser(push).catch((error: unknown) => deps.report('Bring push failed', error));
  }
}

async function sameBring(deps: BringDeps, state: BringState): Promise<BringOutcome<BringSent>> {
  const left = await remainingToday(deps, state.perDay, state.quotaKey);
  return { ok: true, status: 200, data: sentView(state, left === undefined ? 0 : left) };
}

/** Efface un Bring qui n'a pas sonné — index de paire (s'il est encore le sien) et état — et rend son décompte. */
async function withdraw(deps: BringDeps, state: BringState, counted: boolean): Promise<void> {
  await deps.cache.del(stateKey(state.bringId));
  if (parseState(await deps.cache.get(pairKey(state.fromUserId, state.toUserId)))?.bringId === state.bringId) {
    await deps.cache.del(pairKey(state.fromUserId, state.toUserId));
  }
  if (counted && state.perDay !== null) await deps.quota.release(state.perDay, state.quotaKey);
}

/**
 * Envoyer. L'ordre est la garantie :
 *
 * 1. juger ;
 * 2. poser l'index de paire AVEC l'état entier, d'un seul `SETNX` : un second appui
 *    concurrent lit le Bring complet et rend LE MÊME (200), jamais un 503 ;
 * 3. décompter (un refus ou un compteur injoignable efface l'index) ;
 * 4. écrire l'état par identifiant (un échec rend le décompte et efface tout) ;
 * 5. REJUGER : un blocage acquitté pendant les étapes 2 à 4 — que `stopBringsOnBlock`
 *    a pu manquer ou effacer — empêche la sonnerie, et le décompte est rendu ;
 * 6. sonner : socket puis push.
 */
export async function sendBring(deps: BringDeps, fromUserId: string, toUserId: string): Promise<BringOutcome<BringSent>> {
  const judged = await judge(deps, fromUserId, toUserId);
  if (judged.ok === false) return judged;

  const now = deps.now();
  const { day } = bringDayOf(now, judged.recipient.timezone);
  const state: BringState = {
    bringId: randomBytes(12).toString('hex'),
    fromUserId,
    toUserId,
    sentAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + BRING_RING_WINDOW_MS).toISOString(),
    quotaKey: quotaKeyOf(fromUserId, toUserId, day),
    perDay: judged.perDay,
  };

  if (!(await deps.cache.setnx(pairKey(fromUserId, toUserId), JSON.stringify(state), WINDOW_SECONDS))) {
    const ringing = await inFlight(deps, fromUserId, toUserId);
    return ringing ? sameBring(deps, ringing) : UNAVAILABLE;
  }

  const counted = judged.perDay === null ? { remaining: null, exceeded: false } : await deps.quota.consume(judged.perDay, state.quotaKey, 1);
  if (counted === null || counted.exceeded) {
    await withdraw(deps, state, counted !== null);
    return counted === null ? UNAVAILABLE : QUOTA;
  }

  try {
    await deps.cache.set(stateKey(state.bringId), JSON.stringify(state), WINDOW_SECONDS);
  } catch (error) {
    await withdraw(deps, state, true).catch(() => undefined);
    throw error;
  }

  const still = await judge(deps, fromUserId, toUserId);
  const live = (await inFlight(deps, fromUserId, toUserId))?.bringId === state.bringId;
  if (still.ok === false || !live) {
    await withdraw(deps, state, true);
    return still.ok === false ? still : NOT_FOUND;
  }

  const ring: BringRingEventData = { bringId: state.bringId, fromUserId, toUserId, sentAt: state.sentAt, expiresAt: state.expiresAt };
  safely(() => deps.io?.to(ROOMS.user(toUserId)).emit(SERVER_EVENTS.BRING_RING, ring));
  dispatch(deps, buildBringRingPushes({
    bringId: state.bringId,
    toUserId,
    fromUserId,
    fromName: judged.showSenderName ? judged.sender.displayName || judged.sender.username : null,
    fromAvatar: judged.showSenderName ? judged.sender.avatar : null,
    sentAt: now,
    expiresAt: new Date(state.expiresAt),
    language: judged.language,
    criticalAlerts: deps.criticalAlerts,
  }));

  return { ok: true, status: 201, data: sentView(state, counted.remaining) };
}

/** La langue du libellé « Bring arrêté » ; une lecture en panne ne retient jamais l'arrêt. */
async function stopLanguage(deps: BringDeps, userId: string): Promise<string | undefined> {
  try {
    const recipient = await deps.prisma.user.findUnique({ where: { id: userId }, select: { ...RECIPIENT_LANG_SELECT } });
    return recipient ? recipientLanguage(recipient, 'fr') : undefined;
  } catch {
    return undefined;
  }
}

/** `both` : un arrêt ordinaire, aux deux ; sinon l'identifiant de celui qui BLOQUE — le bloqué n'est jamais prévenu. */
async function settle(deps: BringDeps, state: BringState, reason: BringStopReason, audience: 'both' | { readonly blockerId: string }): Promise<void> {
  await deps.cache.del(stateKey(state.bringId));
  if ((await inFlight(deps, state.fromUserId, state.toUserId))?.bringId === state.bringId) {
    await deps.cache.del(pairKey(state.fromUserId, state.toUserId));
  }

  const stopped: BringStoppedEventData = {
    bringId: state.bringId, fromUserId: state.fromUserId, toUserId: state.toUserId, reason, stoppedAt: deps.now().toISOString(),
  };
  const rooms = audience === 'both' ? [state.toUserId, state.fromUserId] : [...new Set([state.toUserId, audience.blockerId])];
  rooms.forEach((userId) => safely(() => deps.io?.to(ROOMS.user(userId)).emit(SERVER_EVENTS.BRING_STOPPED, stopped)));
  dispatch(deps, buildBringStoppedPushes({ bringId: state.bringId, toUserId: state.toUserId, reason, language: await stopLanguage(deps, state.toUserId) }));
}

/** Arrêter : le destinataire (un geste) ou l'expéditeur (une annulation). Tout autre ⇒ 404, comme un id inconnu. */
export async function stopBring(deps: BringDeps, actorId: string, bringId: string): Promise<BringOutcome<{ bringId: string; stopped: true }>> {
  if (!BRING_ID.test(bringId)) return NOT_FOUND;
  const state = parseState(await deps.cache.get(stateKey(bringId)));
  if (!state || (actorId !== state.toUserId && actorId !== state.fromUserId)) return NOT_FOUND;

  await settle(deps, state, actorId === state.toUserId ? 'recipient' : 'sender', 'both');
  return { ok: true, status: 200, data: { bringId, stopped: true } };
}

/**
 * Un blocage (de l'utilisateur, ou de son Bring) vient d'être posé par `blockerId`
 * envers `blockedId` : les Brings en vol entre eux s'arrêtent chez leur
 * destinataire, et le bloqué n'en apprend rien.
 */
export async function stopBringsOnBlock(deps: BringDeps, params: { readonly blockerId: string; readonly blockedId: string; readonly scope: 'user' | 'bring' }): Promise<void> {
  const { blockerId, blockedId, scope } = params;
  const directions: ReadonlyArray<readonly [string, string]> = scope === 'bring'
    ? [[blockedId, blockerId]]
    : [[blockedId, blockerId], [blockerId, blockedId]];

  for (const [fromUserId, toUserId] of directions) {
    const state = await inFlight(deps, fromUserId, toUserId);
    if (!state) continue;
    const reason: BringStopReason = blockerId === state.toUserId ? 'recipient' : 'sender';
    await settle(deps, state, reason, { blockerId });
  }
}

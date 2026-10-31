/**
 * LE RITUEL DU SANG (#13933) : le seul chemin vers le niveau Sang. Un jeton
 * SYNCHRONISÉ, une fenêtre COURTE, une DOUBLE confirmation, un consentement feature
 * par feature — le même pour tous les âges (décision porteur 2026-10-31).
 *
 * ## Les trois temps (`POST /relations/:userId/ritual { phase }`)
 *
 * - `start` ouvre — ou REJOINT — le rituel de la paire : un jeton unique, une vie de
 *   60 s. Il exige une demande de Sang EN ATTENTE entre les deux, un lien Proche,
 *   douze semaines actives depuis l'entrée en Proche (la même loi que l'envoi), et
 *   aucun blocage ;
 * - `hold` dit « je tiens l'écran » ; il se REJOUE, et ne vaut que 15 s ;
 * - `confirm` exige que les DEUX tiennent l'écran (ou que l'autre ait déjà confirmé),
 *   un jeton exact et l'accord explicite des quatre partages. Quand les deux ont
 *   confirmé, la demande est acceptée, les deux accords valent Sang, les
 *   consentements sont écrits.
 *
 * ## Lâcher
 *
 * Un `hold` qui a vieilli au-delà de sa fenêtre quand l'autre confirme : le rituel est
 * ABANDONNÉ, rien n'est enregistré, et l'autre en est prévenu (`stage: 'lapsed'`).
 * Le retour est calme : aucun état n'a changé.
 *
 * ## État
 *
 * Dans le `CacheStore` (Redis), sous un verrou court : deux confirmations simultanées
 * ne se perdent pas. La vie du jeton est portée par le TTL ET par la date stockée.
 */
import { randomBytes } from 'crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { relationPairKey } from '@meeshy/shared/types/relation';
import {
  RELATION_RITUAL_CONSENT_KEYS,
  type RelationRitualConsentKey,
  type RelationRitualConsents,
  type RelationRitualPhase,
} from '@meeshy/shared/types/socketio-events';
import type { CacheStore } from '../CacheStore';
import {
  emitRelationLevelRaised,
  emitRitualCompleted,
  emitRitualProgress,
  emitRitualStarted,
  type RelationIo,
} from '../../socketio/relationEvents';
import { isBlockedBetween } from '../../utils/blocking';
import { judgeRelationRequest } from './relationRequestGate';
import { recordLevel } from './userRelationWriter';

export const RITUAL_TTL_MS = 60_000;
export const RITUAL_HOLD_VALID_MS = 15_000;

const LOCK_TTL_SECONDS = 5;
const LOCK_ATTEMPTS = 5;
const LOCK_PAUSE_MS = 40;

export type RitualCode =
  | 'RELATION_RITUAL_NO_REQUEST'
  | 'RELATION_RITUAL_INVALID'
  | 'RELATION_RITUAL_NOT_SYNCHRONISED'
  | 'RELATION_RITUAL_LAPSED'
  | 'RELATION_CONSENT_REQUIRED'
  | 'RELATION_PHASE_SKIP'
  | 'RELATION_NOT_ELIGIBLE'
  | 'RELATION_RITUAL_BUSY';

export type RitualOutcome =
  | { readonly ok: true; readonly data: Record<string, unknown> }
  | { readonly ok: false; readonly status: 400 | 409; readonly code: RitualCode; readonly message: string };

export type RitualDb = Pick<
  PrismaClient,
  'friendRequest' | 'userRelation' | 'pairInteractionDay' | 'relationFeatureSetting' | 'user'
>;

export type RitualDeps = {
  readonly prisma: RitualDb;
  readonly cache: CacheStore;
  readonly io: RelationIo | undefined;
  readonly now: () => Date;
  readonly forgetFriends: (ids: ReadonlyArray<string>) => Promise<void>;
};

type RitualState = {
  readonly token: string;
  readonly requestId: string;
  readonly expiresAt: number;
  readonly holds: Readonly<Record<string, number>>;
  readonly confirms: Readonly<Record<string, RelationRitualConsents>>;
};

const refuse = (status: 400 | 409, code: RitualCode, message: string): RitualOutcome => ({ ok: false, status, code, message });

const NO_REQUEST = refuse(409, 'RELATION_RITUAL_NO_REQUEST', 'Aucune demande de Sang en attente entre vous');
const INVALID = refuse(409, 'RELATION_RITUAL_INVALID', 'Ce rituel n\'est plus ouvert');
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const stateKey = (a: string, b: string): string => {
  const pair = relationPairKey(a, b);
  return `relation:ritual:${pair.userLowId}:${pair.userHighId}`;
};

async function readState(cache: CacheStore, key: string, now: number): Promise<RitualState | null> {
  const raw = await cache.get(key);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as RitualState;
    return state.expiresAt > now ? state : null;
  } catch {
    return null;
  }
}

async function writeState(cache: CacheStore, key: string, state: RitualState, now: number): Promise<void> {
  await cache.set(key, JSON.stringify(state), Math.max(1, Math.ceil((state.expiresAt - now) / 1000)));
}

async function withLock<T>(cache: CacheStore, key: string, work: () => Promise<T>): Promise<T | null> {
  const lock = `${key}:lock`;
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    if (await cache.setnx(lock, '1', LOCK_TTL_SECONDS)) {
      try {
        return await work();
      } finally {
        await cache.del(lock);
      }
    }
    await sleep(LOCK_PAUSE_MS);
  }
  return null;
}

const isConsents = (value: unknown): value is RelationRitualConsents =>
  typeof value === 'object' && value !== null &&
  RELATION_RITUAL_CONSENT_KEYS.every((key) => typeof (value as Record<string, unknown>)[key] === 'boolean');

/** La demande de Sang EN ATTENTE entre les deux, dans un sens ou dans l'autre. */
const pendingBloodRequest = (prisma: RitualDb, a: string, b: string) =>
  prisma.friendRequest.findFirst({
    where: {
      status: 'pending',
      targetLevel: 'BLOOD',
      OR: [{ senderId: a, receiverId: b }, { senderId: b, receiverId: a }],
    },
    select: { id: true, senderId: true, receiverId: true },
  });

type Preconditions =
  | { readonly ok: true; readonly request: { id: string; senderId: string; receiverId: string } }
  | { readonly ok: false; readonly outcome: RitualOutcome };

/** Ce qui doit tenir à l'ouverture ET à l'achèvement : demande, absence de blocage, cran, série. */
async function checkPreconditions(deps: RitualDeps, actorId: string, otherId: string): Promise<Preconditions> {
  if (await isBlockedBetween(deps.prisma as unknown as PrismaClient, actorId, otherId)) return { ok: false, outcome: NO_REQUEST };
  const request = await pendingBloodRequest(deps.prisma, actorId, otherId);
  if (!request) return { ok: false, outcome: NO_REQUEST };

  const judgement = await judgeRelationRequest(deps.prisma, {
    requesterId: request.senderId, otherId: request.receiverId, targetLevel: 'BLOOD', now: deps.now(), ignoreCooldown: true,
  });
  if (judgement.allowed === false) {
    return { ok: false, outcome: refuse(409, judgement.code === 'RELATION_COOLDOWN' ? 'RELATION_NOT_ELIGIBLE' : judgement.code, 'Le rituel ne peut pas s\'ouvrir') };
  }
  return { ok: true, request };
}

async function start(deps: RitualDeps, actorId: string, otherId: string): Promise<RitualOutcome> {
  const checked = await checkPreconditions(deps, actorId, otherId);
  if (checked.ok === false) return checked.outcome;

  const now = deps.now().getTime();
  const key = stateKey(actorId, otherId);
  const state = await withLock(deps.cache, key, async () => {
    const existing = await readState(deps.cache, key, now);
    if (existing && existing.requestId === checked.request.id) return existing;
    const created: RitualState = {
      token: randomBytes(18).toString('base64url'),
      requestId: checked.request.id,
      expiresAt: now + RITUAL_TTL_MS,
      holds: {},
      confirms: {},
    };
    await writeState(deps.cache, key, created, now);
    return created;
  });
  if (!state) return refuse(409, 'RELATION_RITUAL_BUSY', 'Le rituel est en cours de mise à jour, réessayez');

  const expiresAt = new Date(state.expiresAt).toISOString();
  emitRitualStarted(deps.io, {
    toUserId: otherId, fromUserId: actorId, token: state.token, requestId: state.requestId, expiresAt, holdWindowMs: RITUAL_HOLD_VALID_MS,
  });
  return { ok: true, data: { token: state.token, requestId: state.requestId, expiresAt, holdWindowMs: RITUAL_HOLD_VALID_MS } };
}

type Transition =
  | { readonly kind: 'refuse'; readonly outcome: RitualOutcome; readonly drop?: boolean }
  | { readonly kind: 'save'; readonly state: RitualState; readonly data: Record<string, unknown>; readonly stage: 'held' | 'confirmed' }
  | { readonly kind: 'complete'; readonly state: RitualState };

const holdIsFresh = (state: RitualState, userId: string, now: number): boolean =>
  state.holds[userId] !== undefined && now - state.holds[userId] <= RITUAL_HOLD_VALID_MS;

function confirmTransition(state: RitualState, actorId: string, otherId: string, consents: unknown, now: number): Transition {
  if (!isConsents(consents)) {
    return { kind: 'refuse', outcome: refuse(400, 'RELATION_CONSENT_REQUIRED', 'Chaque partage doit être accepté ou refusé explicitement') };
  }
  const otherConfirmed = state.confirms[otherId] !== undefined;
  const neverHeld = state.holds[actorId] === undefined || (!otherConfirmed && state.holds[otherId] === undefined);
  if (neverHeld) {
    return { kind: 'refuse', outcome: refuse(409, 'RELATION_RITUAL_NOT_SYNCHRONISED', 'Les deux doivent tenir l\'écran') };
  }
  if (!holdIsFresh(state, actorId, now) || (!otherConfirmed && !holdIsFresh(state, otherId, now))) {
    return { kind: 'refuse', drop: true, outcome: refuse(409, 'RELATION_RITUAL_LAPSED', 'L\'autre a lâché, rien n\'est enregistré') };
  }
  const next: RitualState = { ...state, confirms: { ...state.confirms, [actorId]: consents } };
  return otherConfirmed ? { kind: 'complete', state: next } : { kind: 'save', state: next, data: { completed: false }, stage: 'confirmed' };
}

function nextTransition(
  state: RitualState,
  phase: 'hold' | 'confirm',
  actorId: string,
  otherId: string,
  consents: unknown,
  now: number,
): Transition {
  if (phase === 'hold') {
    return {
      kind: 'save',
      state: { ...state, holds: { ...state.holds, [actorId]: now } },
      data: { held: true, holdWindowMs: RITUAL_HOLD_VALID_MS },
      stage: 'held',
    };
  }
  return confirmTransition(state, actorId, otherId, consents, now);
}

const CONSENT_COLUMN: Readonly<Record<RelationRitualConsentKey, string>> = {
  listeningTitle: 'listeningTitleShared',
  locationLive: 'locationShared',
  locationHistory: 'locationHistoryShared',
  locationProximity: 'proximityShared',
};

const consentColumns = (consents: RelationRitualConsents): Record<string, boolean> =>
  Object.fromEntries(RELATION_RITUAL_CONSENT_KEYS.map((key) => [CONSENT_COLUMN[key], consents[key]]));

async function writeConsents(deps: RitualDeps, ownerId: string, otherId: string, consents: RelationRitualConsents, at: Date) {
  const columns = { ...consentColumns(consents), consentedAt: at };
  await deps.prisma.relationFeatureSetting.upsert({
    where: { ownerId_otherId: { ownerId, otherId } },
    create: { ownerId, otherId, ...columns },
    update: columns,
  });
}

async function complete(deps: RitualDeps, key: string, state: RitualState, actorId: string, otherId: string): Promise<RitualOutcome> {
  const checked = await checkPreconditions(deps, actorId, otherId);
  if (checked.ok === false) {
    await deps.cache.del(key);
    return checked.outcome;
  }

  const at = deps.now();
  await writeConsents(deps, actorId, otherId, state.confirms[actorId], at);
  await writeConsents(deps, otherId, actorId, state.confirms[otherId], at);

  const accepted = await deps.prisma.friendRequest.update({
    where: { id: checked.request.id, status: 'pending' },
    data: { status: 'accepted', respondedAt: at },
  }).then(() => true, () => false);
  if (!accepted) {
    await deps.cache.del(key);
    return NO_REQUEST;
  }

  try {
    await recordLevel(deps.prisma, { userA: actorId, userB: otherId, level: 'BLOOD', origin: 'request', at });
  } catch (error) {
    await deps.prisma.friendRequest.update({ where: { id: checked.request.id }, data: { status: 'pending', respondedAt: null } }).catch(() => undefined);
    throw error;
  }

  await deps.cache.del(key);
  await deps.forgetFriends([actorId, otherId]);
  emitRitualCompleted(deps.io, { userA: actorId, userB: otherId, token: state.token, level: 'BLOOD', at });
  emitRelationLevelRaised(deps.io, { userA: actorId, userB: otherId, level: 'BLOOD', at });
  return { ok: true, data: { completed: true, level: 'BLOOD' } };
}

async function advance(
  deps: RitualDeps,
  params: { phase: 'hold' | 'confirm'; actorId: string; otherId: string; token: unknown; consents: unknown },
): Promise<RitualOutcome> {
  const { phase, actorId, otherId } = params;
  const key = stateKey(actorId, otherId);
  const now = deps.now().getTime();

  const outcome = await withLock(deps.cache, key, async (): Promise<RitualOutcome> => {
    const state = await readState(deps.cache, key, now);
    if (!state || typeof params.token !== 'string' || params.token !== state.token) return INVALID;

    const step = nextTransition(state, phase, actorId, otherId, params.consents, now);
    if (step.kind === 'refuse') {
      if (step.drop) {
        await deps.cache.del(key);
        emitRitualProgress(deps.io, { toUserId: otherId, fromUserId: actorId, token: state.token, stage: 'lapsed' });
      }
      return step.outcome;
    }
    if (step.kind === 'complete') {
      await writeState(deps.cache, key, step.state, now);
      return complete(deps, key, step.state, actorId, otherId);
    }
    await writeState(deps.cache, key, step.state, now);
    emitRitualProgress(deps.io, { toUserId: otherId, fromUserId: actorId, token: state.token, stage: step.stage });
    return { ok: true, data: step.data };
  });

  return outcome ?? refuse(409, 'RELATION_RITUAL_BUSY', 'Le rituel est en cours de mise à jour, réessayez');
}

export async function runRitualPhase(
  deps: RitualDeps,
  params: { phase: RelationRitualPhase; actorId: string; otherId: string; token?: unknown; consents?: unknown },
): Promise<RitualOutcome> {
  if (params.phase === 'start') return start(deps, params.actorId, params.otherId);
  return advance(deps, { phase: params.phase, actorId: params.actorId, otherId: params.otherId, token: params.token, consents: params.consents });
}

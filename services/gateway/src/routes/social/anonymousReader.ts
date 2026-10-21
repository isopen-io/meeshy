import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { hashSessionToken } from '../../utils/session-token';
import { readerKeyOf } from '../../services/posts/readerKey';
import { addressFingerprintOf } from '../../utils/address-fingerprint';
import { recordAddressActivity } from './addressActivity';

/**
 * Le LECTEUR ANONYME d'une requête de portée (#10483) — qui il est, et combien
 * il a le droit d'écrire.
 *
 * Partagé par la porte `POST /social/events` et par ses alias historiques
 * (`/posts/:id/anonymous-view`, `/posts/:id/impression`,
 * `/posts/impressions/batch`) : une seule dérivation de clé, un seul budget.
 */

export type AnonymousReader = { readonly kind: 'anonymous'; readonly readerKey: string };

const SESSION_TOKEN_MAX_LENGTH = 128;

/** La valeur de X-Session-Token, si elle est utilisable (1 à 128 caractères). */
export function sessionTokenOf(request: Pick<FastifyRequest, 'headers'>): string | undefined {
  const brut = request.headers['x-session-token'];
  const valeur = Array.isArray(brut) ? brut[0] : brut;
  return typeof valeur === 'string' && valeur.length > 0 && valeur.length <= SESSION_TOKEN_MAX_LENGTH ? valeur : undefined;
}

const guestParticipantIdOf = (request: FastifyRequest): string | undefined => {
  const authContext = (request as UnifiedAuthRequest).authContext;
  return authContext?.type === 'anonymous' && authContext.isAuthenticated && authContext.participantId
    ? authContext.participantId
    : undefined;
};

/**
 * La clé, lue de ce que le middleware d'authentification a déjà résolu : un
 * invité reconnu ⇒ `participant:<id>`, sinon `token:<valeur>`. Synchrone — le
 * limiteur de débit la calcule à chaque requête.
 */
export function anonymousReaderKeyOf(request: FastifyRequest): string | undefined {
  const sessionToken = sessionTokenOf(request);
  if (!sessionToken) return undefined;
  return readerKeyOf({ sessionToken, participantId: guestParticipantIdOf(request) });
}

type GuestLookupPrisma = {
  readonly participant: {
    readonly findFirst: (args: {
      where: { sessionTokenHash: string; type: 'anonymous' };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
};

/**
 * Le lecteur anonyme d'une requête. Quand aucun middleware n'a tourné (les
 * alias historiques), l'invité se retrouve par l'EMPREINTE de son jeton, comme
 * le fait le middleware : le même invité garde la même clé quel que soit le
 * chemin. Une lecture en échec retombe sur la clé du jeton — elle compte
 * toujours, au pire comme un second lecteur.
 */
export async function resolveAnonymousReader(
  prisma: GuestLookupPrisma,
  request: FastifyRequest,
): Promise<AnonymousReader | undefined> {
  const sessionToken = sessionTokenOf(request);
  if (!sessionToken) return undefined;

  const known = guestParticipantIdOf(request);
  if (known || (request as UnifiedAuthRequest).authContext) {
    return { kind: 'anonymous', readerKey: readerKeyOf({ sessionToken, participantId: known }) };
  }

  const participantId = await guestParticipantIdByToken(prisma, sessionToken);
  return { kind: 'anonymous', readerKey: readerKeyOf({ sessionToken, participantId }) };
}

async function guestParticipantIdByToken(prisma: GuestLookupPrisma, sessionToken: string): Promise<string | undefined> {
  try {
    const row = await prisma.participant.findFirst({
      where: { sessionTokenHash: hashSessionToken(sessionToken), type: 'anonymous' },
      select: { id: true },
    });
    return row?.id;
  } catch {
    return undefined;
  }
}

/**
 * Les deux plafonds du débit anonyme, en ÉVÉNEMENTS par minute (règle du
 * porteur 2026-10-13) : un jeton revoit autant qu'il veut sous 60/min ; une
 * ADRESSE n'a qu'un plafond ÉLEVÉ anti-abus (600/min) — une famille, une
 * entreprise ou un incubateur partagent une IP et ne doivent jamais buter.
 */
export const ANONYMOUS_READER_BUDGET = 60;
export const ANONYMOUS_ADDRESS_BUDGET = 600;

/**
 * Deux SEAUX par lecteur, jamais un : le COMPTAGE (vue, ouverture,
 * impression — #10483) et le COMPORTEMENT v2 (défilement, lecture, capture…
 * — #10499). Un visiteur qui défile émet bien plus d'événements v2 que de
 * vues : partager le seau ferait refuser ses vues par son propre défilement,
 * et un affichage cesserait d'être compté. Un refus v2 n'entame jamais le
 * comptage, et inversement ; les plafonds sont du même ordre.
 */
export type AnonymousBudgetScope = 'counting' | 'v2';

const BUDGETS: Readonly<Record<AnonymousBudgetScope, { readonly prefix: string; readonly reader: number; readonly address: number }>> = {
  counting: { prefix: 'social:events:anon', reader: ANONYMOUS_READER_BUDGET, address: ANONYMOUS_ADDRESS_BUDGET },
  v2: { prefix: 'social:events:anon:v2', reader: ANONYMOUS_READER_BUDGET, address: ANONYMOUS_ADDRESS_BUDGET },
};
const WINDOW_MS = 60_000;
const MEMORY_COUNTERS_MAX = 50_000;

type Counter = { count: number; resetAt: number };

const memoryCounters = new WeakMap<object, Map<string, Counter>>();

/** Ajoute `weight` au compteur ; rend sa valeur AVANT l'ajout. */
const addInMemory = (owner: object, key: string, weight: number, now: number): number => {
  const counters = memoryCounters.get(owner) ?? new Map<string, Counter>();
  memoryCounters.set(owner, counters);
  const current = counters.get(key);
  const before = current && current.resetAt > now ? current.count : 0;
  const resetAt = current && current.resetAt > now ? current.resetAt : now + WINDOW_MS;
  counters.delete(key);
  counters.set(key, { count: before + weight, resetAt });
  if (counters.size > MEMORY_COUNTERS_MAX) {
    const oldest = counters.keys().next().value;
    if (oldest !== undefined) counters.delete(oldest);
  }
  return before;
};

type WeightedRedis = {
  incrby(key: string, increment: number): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
};

/** Rend la valeur AVANT l'ajout ; une panne de Redis refuse tout (fail-closed). */
const addInRedis = async (redis: WeightedRedis, key: string, weight: number): Promise<number> => {
  try {
    const after = await redis.incrby(key, weight);
    if (after === weight) await redis.pexpire(key, WINDOW_MS).catch(() => 0);
    return after - weight;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

/**
 * Le débit d'un lecteur anonyme, compté en ÉVÉNEMENTS : rend combien des
 * `events` demandés sont admis (0 ⇒ refus). Un lot qui déborde est admis
 * jusqu'au plafond, le reste écarté. Deux compteurs : la clé de lecteur, et
 * l'empreinte d'ADRESSE (`addressFingerprintOf`, HMAC tournant chaque jour,
 * sans agent utilisateur) — une CLÉ de compteur, jamais une écriture en base.
 * Les événements admis alimentent l'agrégat quotidien par empreinte
 * (`recordAddressActivity`), seule trace qui permet un bannissement manuel.
 */
export async function admitAnonymousEvents(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reader: AnonymousReader,
  events: number,
  scope: AnonymousBudgetScope = 'counting',
): Promise<number> {
  if (events <= 0) return 0;
  const now = Date.now();
  const fingerprint = addressFingerprintOf({ ip: request.ip, now });
  const budget = BUDGETS[scope];
  const limits = [
    { key: `${budget.prefix}:reader:${reader.readerKey}`, max: budget.reader },
    { key: `${budget.prefix}:address:${fingerprint}`, max: budget.address },
  ] as const;

  const redis = (fastify as { redis?: WeightedRedis | null }).redis ?? null;
  const befores = await Promise.all(limits.map(({ key }) =>
    redis ? addInRedis(redis, key, events) : addInMemory(fastify, key, events, now)));
  const admitted = Math.max(0, Math.min(events, ...limits.map(({ max }, i) => max - befores[i])));
  await recordAddressActivity(fastify, { fingerprint, events: admitted, now });
  return admitted;
}

/** Le débit d'UN événement — les alias unitaires. */
export async function admitAnonymousReader(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reader: AnonymousReader,
): Promise<boolean> {
  return (await admitAnonymousEvents(fastify, request, reader, 1)) > 0;
}

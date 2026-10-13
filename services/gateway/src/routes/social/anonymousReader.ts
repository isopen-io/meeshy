import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { hashSessionToken } from '../../utils/session-token';
import { readerKeyOf } from '../../services/posts/readerKey';
import { anonymousVisitorFingerprint } from '../links/utils/link-visitor';
import { checkSharedRateLimit, type IncrementableRedis } from '../posts/socialRateLimit';

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

/** Les deux plafonds du débit anonyme, par minute. */
export const ANONYMOUS_READER_BUDGET = 60;
export const ANONYMOUS_ADDRESS_BUDGET = 120;
const WINDOW_MS = 60_000;
const MEMORY_COUNTERS_MAX = 50_000;

type Counter = { count: number; resetAt: number };

const memoryCounters = new WeakMap<object, Map<string, Counter>>();

const countInMemory = (owner: object, key: string, max: number, now: number): boolean => {
  const counters = memoryCounters.get(owner) ?? new Map<string, Counter>();
  memoryCounters.set(owner, counters);
  const current = counters.get(key);
  const next = current && current.resetAt > now
    ? { count: current.count + 1, resetAt: current.resetAt }
    : { count: 1, resetAt: now + WINDOW_MS };
  counters.delete(key);
  counters.set(key, next);
  if (counters.size > MEMORY_COUNTERS_MAX) {
    const oldest = counters.keys().next().value;
    if (oldest !== undefined) counters.delete(oldest);
  }
  return next.count <= max;
};

const userAgentOf = (request: FastifyRequest): string => {
  const value = request.headers['user-agent'];
  return Array.isArray(value) ? value.join(' ') : value ?? '';
};

/**
 * Le débit d'un lecteur anonyme : 60 lots par minute par clé de lecteur, 120
 * par minute par EMPREINTE d'adresse (`anonymousVisitorFingerprint`, HMAC à
 * période tournante). L'empreinte n'est qu'une CLÉ de compteur — Redis ou
 * mémoire —, jamais une écriture en base.
 *
 * Avec Redis, une panne REFUSE (`checkSharedRateLimit`, fail-closed) : la
 * panne du gardien ne devient pas l'absence de garde. Sans Redis (dev, tests),
 * un compteur en mémoire bornée.
 */
export async function admitAnonymousReader(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reader: AnonymousReader,
): Promise<boolean> {
  const fingerprint = anonymousVisitorFingerprint({ ip: request.ip, userAgent: userAgentOf(request) });
  const limits = [
    { key: `social:events:anon:reader:${reader.readerKey}`, max: ANONYMOUS_READER_BUDGET },
    { key: `social:events:anon:address:${fingerprint}`, max: ANONYMOUS_ADDRESS_BUDGET },
  ] as const;

  const redis = (fastify as { redis?: IncrementableRedis | null }).redis ?? null;
  if (!redis) {
    const now = Date.now();
    return limits.map(({ key, max }) => countInMemory(fastify, key, max, now)).every(Boolean);
  }
  const verdicts = await Promise.all(limits.map(({ key, max }) =>
    checkSharedRateLimit({ redis, key, max, windowMs: WINDOW_MS })));
  return verdicts.every((verdict) => verdict.allowed);
}

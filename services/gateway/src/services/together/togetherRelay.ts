/**
 * LE RELAIS DE LA SÉANCE « ENSEMBLE » (#17011, #17012).
 *
 * L'hôte invite un Proche à lire une pièce jointe audio ou vidéo d'une conversation
 * commune ; l'invité rejoint ; chacun publie lecture, pause et déplacement, que le relais
 * horodate à l'horloge du serveur et sert aux DEUX (tous leurs appareils), par les rooms
 * `user:<id>` — jamais la room de la conversation.
 *
 * Chaque acceptation et chaque synchronisation REJUGE la paire (`togetherGate.ts`) : une
 * baisse, un blocage, un départ de la conversation ou un média devenu protégé coupe la
 * séance chez les deux, dite comme un départ (`left`) : le bloqué n'apprend rien de plus.
 * Une pierre tombale posée par la fin protège de la course entre un jugement et l'écriture. Les routes qui changent un lien appellent
 * {@link rejudgeTogetherBetween} : la coupure n'attend pas la synchronisation suivante.
 *
 * Le journal ne porte jamais la séance : seulement l'erreur.
 */
import { randomBytes } from 'node:crypto';
import type { ZodType } from 'zod';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  TOGETHER_ERROR_CODES,
  TOGETHER_INVITE_TTL_SECONDS,
  TOGETHER_SESSION_TTL_SECONDS,
  togetherInvitePayloadSchema,
  togetherSessionPayloadSchema,
  togetherSyncPayloadSchema,
  type TogetherEndReason,
  type TogetherErrorCode,
  type TogetherInviteAck,
  type TogetherJoinAck,
  type TogetherLeaveAck,
  type TogetherStartedEventData,
  type TogetherSyncAck,
} from '@meeshy/shared/types/together';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { judgeTogether, type TogetherGateDb, type TogetherVerdict } from './togetherGate';
import {
  claimPairThroughCache,
  clearTogether,
  indexTogetherUsers,
  isTogetherEnded,
  markTogetherEnded,
  readPairTogether,
  readTogether,
  readUserTogether,
  storeTogether,
  togetherPairKey,
  type PairClaim,
  type TogetherCache,
  type TogetherSession,
} from './togetherStore';

export type TogetherIo = ServerEmitIO;

export type TogetherRelayDeps = {
  readonly prisma: TogetherGateDb;
  readonly cache: TogetherCache;
  readonly io: TogetherIo | undefined;
  readonly now: () => number;
  /** La prise atomique de l'index de paire ; absente, le cache la simule (un seul processus). */
  readonly claimPair?: PairClaim;
  readonly newSessionId?: () => string;
};

type Refusal = { readonly success: false; readonly error: string; readonly code: TogetherErrorCode };

const refusal = (code: TogetherErrorCode, error: string): Refusal => ({ success: false, error, code });
const NOT_ALLOWED = refusal(TOGETHER_ERROR_CODES.NOT_ALLOWED, 'Lecture ensemble indisponible');
const INVALID = refusal(TOGETHER_ERROR_CODES.INVALID, 'Charge illisible');
const NOT_FOUND = refusal(TOGETHER_ERROR_CODES.NOT_FOUND, 'Séance introuvable');
const UNAVAILABLE = refusal(TOGETHER_ERROR_CODES.UNAVAILABLE, 'Lecture ensemble momentanément indisponible');

const randomSessionId = (): string => randomBytes(16).toString('hex');

const emitTo = (io: TogetherIo | undefined, userIds: readonly string[], event: string, data: unknown): void => {
  userIds.forEach((userId) => {
    try {
      io?.to(ROOMS.user(userId)).emit(event as never, data as never);
    } catch {
      /* l'état est déjà écrit : un événement perdu se rattrape au geste suivant */
    }
  });
};

const membersOf = (session: TogetherSession): readonly string[] => [session.hostId, session.guestId];

const parse = <T>(schema: ZodType<T>, data: unknown): T | null => {
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : null;
};

const ttlOf = (session: TogetherSession): number => (session.joined ? TOGETHER_SESSION_TTL_SECONDS : TOGETHER_INVITE_TTL_SECONDS);

/**
 * Écrit la séance, puis relit sa pierre tombale : une coupure survenue entre le jugement et
 * l'écriture l'emporte — ce qui vient d'être écrit est effacé, et rien ne sera émis (`null`).
 * La durée de vie est PLAFONNÉE à `TOGETHER_SESSION_TTL_SECONDS` depuis la création : une
 * synchronisation prolonge la séance, jamais au-delà.
 */
async function save(deps: TogetherRelayDeps, session: TogetherSession, options: { readonly pairClaimed?: boolean } = {}): Promise<TogetherSession | null> {
  const now = deps.now();
  const expiresAt = Math.min(now + ttlOf(session) * 1000, session.createdAt + TOGETHER_SESSION_TTL_SECONDS * 1000);
  const ttl = Math.max(1, Math.ceil((expiresAt - now) / 1000));
  const kept = { ...session, expiresAt };
  await storeTogether(deps.cache, kept, ttl, options);
  if (options.pairClaimed) await indexTogetherUsers(deps.cache, kept, ttl);
  if (!(await isTogetherEnded(deps.cache, kept.sessionId))) return kept;
  await clearTogether(deps.cache, kept);
  return null;
}

/**
 * La fin, dite aux deux par la MÊME raison : une coupure (blocage, baisse, départ, média
 * devenu protégé) se dit `left`, comme un départ — celui qu'on a bloqué ou quitté n'en
 * apprend pas davantage.
 */
async function end(deps: TogetherRelayDeps, session: TogetherSession, reason: TogetherEndReason): Promise<void> {
  await markTogetherEnded(deps.cache, session.sessionId, TOGETHER_SESSION_TTL_SECONDS);
  await clearTogether(deps.cache, session);
  emitTo(deps.io, membersOf(session), SERVER_EVENTS.TOGETHER_ENDED, {
    sessionId: session.sessionId,
    reason,
    endedAt: new Date(deps.now()).toISOString(),
  });
}

const judge = (deps: TogetherRelayDeps, session: Pick<TogetherSession, 'hostId' | 'guestId' | 'conversationId' | 'attachmentId'>): Promise<TogetherVerdict> =>
  judgeTogether({ prisma: deps.prisma, now: new Date(deps.now()) }, session);

/** Rejuge une séance en cours ; refusée, elle finit chez les deux comme un départ. */
async function stillAllowed(deps: TogetherRelayDeps, session: TogetherSession): Promise<boolean> {
  const verdict = await judge(deps, session).catch((): TogetherVerdict => ({ ok: false }));
  if (verdict.ok) return true;
  await end(deps, session, 'left');
  return false;
}

const startedOf = (session: TogetherSession): TogetherStartedEventData => ({
  sessionId: session.sessionId,
  hostUserId: session.hostId,
  guestUserId: session.guestId,
  conversationId: session.conversationId,
  attachmentId: session.attachmentId,
  media: session.media,
  playback: session.playback,
});

export async function inviteTogether(deps: TogetherRelayDeps, hostId: string, data: unknown): Promise<TogetherInviteAck> {
  const payload = parse(togetherInvitePayloadSchema, data);
  if (!payload) return INVALID;
  const subject = { hostId, guestId: payload.toUserId, conversationId: payload.conversationId, attachmentId: payload.attachmentId };
  let verdict: TogetherVerdict;
  try {
    verdict = await judge(deps, subject);
  } catch {
    return UNAVAILABLE;
  }
  if (!verdict.ok) return NOT_ALLOWED;

  const sessionId = (deps.newSessionId ?? randomSessionId)();
  const pairKey = togetherPairKey(hostId, payload.toUserId);
  try {
    const displacedId = await (deps.claimPair ?? claimPairThroughCache(deps.cache))(
      pairKey,
      sessionId,
      TOGETHER_INVITE_TTL_SECONDS,
    );
    const displaced = displacedId && displacedId !== sessionId ? await readTogether(deps.cache, displacedId, deps.now()) : null;
    if (displaced) await end(deps, displaced, 'replaced');
  } catch {
    return UNAVAILABLE;
  }

  const session = await save(
    deps,
    {
      ...subject,
      sessionId,
      media: verdict.media,
      joined: false,
      playback: { playing: false, positionMs: 0, at: deps.now(), rev: 0, byUserId: hostId },
      createdAt: deps.now(),
      expiresAt: 0,
    },
    { pairClaimed: true },
  );
  if (!session) return UNAVAILABLE;
  /*
   * Une invitation concurrente a pu prendre l'index de la paire avant que celle-ci soit écrite :
   * elle n'a alors rien trouvé à terminer, et c'est à celle-ci, qui n'est plus la séance de la
   * paire, de se retirer — sans rien émettre.
   */
  const stillPairs = (await deps.cache.get(pairKey).catch(() => null)) === session.sessionId;
  const stillAllowedNow = stillPairs && (await judge(deps, subject).then((again) => again.ok, () => false));
  if (!stillAllowedNow) {
    await markTogetherEnded(deps.cache, session.sessionId, TOGETHER_SESSION_TTL_SECONDS);
    await clearTogether(deps.cache, session);
    return stillPairs ? NOT_ALLOWED : UNAVAILABLE;
  }
  const expiresAt = new Date(session.expiresAt).toISOString();
  emitTo(deps.io, [session.guestId], SERVER_EVENTS.TOGETHER_INVITED, {
    sessionId: session.sessionId,
    fromUserId: hostId,
    conversationId: session.conversationId,
    attachmentId: session.attachmentId,
    media: session.media,
    expiresAt,
  });
  return { success: true, data: { sessionId: session.sessionId, expiresAt, media: session.media } };
}

export async function joinTogether(deps: TogetherRelayDeps, userId: string, data: unknown): Promise<TogetherJoinAck> {
  const payload = parse(togetherSessionPayloadSchema, data);
  if (!payload) return INVALID;
  const session = await readTogether(deps.cache, payload.sessionId, deps.now());
  if (!session || session.joined || session.guestId !== userId) return NOT_FOUND;
  if (!(await stillAllowed(deps, session))) return NOT_FOUND;

  const joined = await save(deps, { ...session, joined: true, playback: { ...session.playback, at: deps.now() } });
  if (!joined) return NOT_FOUND;
  const started = startedOf(joined);
  emitTo(deps.io, membersOf(joined), SERVER_EVENTS.TOGETHER_STARTED, started);
  return { success: true, data: started };
}

export async function syncTogether(deps: TogetherRelayDeps, userId: string, data: unknown): Promise<TogetherSyncAck> {
  const payload = parse(togetherSyncPayloadSchema, data);
  if (!payload) return INVALID;
  const session = await readTogether(deps.cache, payload.sessionId, deps.now());
  if (!session || !session.joined || !membersOf(session).includes(userId)) return NOT_FOUND;
  if (!(await stillAllowed(deps, session))) return NOT_FOUND;

  const playback = { playing: payload.playing, positionMs: payload.positionMs, at: deps.now(), rev: session.playback.rev + 1, byUserId: userId };
  const synced = await save(deps, { ...session, playback });
  if (!synced) return NOT_FOUND;
  emitTo(deps.io, membersOf(synced), SERVER_EVENTS.TOGETHER_SYNCED, { sessionId: synced.sessionId, playback });
  return { success: true, data: { playback } };
}

export async function leaveTogether(deps: TogetherRelayDeps, userId: string, data: unknown): Promise<TogetherLeaveAck> {
  const payload = parse(togetherSessionPayloadSchema, data);
  if (!payload) return INVALID;
  const session = await readTogether(deps.cache, payload.sessionId, deps.now());
  if (!session || !membersOf(session).includes(userId)) return NOT_FOUND;
  await end(deps, session, !session.joined && userId === session.guestId ? 'declined' : 'left');
  return { success: true };
}

/**
 * À appeler quand la DERNIÈRE socket d'un compte se ferme : ses séances en cours (invitations
 * comprises) finissent chez les deux, comme un départ — ou un refus s'il n'avait pas rejoint.
 */
export async function endTogetherOf(deps: TogetherRelayDeps, userId: string): Promise<void> {
  const sessions = await readUserTogether(deps.cache, userId, deps.now());
  await Promise.all(sessions.map((session) => end(deps, session, !session.joined && userId === session.guestId ? 'declined' : 'left')));
}

/** À appeler APRÈS un blocage, une baisse ou un retrait : la séance de la paire est rejugée, coupée si refusée. */
export async function rejudgeTogetherBetween(deps: TogetherRelayDeps, pair: { readonly userA: string; readonly userB: string }): Promise<void> {
  const session = await readPairTogether(deps.cache, pair.userA, pair.userB, deps.now());
  if (session) await stillAllowed(deps, session);
}

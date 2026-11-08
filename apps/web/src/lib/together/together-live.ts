import { createStore, type StoreApi } from 'zustand/vanilla';

import { TOGETHER_END_REASONS, TOGETHER_ERROR_CODES, TOGETHER_INVITE_TTL_SECONDS, TOGETHER_MEDIA_KINDS, type TogetherMediaKind } from '@meeshy/shared/types/together-constants';
import type { TogetherEndedEventData, TogetherInvitedEventData, TogetherPlayback, TogetherStartedEventData, TogetherSyncedEventData } from '@meeshy/shared/types/together';
import { TOGETHER_CLIENT_EVENTS, TOGETHER_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/together-event-names';

import type { SocketClient } from '@/lib/net/socket';

import { estimateClockOffset } from './together-sync';

/**
 * **REGARDER OU ÉCOUTER ENSEMBLE, SUR CET ONGLET** (#17055, sous-lot web de
 * #17011, contrat `packages/shared/types/together.ts`).
 *
 * - `together:invited` propose (jamais ma propre invitation, partie d'un autre de
 *   mes appareils) ; l'invitation s'éteint `TOGETHER_INVITE_TTL_SECONDS` après sa
 *   RÉCEPTION, comptés à l'horloge de l'onglet.
 * - `together:started` ouvre la séance chez l'hôte et l'invité, et elle seule ;
 *   l'accusé de `join` l'ouvre aussi, sans attendre l'événement (qui rejoint est
 *   l'invité).
 * - `together:synced` fait suivre la lecture ; un `rev` déjà appliqué ne rejoue rien.
 * - `together:ended` ferme ; une séance close ne se rouvre pas sur un événement en
 *   retard (sa trace est gardée, bornée).
 * - Chaque `at` reçu mesure l'écart entre l'horloge du serveur et celle de l'onglet.
 *
 * Le serveur a déjà jugé (Proche ou Sang, conversation commune, média lisible) : ce
 * client ne rejuge rien. Un refus se dit par son issue, jamais par sa raison.
 */

export type TogetherSession = TogetherStartedEventData & {
  /** L'autre de la séance : l'invité quand je suis l'hôte, l'hôte sinon. */
  readonly partnerId: string;
};

export type TogetherInvitation = TogetherInvitedEventData & { readonly receivedAt: number };

export type TogetherOutgoing = { readonly sessionId: string; readonly toUserId: string; readonly media: TogetherMediaKind };

export type TogetherState = {
  readonly invitation: TogetherInvitation | null;
  readonly outgoing: TogetherOutgoing | null;
  readonly session: TogetherSession | null;
  /** Horloge du serveur − horloge de l'onglet (ms), ou `null` avant tout échantillon. */
  readonly clockOffsetMs: number | null;
  invited(data: TogetherInvitedEventData): void;
  waiting(outgoing: TogetherOutgoing): void;
  started(data: TogetherStartedEventData, viewerId: string): void;
  synced(data: TogetherSyncedEventData): void;
  /** Ferme la séance (ou l'invitation, ou l'attente) ici ; elle ne se rouvrira pas. */
  ended(sessionId: string): void;
  expireInvitation(): void;
  msUntilInvitationExpiry(): number | null;
};

export type TogetherStoreApi = StoreApi<TogetherState>;

const CLOSED_MEMORY = 32;
const INVITE_TTL_MS = TOGETHER_INVITE_TTL_SECONDS * 1000;

export function createTogetherStore({ now = Date.now }: { readonly now?: () => number } = {}): TogetherStoreApi {
  let closed: readonly string[] = [];
  const isClosed = (sessionId: string): boolean => closed.includes(sessionId);
  const measure = (current: number | null, at: number): number => estimateClockOffset(current, { serverAt: at, localAt: now() });
  return createStore<TogetherState>((set, get) => ({
    invitation: null,
    outgoing: null,
    session: null,
    clockOffsetMs: null,
    invited: (data) => {
      if (isClosed(data.sessionId)) return;
      set({ invitation: { ...data, receivedAt: now() } });
    },
    waiting: (outgoing) => {
      if (!isClosed(outgoing.sessionId)) set({ outgoing });
    },
    started: (data, viewerId) => {
      if (isClosed(data.sessionId)) return;
      const partnerId = data.hostUserId === viewerId ? data.guestUserId : data.guestUserId === viewerId ? data.hostUserId : null;
      if (partnerId === null) return;
      set((state) => ({
        session: { ...data, partnerId },
        invitation: state.invitation?.sessionId === data.sessionId ? null : state.invitation,
        outgoing: state.outgoing?.sessionId === data.sessionId ? null : state.outgoing,
        clockOffsetMs: measure(state.clockOffsetMs, data.playback.at),
      }));
    },
    synced: (data) =>
      set((state) => {
        const session = state.session;
        if (session === null || session.sessionId !== data.sessionId || data.playback.rev <= session.playback.rev) return state;
        return { session: { ...session, playback: data.playback }, clockOffsetMs: measure(state.clockOffsetMs, data.playback.at) };
      }),
    ended: (sessionId) => {
      closed = [...closed.filter((id) => id !== sessionId), sessionId].slice(-CLOSED_MEMORY);
      set((state) => ({
        session: state.session?.sessionId === sessionId ? null : state.session,
        invitation: state.invitation?.sessionId === sessionId ? null : state.invitation,
        outgoing: state.outgoing?.sessionId === sessionId ? null : state.outgoing,
      }));
    },
    expireInvitation: () => {
      const invitation = get().invitation;
      if (invitation !== null && now() - invitation.receivedAt > INVITE_TTL_MS) get().ended(invitation.sessionId);
    },
    msUntilInvitationExpiry: () => {
      const invitation = get().invitation;
      return invitation === null ? null : Math.max(0, invitation.receivedAt + INVITE_TTL_MS - now());
    },
  }));
}

type Wire = Readonly<Record<string, unknown>>;

const objectOf = (raw: unknown): Wire | null => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Wire) : null);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const countOf = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);
const mediaOf = (value: unknown): TogetherMediaKind | null => TOGETHER_MEDIA_KINDS.find((kind) => kind === value) ?? null;

function decodePlayback(raw: unknown): TogetherPlayback | null {
  const wire = objectOf(raw);
  const positionMs = countOf(wire?.positionMs);
  const at = countOf(wire?.at);
  const rev = countOf(wire?.rev);
  const byUserId = textOf(wire?.byUserId);
  if (typeof wire?.playing !== 'boolean' || positionMs === null || at === null || rev === null || byUserId === null) return null;
  return { playing: wire.playing, positionMs, at, rev, byUserId };
}

export function decodeTogetherInvited(raw: unknown): TogetherInvitedEventData | null {
  const wire = objectOf(raw);
  const [sessionId, fromUserId, conversationId, attachmentId, expiresAt] = [wire?.sessionId, wire?.fromUserId, wire?.conversationId, wire?.attachmentId, wire?.expiresAt].map(textOf);
  const media = mediaOf(wire?.media);
  if (sessionId == null || fromUserId == null || conversationId == null || attachmentId == null || expiresAt == null || media === null) return null;
  return { sessionId, fromUserId, conversationId, attachmentId, media, expiresAt };
}

export function decodeTogetherStarted(raw: unknown): TogetherStartedEventData | null {
  const wire = objectOf(raw);
  const [sessionId, hostUserId, guestUserId, conversationId, attachmentId] = [wire?.sessionId, wire?.hostUserId, wire?.guestUserId, wire?.conversationId, wire?.attachmentId].map(textOf);
  const media = mediaOf(wire?.media);
  const playback = decodePlayback(wire?.playback);
  if (sessionId == null || hostUserId == null || guestUserId == null || conversationId == null || attachmentId == null || media === null || playback === null) return null;
  return { sessionId, hostUserId, guestUserId, conversationId, attachmentId, media, playback };
}

export function decodeTogetherSynced(raw: unknown): TogetherSyncedEventData | null {
  const wire = objectOf(raw);
  const sessionId = textOf(wire?.sessionId);
  const playback = decodePlayback(wire?.playback);
  return sessionId === null || playback === null ? null : { sessionId, playback };
}

export function decodeTogetherEnded(raw: unknown): TogetherEndedEventData | null {
  const wire = objectOf(raw);
  const sessionId = textOf(wire?.sessionId);
  const endedAt = textOf(wire?.endedAt);
  const reason = TOGETHER_END_REASONS.find((candidate) => candidate === wire?.reason);
  return sessionId === null || endedAt === null || reason === undefined ? null : { sessionId, reason, endedAt };
}

export const togetherStore: TogetherStoreApi = createTogetherStore();

export function bindTogetherLive({ socket, store, viewerId }: { readonly socket: SocketClient; readonly store: TogetherStoreApi; readonly viewerId: () => string | null }): () => void {
  const onInvited = (payload: unknown): void => {
    const data = decodeTogetherInvited(payload);
    if (data !== null && data.fromUserId !== viewerId()) store.getState().invited(data);
  };
  const onStarted = (payload: unknown): void => {
    const data = decodeTogetherStarted(payload);
    const me = viewerId();
    if (data !== null && me !== null) store.getState().started(data, me);
  };
  const onSynced = (payload: unknown): void => {
    const data = decodeTogetherSynced(payload);
    if (data !== null) store.getState().synced(data);
  };
  const onEnded = (payload: unknown): void => {
    const data = decodeTogetherEnded(payload);
    if (data !== null) store.getState().ended(data.sessionId);
  };
  socket.on(TOGETHER_SERVER_EVENTS.TOGETHER_INVITED, onInvited);
  socket.on(TOGETHER_SERVER_EVENTS.TOGETHER_STARTED, onStarted);
  socket.on(TOGETHER_SERVER_EVENTS.TOGETHER_SYNCED, onSynced);
  socket.on(TOGETHER_SERVER_EVENTS.TOGETHER_ENDED, onEnded);
  return () => {
    socket.off(TOGETHER_SERVER_EVENTS.TOGETHER_INVITED, onInvited);
    socket.off(TOGETHER_SERVER_EVENTS.TOGETHER_STARTED, onStarted);
    socket.off(TOGETHER_SERVER_EVENTS.TOGETHER_SYNCED, onSynced);
    socket.off(TOGETHER_SERVER_EVENTS.TOGETHER_ENDED, onEnded);
  };
}

export type TogetherInviteOutcome = 'invited' | 'not-allowed' | 'rate-limited' | 'offline' | 'failed';
export type TogetherJoinOutcome = 'joined' | 'gone' | 'offline' | 'failed';

export type TogetherClient = {
  invite(target: { readonly toUserId: string; readonly conversationId: string; readonly attachmentId: string }): Promise<TogetherInviteOutcome>;
  join(sessionId: string): Promise<TogetherJoinOutcome>;
  decline(sessionId: string): void;
  sync(state: { readonly playing: boolean; readonly positionMs: number }): Promise<void>;
  leave(): void;
};

const ACK_MS = 8_000;

const GONE_CODES: ReadonlySet<unknown> = new Set([TOGETHER_ERROR_CODES.NOT_FOUND, TOGETHER_ERROR_CODES.NOT_ALLOWED]);

const refusalOf = (code: unknown): TogetherInviteOutcome => {
  if (code === TOGETHER_ERROR_CODES.NOT_ALLOWED) return 'not-allowed';
  if (code === TOGETHER_ERROR_CODES.RATE_LIMITED) return 'rate-limited';
  return 'failed';
};

export function createTogetherClient({ socket, store }: { readonly socket: () => SocketClient | null; readonly store: TogetherStoreApi }): TogetherClient {
  const live = (): (SocketClient & Required<Pick<SocketClient, 'emitWithAck'>>) | null => {
    const current = socket();
    if (current === null || !current.connected || current.emitWithAck === undefined) return null;
    return current as SocketClient & Required<Pick<SocketClient, 'emitWithAck'>>;
  };
  const ask = (event: string, payload: unknown): Promise<Wire | null> | null => {
    const current = live();
    if (current === null) return null;
    return current.emitWithAck(event, payload, ACK_MS).then(objectOf, () => null);
  };
  const leaveSession = (sessionId: string): void => {
    store.getState().ended(sessionId);
    socket()?.emit(TOGETHER_CLIENT_EVENTS.TOGETHER_LEAVE, { sessionId });
  };

  return {
    invite: async (target) => {
      const pending = ask(TOGETHER_CLIENT_EVENTS.TOGETHER_INVITE, { toUserId: target.toUserId, conversationId: target.conversationId, attachmentId: target.attachmentId });
      if (pending === null) return 'offline';
      const ack = await pending;
      if (ack === null) return 'failed';
      const data = objectOf(ack.data);
      const sessionId = textOf(data?.sessionId);
      const media = mediaOf(data?.media);
      if (ack.success !== true || sessionId === null || media === null) return refusalOf(ack.code);
      store.getState().waiting({ sessionId, toUserId: target.toUserId, media });
      return 'invited';
    },
    join: async (sessionId) => {
      const pending = ask(TOGETHER_CLIENT_EVENTS.TOGETHER_JOIN, { sessionId });
      if (pending === null) return 'offline';
      const ack = await pending;
      if (ack === null) return 'failed';
      const data = ack.success === true ? decodeTogetherStarted(ack.data) : null;
      if (data === null && GONE_CODES.has(ack.code)) {
        store.getState().ended(sessionId);
        return 'gone';
      }
      if (data === null) return 'failed';
      store.getState().started(data, data.guestUserId);
      return 'joined';
    },
    decline: (sessionId) => leaveSession(sessionId),
    sync: async ({ playing, positionMs }) => {
      const session = store.getState().session;
      if (session === null) return;
      const ack = await ask(TOGETHER_CLIENT_EVENTS.TOGETHER_SYNC, { sessionId: session.sessionId, playing, positionMs: Math.max(0, Math.round(positionMs)) });
      const playback = ack?.success === true ? decodePlayback(objectOf(ack.data)?.playback) : null;
      if (playback !== null) store.getState().synced({ sessionId: session.sessionId, playback });
    },
    leave: () => {
      const { session, outgoing } = store.getState();
      const sessionId = session?.sessionId ?? outgoing?.sessionId;
      if (sessionId !== undefined) leaveSession(sessionId);
    },
  };
}

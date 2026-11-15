import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { MeeshySocket as Socket } from './typed-socket';
import { guardedTimeout } from '../utils/guarded-timer';

export type AfterReadReader = {
  readonly conversationId: string;
  readonly participantId: string;
  /** La clé de room du lecteur : `User.id`, ou `Participant.id` d'un invité. */
  readonly readerKey: string;
};

export type AfterReadDeparture = AfterReadReader & {
  /** La première ouverture de la période qui se clôt : seul ce qui a été lu depuis compte. */
  readonly openedAt: Date;
};

export interface AfterReadDepartureTrackerDependencies {
  /** Le lecteur qu'un socket ouvre dans une conversation, ou `null` s'il n'y est pas participant vivant. */
  resolveReader: (socketId: string, rawConversationId: string) => Promise<AfterReadReader | null>;
  /** L'identifiant canonique d'une conversation (`identifier` → ObjectId). L'identité par défaut. */
  normalizeConversationId?: (rawConversationId: string) => Promise<string>;
  /** « Vu puis quitté » constaté par le serveur. Une levée est absorbée. */
  onDeparture: (departure: AfterReadDeparture) => Promise<void>;
  /** Le délai laissé à une déconnexion, un arrière-plan ou un écran poussé pour se reprendre. */
  graceMs?: number;
  now?: () => Date;
  onError?: (error: unknown) => void;
}

export const AFTER_READ_DEPARTURE_GRACE_MS = 30_000;

type Holding = 'room' | 'view';

type SocketState = {
  readonly rooms: ReadonlyMap<string, AfterReadReader>;
  readonly views: ReadonlyMap<string, AfterReadReader>;
  readonly background: boolean;
};

const EMPTY: SocketState = { rooms: new Map(), views: new Map(), background: false };

const departureKey = (reader: AfterReadReader) => `${reader.readerKey}\u0000${reader.conversationId}`;

const without = (held: ReadonlyMap<string, AfterReadReader>, conversationId: string) =>
  new Map([...held].filter(([id]) => id !== conversationId));

/**
 * « Vu puis quitté », constaté par le serveur (#18556).
 *
 * Le client appelle `POST …/after-read/consume` quand le lecteur quitte la
 * conversation ; une app tuée, un réseau coupé ou un client ancien ne
 * l'appellent jamais. Ce registre suit DEUX signaux distincts, par socket :
 *
 * - la ROOM (`conversation:join` / `conversation:leave`) dit que la
 *   conversation est ouverte ;
 * - le REGARD (`viewing:start` / `viewing:stop`) dit qu'elle est à l'écran —
 *   iOS émet `viewing:stop` sans quitter la room quand une fiche est poussée,
 *   qu'un appel arrive ou que l'app passe en arrière-plan.
 *
 * Le départ n'est déclaré AUSSITÔT qu'à la fermeture de la room
 * (`conversation:leave`) quand aucun autre appareil du lecteur ne la tient.
 * Un `viewing:stop` sans room tenue, une déconnexion ou un passage en
 * arrière-plan sont des départs soumis à la grâce, qu'un `viewing:start` ou un
 * `conversation:join` du même lecteur, sur n'importe quel appareil, annule. Une
 * room tenue par un appareil en arrière-plan ne retient rien.
 *
 * Tout vit en mémoire et LOCAL AU NŒUD, comme `ConversationViewingHandler`.
 */
export class AfterReadDepartureTracker {
  private readonly resolveReader: AfterReadDepartureTrackerDependencies['resolveReader'];
  private readonly normalize: (rawConversationId: string) => Promise<string>;
  private readonly onDeparture: AfterReadDepartureTrackerDependencies['onDeparture'];
  private readonly graceMs: number;
  private readonly now: () => Date;
  private readonly onError: (error: unknown) => void;
  private readonly sockets = new Map<string, SocketState>();
  private readonly holders = new Map<string, ReadonlySet<string>>();
  private readonly openedAt = new Map<string, Date>();
  private readonly pendingDepartures = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly queueBySocket = new Map<string, Promise<void>>();

  constructor(deps: AfterReadDepartureTrackerDependencies) {
    this.resolveReader = deps.resolveReader;
    this.normalize = deps.normalizeConversationId ?? (async (rawConversationId) => rawConversationId);
    this.onDeparture = deps.onDeparture;
    this.graceMs = deps.graceMs ?? AFTER_READ_DEPARTURE_GRACE_MS;
    this.now = deps.now ?? (() => new Date());
    this.onError = deps.onError ?? (() => undefined);
  }

  listen(socket: Socket): void {
    const on = (event: string, act: (socketId: string, conversationId: string) => Promise<void>) => {
      socket.on(event as typeof CLIENT_EVENTS.CONVERSATION_JOIN, (data: unknown) => {
        const conversationId = conversationIdOf(data);
        if (conversationId) void act(socket.id, conversationId);
      });
    };
    on(CLIENT_EVENTS.CONVERSATION_JOIN, (id, conversationId) => this.open(id, conversationId));
    on(CLIENT_EVENTS.CONVERSATION_LEAVE, (id, conversationId) => this.close(id, conversationId));
    on(CLIENT_EVENTS.VIEWING_START, (id, conversationId) => this.viewStart(id, conversationId));
    on(CLIENT_EVENTS.VIEWING_STOP, (id, conversationId) => this.viewStop(id, conversationId));
    socket.on(CLIENT_EVENTS.PRESENCE_APP_STATE, (data) => {
      if (data?.foreground === false) void this.background(socket.id);
    });
  }

  /** `conversation:join`. */
  open(socketId: string, rawConversationId: string): Promise<void> {
    return this.inOrder(socketId, () => this.hold(socketId, rawConversationId, 'room'));
  }

  /** `conversation:leave` — le regard part avec la room. */
  close(socketId: string, rawConversationId: string): Promise<void> {
    return this.inOrder(socketId, async () => {
      const reader = await this.release(socketId, rawConversationId, ['room', 'view']);
      if (!reader || this.isHeld(reader)) return;
      this.cancelPending(departureKey(reader));
      this.depart(reader);
    });
  }

  /** `viewing:start`. */
  viewStart(socketId: string, rawConversationId: string): Promise<void> {
    return this.inOrder(socketId, () => this.hold(socketId, rawConversationId, 'view'));
  }

  /** `viewing:stop` — un écran poussé, un appel, l'arrière-plan : la room reste tenue. */
  viewStop(socketId: string, rawConversationId: string): Promise<void> {
    return this.inOrder(socketId, async () => {
      const reader = await this.release(socketId, rawConversationId, ['view']);
      if (!reader || this.isHeld(reader)) return;
      this.departAfterGrace(reader);
    });
  }

  background(socketId: string): Promise<void> {
    return this.inOrder(socketId, async () => {
      const state = this.sockets.get(socketId);
      if (!state) return;
      this.sockets.set(socketId, { ...state, background: true });
      this.heldBy(state).filter((reader) => !this.isHeld(reader)).forEach((reader) => this.departAfterGrace(reader));
    });
  }

  disconnecting(socketId: string): Promise<void> {
    return this.inOrder(socketId, async () => {
      const state = this.sockets.get(socketId);
      if (!state) return;
      const held = this.heldBy(state);
      this.sockets.delete(socketId);
      held.forEach((reader) => this.unindex(reader, socketId));
      held.filter((reader) => !this.isHeld(reader)).forEach((reader) => this.departAfterGrace(reader));
    });
  }

  private async hold(socketId: string, rawConversationId: string, holding: Holding): Promise<void> {
    const reader = await this.resolveReader(socketId, rawConversationId);
    if (!reader) return;
    const state = this.sockets.get(socketId) ?? EMPTY;
    const add = (held: ReadonlyMap<string, AfterReadReader>) => new Map([...held, [reader.conversationId, reader]]);
    this.sockets.set(socketId, {
      rooms: holding === 'room' ? add(state.rooms) : state.rooms,
      views: holding === 'view' ? add(state.views) : state.views,
      background: false,
    });
    const key = departureKey(reader);
    this.holders.set(key, new Set([...(this.holders.get(key) ?? []), socketId]));
    if (!this.openedAt.has(key)) this.openedAt.set(key, this.now());
    this.cancelPending(key);
  }

  private async release(socketId: string, rawConversationId: string, holdings: readonly Holding[]): Promise<AfterReadReader | null> {
    const state = this.sockets.get(socketId);
    if (!state) return null;
    const find = (conversationId: string) => state.rooms.get(conversationId) ?? state.views.get(conversationId);
    const reader = find(rawConversationId) ?? find(await this.normalize(rawConversationId));
    if (!reader) return null;
    const next: SocketState = {
      rooms: holdings.includes('room') ? without(state.rooms, reader.conversationId) : state.rooms,
      views: holdings.includes('view') ? without(state.views, reader.conversationId) : state.views,
      background: state.background,
    };
    this.sockets.set(socketId, next);
    if (!next.rooms.has(reader.conversationId) && !next.views.has(reader.conversationId)) this.unindex(reader, socketId);
    return reader;
  }

  private heldBy(state: SocketState): AfterReadReader[] {
    return [...new Map([...state.rooms, ...state.views]).values()];
  }

  private unindex(reader: AfterReadReader, socketId: string): void {
    const key = departureKey(reader);
    const remaining = [...(this.holders.get(key) ?? [])].filter((id) => id !== socketId);
    if (remaining.length > 0) this.holders.set(key, new Set(remaining));
    else this.holders.delete(key);
  }

  private isHeld(reader: AfterReadReader): boolean {
    return [...(this.holders.get(departureKey(reader)) ?? [])].some((socketId) => {
      const state = this.sockets.get(socketId);
      return state !== undefined && !state.background;
    });
  }

  private departAfterGrace(reader: AfterReadReader): void {
    const key = departureKey(reader);
    this.cancelPending(key);
    const timer = guardedTimeout({
      name: 'after-read-departure',
      afterMs: this.graceMs,
      logger: { error: (_message, error) => this.onError(error) },
      run: () => {
        this.pendingDepartures.delete(key);
        if (this.isHeld(reader)) return;
        this.depart(reader);
      },
    });
    timer.unref?.();
    this.pendingDepartures.set(key, timer);
  }

  private depart(reader: AfterReadReader): void {
    const key = departureKey(reader);
    const openedAt = this.openedAt.get(key);
    if (!this.holders.has(key)) this.openedAt.delete(key);
    if (!openedAt) return;
    try {
      void this.onDeparture({ ...reader, openedAt }).catch((error: unknown) => this.onError(error));
    } catch (error) {
      this.onError(error);
    }
  }

  private cancelPending(key: string): void {
    const timer = this.pendingDepartures.get(key);
    if (!timer) return;
    clearTimeout(timer);
    this.pendingDepartures.delete(key);
  }

  private inOrder(socketId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queueBySocket.get(socketId) ?? Promise.resolve();
    const run = previous.then(task).catch((error: unknown) => this.onError(error));
    const settled = run.then(() => {
      if (this.queueBySocket.get(socketId) === settled) this.queueBySocket.delete(socketId);
    });
    this.queueBySocket.set(socketId, settled);
    return run;
  }
}

function conversationIdOf(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('conversationId' in data)) return null;
  const { conversationId } = data as { conversationId: unknown };
  return typeof conversationId === 'string' && conversationId.length > 0 ? conversationId : null;
}

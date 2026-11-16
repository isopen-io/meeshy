import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { MeeshySocket as Socket } from './typed-socket';
import { guardedTimeout } from '../utils/guarded-timer';

export type AfterReadReader = {
  readonly conversationId: string;
  readonly participantId: string;
  /** La clé de room du lecteur : `User.id`, ou `Participant.id` d'un invité. */
  readonly readerKey: string;
};

/** Un REGARD : la conversation a été à l'écran, au premier plan, de `from` à `to`. */
export type AfterReadPeriod = { readonly from: Date; readonly to: Date };

export type AfterReadDeparture = AfterReadReader & {
  /** Les regards clos depuis le dernier départ : seul ce qui a été lu PENDANT l'un d'eux compte. */
  readonly periods: readonly AfterReadPeriod[];
};

export interface AfterReadDepartureTrackerDependencies {
  /** Le lecteur qu'un socket regarde dans une conversation, ou `null` s'il n'y est pas participant vivant. */
  resolveReader: (socketId: string, rawConversationId: string) => Promise<AfterReadReader | null>;
  /** L'identifiant canonique d'une conversation (`identifier` → ObjectId). L'identité par défaut. */
  normalizeConversationId?: (rawConversationId: string) => Promise<string>;
  /** « Vu puis quitté » constaté par le serveur. Une levée est absorbée. */
  onDeparture: (departure: AfterReadDeparture) => Promise<void>;
  /**
   * Le lecteur est-il retenu dans la conversation sans la regarder (un appel en cours) ? Un `viewing:stop`
   * n'y arme alors aucun départ ; la déconnexion et l'arrière-plan, si. Une levée vaut oui.
   */
  holdsDeparture?: (reader: AfterReadReader) => Promise<boolean>;
  /** Un appareil du lecteur regarde-t-il encore la conversation depuis un AUTRE nœud ? Une levée vaut oui. */
  viewedElsewhere?: (reader: AfterReadReader) => Promise<boolean>;
  /** Publie le regard d'un socket aux autres nœuds (une room dédiée). */
  markViewing?: (socketId: string, reader: AfterReadReader, viewing: boolean) => void;
  /** Le socket est-il déjà inscrit ? Un regard annoncé avant est rejoué par `afterAuthentication`. */
  isAuthenticated?: (socketId: string) => boolean;
  /** Le délai laissé à une déconnexion ou à un arrière-plan pour se reprendre. */
  graceMs?: number;
  /** Le délai laissé à un `viewing:stop` sur une socket vivante (fiche poussée, appel) pour revenir. */
  viewStopGraceMs?: number;
  now?: () => Date;
  onError?: (error: unknown) => void;
}

export const AFTER_READ_DEPARTURE_GRACE_MS = 30_000;
/**
 * Un lecteur qui reste connecté et quitte la conversation (`viewing:stop`) : au-delà, ses flammes lues
 * brûlent. Assez long pour une fiche poussée puis refermée, assez court pour que la sortie se voie.
 */
export const AFTER_READ_VIEW_STOP_GRACE_MS = 10_000;
/**
 * Un départ refusé (un autre appareil du lecteur regarde, la vérification ne conclut pas) ou qui échoue
 * se REDEMANDE, à intervalle doublé depuis la grâce jusqu'à ce plafond…
 */
export const AFTER_READ_MAX_RETRY_DELAY_MS = 10 * 60_000;
/** …et au plus ce nombre de fois (≈ 48 h) : au-delà, la rétention des flammes a déjà fait son œuvre. */
export const AFTER_READ_MAX_DEPARTURE_RETRIES = 300;
/** Au-delà, les regards les plus ANCIENS sont oubliés : ce qu'ils ont montré attend la sortie déclarée par le client. */
export const AFTER_READ_MAX_PERIODS = 32;
/** Conversations dont un socket garde des regards non consommés ; au-delà, les plus anciennes sont oubliées. */
export const AFTER_READ_MAX_TOUCHED = 64;
const MAX_PENDING_OPENINGS = 8;

type SocketState = {
  readonly views: ReadonlyMap<string, AfterReadReader>;
  /** Les conversations auxquelles ce socket a contribué un regard depuis leur dernier départ. */
  readonly touched: ReadonlyMap<string, AfterReadReader>;
};

type Regard = { readonly closed: readonly AfterReadPeriod[]; readonly openedAt: Date | null };

type PendingDeparture = { readonly timer: ReturnType<typeof setTimeout>; readonly dueAt: number };

const EMPTY: SocketState = { views: new Map(), touched: new Map() };
const NO_REGARD: Regard = { closed: [], openedAt: null };

const keyOf = (reader: AfterReadReader) => `${reader.readerKey}\u0000${reader.conversationId}`;

const without = <V>(held: ReadonlyMap<string, V>, id: string) => new Map([...held].filter(([key]) => key !== id));

const withMember = (set: ReadonlySet<string> | undefined, member: string) => new Set([...(set ?? []), member]);

const withoutMember = (set: ReadonlySet<string> | undefined, member: string) =>
  new Set([...(set ?? [])].filter((id) => id !== member));

/**
 * « Vu puis quitté », constaté par le serveur (#18556).
 *
 * Le client appelle `POST …/after-read/consume` quand le lecteur quitte la
 * conversation ; une app tuée, un réseau coupé ou un client ancien ne
 * l'appellent jamais. Ce registre tient DEUX choses distinctes :
 *
 * - le REGARD (`viewing:start` / `viewing:stop`, premier plan) — la seule
 *   preuve qu'une conversation a été à l'écran. Chaque regard clos est une
 *   PÉRIODE, et seule une lecture posée pendant une période sera consommée :
 *   une réponse depuis une bannière ou un widget marque « lu » sans rien
 *   afficher, et la room d'une conversation est tenue toute la vie de la
 *   socket sur iOS — ni l'une ni l'autre ne prouve qu'une flamme a été vue ;
 * - le DÉPART — l'appareil qui a regardé S'EN VA : déconnexion ou
 *   arrière-plan, après la grâce ; `conversation:leave`, aussitôt ; un
 *   `viewing:stop` sur une socket VIVANTE, après une grâce courte
 *   (`AFTER_READ_VIEW_STOP_GRACE_MS`) qu'un `viewing:start` sur la même
 *   conversation annule. Le serveur ne compte pas sur le client pour
 *   consommer en sortant : « si le lecteur quitte, tout ce qu'il a lu brûle ».
 *   Un appel VIVANT de la conversation (`holdsDeparture`) couvre l'écran sans
 *   la quitter : son `viewing:stop` n'arme rien. Une échéance armée n'est
 *   jamais RACCOURCIE : une déconnexion garde sa grâce entière.
 *
 * Un départ n'a lieu que si AUCUN appareil du lecteur ne regarde plus la
 * conversation — sur ce nœud (registre) comme sur les autres
 * (`viewedElsewhere`). Refusé — ou s'il échoue —, il GARDE ses périodes et se
 * redemande, à intervalle doublé jusqu'à `AFTER_READ_MAX_RETRY_DELAY_MS`. Accompli, il emporte les périodes, qui sont alors OUBLIÉES : une
 * lecture posée après lui n'appartient à aucun regard.
 *
 * Tout vit en mémoire ; un redémarrage perd les périodes en cours, et ce
 * qu'elles ont montré attend la sortie déclarée par le client ou le plafond de
 * rétention — jamais une supposition.
 */
export class AfterReadDepartureTracker {
  private readonly resolveReader: AfterReadDepartureTrackerDependencies['resolveReader'];
  private readonly normalize: (rawConversationId: string) => Promise<string>;
  private readonly onDeparture: AfterReadDepartureTrackerDependencies['onDeparture'];
  private readonly viewedElsewhere: (reader: AfterReadReader) => Promise<boolean>;
  private readonly holdsDeparture: (reader: AfterReadReader) => Promise<boolean>;
  private readonly markViewing: (socketId: string, reader: AfterReadReader, viewing: boolean) => void;
  private readonly isAuthenticated: (socketId: string) => boolean;
  private readonly graceMs: number;
  private readonly viewStopGraceMs: number;
  private readonly now: () => Date;
  private readonly onError: (error: unknown) => void;
  private readonly sockets = new Map<string, SocketState>();
  private readonly viewers = new Map<string, ReadonlySet<string>>();
  private readonly contributors = new Map<string, ReadonlySet<string>>();
  private readonly regards = new Map<string, Regard>();
  private readonly pendingOpenings = new Map<string, ReadonlySet<string>>();
  private readonly pendingDepartures = new Map<string, PendingDeparture>();
  private readonly departureRetries = new Map<string, number>();
  private readonly queueBySocket = new Map<string, Promise<void>>();

  constructor(deps: AfterReadDepartureTrackerDependencies) {
    this.resolveReader = deps.resolveReader;
    this.normalize = deps.normalizeConversationId ?? (async (rawConversationId) => rawConversationId);
    this.onDeparture = deps.onDeparture;
    this.viewedElsewhere = deps.viewedElsewhere ?? (async () => false);
    this.holdsDeparture = deps.holdsDeparture ?? (async () => false);
    this.markViewing = deps.markViewing ?? (() => undefined);
    this.isAuthenticated = deps.isAuthenticated ?? (() => true);
    this.graceMs = deps.graceMs ?? AFTER_READ_DEPARTURE_GRACE_MS;
    this.viewStopGraceMs = deps.viewStopGraceMs ?? AFTER_READ_VIEW_STOP_GRACE_MS;
    this.now = deps.now ?? (() => new Date());
    this.onError = deps.onError ?? (() => undefined);
  }

  listen(socket: Socket): void {
    const on = (event: string, act: (socketId: string, conversationId: string) => Promise<void>) => {
      socket.on(event as typeof CLIENT_EVENTS.VIEWING_START, (data: unknown) => {
        const conversationId = conversationIdOf(data);
        if (conversationId) void act(socket.id, conversationId);
      });
    };
    on(CLIENT_EVENTS.VIEWING_START, (id, conversationId) => this.viewStart(id, conversationId));
    on(CLIENT_EVENTS.VIEWING_STOP, (id, conversationId) => this.viewStop(id, conversationId));
    on(CLIENT_EVENTS.CONVERSATION_LEAVE, (id, conversationId) => this.close(id, conversationId));
    socket.on(CLIENT_EVENTS.PRESENCE_APP_STATE, (data) => {
      if (data?.foreground === false) void this.background(socket.id);
    });
  }

  /** `viewing:start` — la conversation est à l'écran, au premier plan. */
  viewStart(socketId: string, rawConversationId: string): Promise<void> {
    return this.inOrder(socketId, () => this.look(socketId, rawConversationId));
  }

  /** `viewing:stop` — le lecteur quitte la conversation, la socket vit : le départ part après la grâce courte, sauf appel. */
  viewStop(socketId: string, rawConversationId: string): Promise<void> {
    return this.inOrder(socketId, async () => {
      this.forgetPendingOpening(socketId, rawConversationId);
      const reader = await this.heldBy(socketId, rawConversationId, 'views');
      if (!reader) return;
      this.lookAway(socketId, reader);
      if (await this.isHeld(reader)) return;
      this.departAfterGrace(reader, this.viewStopGraceMs);
    });
  }

  /** `conversation:leave` — la sortie DÉCLARÉE : ce qui a été regardé part aussitôt. */
  close(socketId: string, rawConversationId: string): Promise<void> {
    return this.inOrder(socketId, async () => {
      this.forgetPendingOpening(socketId, rawConversationId);
      const reader = await this.heldBy(socketId, rawConversationId, 'touched');
      if (!reader) return;
      this.lookAway(socketId, reader);
      this.cancelPending(keyOf(reader));
      await this.depart(reader);
    });
  }

  background(socketId: string): Promise<void> {
    return this.inOrder(socketId, async () => {
      this.pendingOpenings.delete(socketId);
      const state = this.sockets.get(socketId);
      if (!state) return;
      [...state.views.values()].forEach((reader) => this.lookAway(socketId, reader));
      [...state.touched.values()].forEach((reader) => this.departAfterGrace(reader));
    });
  }

  disconnecting(socketId: string): Promise<void> {
    return this.inOrder(socketId, async () => {
      this.pendingOpenings.delete(socketId);
      const state = this.sockets.get(socketId);
      if (!state) return;
      [...state.views.values()].forEach((reader) => this.lookAway(socketId, reader));
      const touched = [...state.touched.values()];
      this.sockets.delete(socketId);
      touched.forEach((reader) => this.departAfterGrace(reader));
    });
  }

  /** Le socket vient d'être inscrit : les regards annoncés trop tôt s'ouvrent maintenant. */
  afterAuthentication(socketId: string): Promise<void> {
    return this.inOrder(socketId, async () => {
      const pending = [...(this.pendingOpenings.get(socketId) ?? [])];
      this.pendingOpenings.delete(socketId);
      for (const rawConversationId of pending) await this.look(socketId, rawConversationId);
    });
  }

  private async look(socketId: string, rawConversationId: string): Promise<void> {
    if (!this.isAuthenticated(socketId)) {
      const previous = [...(this.pendingOpenings.get(socketId) ?? [])].filter((id) => id !== rawConversationId);
      this.pendingOpenings.set(socketId, new Set([...previous, rawConversationId].slice(-MAX_PENDING_OPENINGS)));
      return;
    }
    const reader = await this.resolveReader(socketId, rawConversationId);
    if (!reader) return;
    const key = keyOf(reader);
    const state = this.sockets.get(socketId) ?? EMPTY;
    const touched = new Map([...without(state.touched, reader.conversationId), [reader.conversationId, reader]]);
    const evicted = [...touched.values()].slice(0, Math.max(0, touched.size - AFTER_READ_MAX_TOUCHED));
    this.sockets.set(socketId, {
      views: new Map([...state.views, [reader.conversationId, reader]]),
      touched: new Map([...touched].slice(evicted.length)),
    });
    evicted.forEach((old) => this.withdraw(socketId, old));
    this.viewers.set(key, withMember(this.viewers.get(key), socketId));
    this.contributors.set(key, withMember(this.contributors.get(key), socketId));
    const regard = this.regards.get(key) ?? NO_REGARD;
    if (!regard.openedAt) this.regards.set(key, { ...regard, openedAt: this.now() });
    this.cancelPending(key);
    this.departureRetries.delete(key);
    this.mark(socketId, reader, true);
  }

  /** Le socket ne regarde plus : le regard se clôt quand plus aucun socket du lecteur ne le tient. */
  private lookAway(socketId: string, reader: AfterReadReader): void {
    const state = this.sockets.get(socketId);
    if (!state?.views.has(reader.conversationId)) return;
    this.sockets.set(socketId, { ...state, views: without(state.views, reader.conversationId) });
    this.mark(socketId, reader, false);
    const key = keyOf(reader);
    const remaining = withoutMember(this.viewers.get(key), socketId);
    if (remaining.size > 0) {
      this.viewers.set(key, remaining);
      return;
    }
    this.viewers.delete(key);
    const regard = this.regards.get(key);
    if (!regard?.openedAt) return;
    const closed = [...regard.closed, { from: regard.openedAt, to: this.now() }].slice(-AFTER_READ_MAX_PERIODS);
    this.regards.set(key, { closed, openedAt: null });
  }

  /** Un socket évincé ne contribue plus : sans autre contributeur, ses regards sont oubliés. */
  private withdraw(socketId: string, reader: AfterReadReader): void {
    this.lookAway(socketId, reader);
    const key = keyOf(reader);
    const remaining = withoutMember(this.contributors.get(key), socketId);
    if (remaining.size > 0) {
      this.contributors.set(key, remaining);
      return;
    }
    this.forget(key);
  }

  private async heldBy(
    socketId: string,
    rawConversationId: string,
    holding: 'views' | 'touched',
  ): Promise<AfterReadReader | null> {
    const held = this.sockets.get(socketId)?.[holding];
    if (!held || held.size === 0) return null;
    return held.get(rawConversationId) ?? held.get(await this.normalize(rawConversationId)) ?? null;
  }

  /** Une échéance déjà armée plus TARD n'est jamais raccourcie : une déconnexion garde sa grâce entière. */
  private departAfterGrace(reader: AfterReadReader, afterMs: number = this.graceMs): void {
    const key = keyOf(reader);
    if (!this.regards.has(key)) return;
    const dueAt = Date.now() + afterMs;
    if ((this.pendingDepartures.get(key)?.dueAt ?? -Infinity) > dueAt) return;
    this.cancelPending(key);
    const timer = guardedTimeout({
      name: 'after-read-departure',
      afterMs,
      logger: { error: (_message, error) => this.onError(error) },
      run: () => {
        this.pendingDepartures.delete(key);
        void this.depart(reader).catch((error: unknown) => this.onError(error));
      },
    });
    timer.unref?.();
    this.pendingDepartures.set(key, { timer, dueAt });
  }

  private async depart(reader: AfterReadReader): Promise<void> {
    const key = keyOf(reader);
    if (this.isViewedHere(key)) return;
    const periods = this.takePeriods(key);
    if (periods.length === 0) return;

    let elsewhere = true;
    try {
      elsewhere = await this.viewedElsewhere(reader);
    } catch (error) {
      this.onError(error);
    }
    if (elsewhere || this.isViewedHere(key)) {
      this.restorePeriods(key, periods);
      if (!this.isViewedHere(key)) this.retryLater(reader);
      return;
    }

    try {
      await this.onDeparture({ ...reader, periods });
    } catch (error) {
      this.onError(error);
      this.restorePeriods(key, periods);
      this.retryLater(reader);
      return;
    }
    this.departureRetries.delete(key);
    this.settle(key);
  }

  private async isHeld(reader: AfterReadReader): Promise<boolean> {
    try {
      return await this.holdsDeparture(reader);
    } catch (error) {
      this.onError(error);
      return true;
    }
  }

  private isViewedHere(key: string): boolean {
    return (this.viewers.get(key)?.size ?? 0) > 0;
  }

  /** Les regards clos sont retirés AVANT l'attente : deux départs concurrents ne déclarent pas deux fois. */
  private takePeriods(key: string): readonly AfterReadPeriod[] {
    const regard = this.regards.get(key);
    if (!regard || regard.closed.length === 0) return [];
    this.regards.set(key, { closed: [], openedAt: regard.openedAt });
    return regard.closed;
  }

  /** Un départ refusé rend ses regards, devant ceux qui se sont clos pendant l'attente. */
  private restorePeriods(key: string, periods: readonly AfterReadPeriod[]): void {
    const regard = this.regards.get(key) ?? NO_REGARD;
    const closed = [...periods, ...regard.closed].slice(-AFTER_READ_MAX_PERIODS);
    this.regards.set(key, { closed, openedAt: regard.openedAt });
  }

  private retryLater(reader: AfterReadReader): void {
    const key = keyOf(reader);
    const attempts = (this.departureRetries.get(key) ?? 0) + 1;
    if (attempts > AFTER_READ_MAX_DEPARTURE_RETRIES) {
      this.forget(key);
      return;
    }
    this.departureRetries.set(key, attempts);
    const delay = Math.min(this.graceMs * 2 ** Math.min(attempts - 1, 20), AFTER_READ_MAX_RETRY_DELAY_MS);
    this.departAfterGrace(reader, delay);
  }

  /** Un regard vide (rien de clos, rien d'ouvert) libère ses contributeurs. */
  private settle(key: string): void {
    const regard = this.regards.get(key);
    if (regard && !regard.openedAt && regard.closed.length === 0) this.forget(key);
  }

  /** Les regards CLOS d'une clé sont oubliés ; un regard encore ouvert garde son début. */
  private forget(key: string): void {
    this.departureRetries.delete(key);
    const regard = this.regards.get(key);
    if (regard?.openedAt) {
      this.regards.set(key, { closed: [], openedAt: regard.openedAt });
      return;
    }
    this.regards.delete(key);
    const conversationId = key.slice(key.indexOf('\u0000') + 1);
    [...(this.contributors.get(key) ?? [])].forEach((socketId) => {
      const state = this.sockets.get(socketId);
      if (state) this.sockets.set(socketId, { ...state, touched: without(state.touched, conversationId) });
    });
    this.contributors.delete(key);
  }

  private mark(socketId: string, reader: AfterReadReader, viewing: boolean): void {
    try {
      this.markViewing(socketId, reader, viewing);
    } catch (error) {
      this.onError(error);
    }
  }

  private forgetPendingOpening(socketId: string, rawConversationId: string): void {
    const pending = this.pendingOpenings.get(socketId);
    if (!pending) return;
    const remaining = withoutMember(pending, rawConversationId);
    if (remaining.size > 0) this.pendingOpenings.set(socketId, remaining);
    else this.pendingOpenings.delete(socketId);
  }

  private cancelPending(key: string): void {
    const pending = this.pendingDepartures.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
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

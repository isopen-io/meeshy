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
   * Le lecteur est-il retenu hors de la conversation sans l'avoir quittée (un appel VIVANT, quel qu'il
   * soit) ? Un départ attendu se réexamine alors jusqu'à la fin de l'appel ; `conversation:leave`
   * n'attend pas. Une levée vaut oui.
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
 * brûlent. Assez long pour une fiche, les infos ou une galerie poussées puis refermées ; défaut tracé,
 * décision du porteur en attente (#18837). `conversation:leave` brûle toujours aussitôt.
 */
export const AFTER_READ_VIEW_STOP_GRACE_MS = 60_000;
/**
 * Un départ en ATTENTE — retenu par un appel, ou refusé parce qu'un autre appareil du lecteur regarde —
 * se réexamine à cet intervalle fixe…
 */
export const AFTER_READ_RECHECK_MS = 20_000;
/**
 * Plafond DUR de toute retenue (appel, autre appareil, vérification en échec), compté depuis la fin de la
 * grâce d'origine : au-delà, le départ BRÛLE. Rien ne garde une flamme lue indéfiniment.
 */
export const AFTER_READ_MAX_HOLD_MS = 10 * 60_000;
/**
 * Un départ en ÉCHEC (vérification ou consommation qui lève) se redemande à intervalle doublé jusqu'à ce
 * plafond, sans jamais être oublié : une consommation qui échoue se redemande tant que la base refuse.
 */
export const AFTER_READ_MAX_RETRY_DELAY_MS = 10 * 60_000;
/** Au-delà, les regards les plus ANCIENS brûlent aussitôt (`onDeparture`) : aucun n'est jamais jeté. */
export const AFTER_READ_MAX_PERIODS = 32;
/** `viewing:start` acceptés par socket et par minute : au-delà, aucun regard ne s'ouvre (le script, pas l'usage). */
export const AFTER_READ_VIEW_STARTS_PER_MINUTE = 60;
/**
 * Regards en débordement gardés EXACTS par clé pendant une panne (deux dates chacun) : en deçà, aucun trou
 * n'est jamais fusionné. Au-delà — dernier recours, choix du coordinateur sur #18556 — les voisins les plus
 * proches fusionnent en un intervalle couvrant, qui peut brûler un instant non regardé.
 */
export const AFTER_READ_MAX_OVERFLOW_PERIODS_PER_KEY = 1_024;
/** Même borne, toutes clés confondues : au-delà, une clé ne garde qu'un seul intervalle couvrant. */
export const AFTER_READ_MAX_OVERFLOW_PERIODS = 65_536;
const VIEW_START_WINDOW_MS = 60_000;
/** Conversations dont un socket garde des regards non consommés ; au-delà, les plus anciennes sont oubliées. */
export const AFTER_READ_MAX_TOUCHED = 64;
const MAX_PENDING_OPENINGS = 8;

type SocketState = {
  readonly views: ReadonlyMap<string, AfterReadReader>;
  /** Les conversations auxquelles ce socket a contribué un regard depuis leur dernier départ. */
  readonly touched: ReadonlyMap<string, AfterReadReader>;
};

type Regard = { readonly closed: readonly AfterReadPeriod[]; readonly openedAt: Date | null };

/** Les regards évincés d'une clé, en attente de brûlure : UNE seule brûlure en vol, ou un seul minuteur. */
type Overflow = {
  readonly reader: AfterReadReader;
  readonly periods: readonly AfterReadPeriod[];
  readonly busy: boolean;
  readonly attempts: number;
  readonly timer: ReturnType<typeof setTimeout> | null;
};

/**
 * `yieldsTo` : l'échéance d'un `viewing:stop` cède à une plus PROCHE armée par la MÊME socket (son
 * arrière-plan, sa déconnexion) ; à celle d'un autre appareil, jamais. Les autres échéances ne cèdent pas.
 */
type PendingDeparture = {
  readonly timer: ReturnType<typeof setTimeout>;
  readonly dueAt: number;
  readonly yieldsTo: string | null;
  /** La socket dont l'arrière-plan ou la déconnexion a armé l'échéance : les répéter ne la repousse pas. */
  readonly armedBy: string | null;
  /** Une sortie déclarée (`conversation:leave`) qui se redemande reste insensible aux appels. */
  readonly holdable: boolean;
};

type Arming = {
  readonly yieldsTo?: string;
  readonly by?: string;
  readonly holdable?: boolean;
  /** Une consommation en échec APRÈS le plafond se redemande à son propre intervalle, sans boucle à 0 ms. */
  readonly unbounded?: boolean;
};

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
 *   `viewing:stop` sur une socket VIVANTE, après sa propre grâce
 *   (`AFTER_READ_VIEW_STOP_GRACE_MS`) qu'un `viewing:start` sur la même
 *   conversation annule. Le serveur ne compte pas sur le client pour
 *   consommer en sortant : « si le lecteur quitte, tout ce qu'il a lu brûle ».
 *   Un appel VIVANT, quel qu'il soit (`holdsDeparture`), couvre l'écran sans
 *   que le lecteur ait quitté : tout départ ATTENDU se réexamine toutes les
 *   `AFTER_READ_RECHECK_MS` jusqu'à la fin de l'appel. Une échéance armée
 *   n'est jamais RACCOURCIE, sauf celle d'un `viewing:stop`.
 *
 * Un départ n'a lieu que si AUCUN appareil du lecteur ne regarde plus la
 * conversation — sur ce nœud (registre) comme sur les autres
 * (`viewedElsewhere`). Refusé, il GARDE ses périodes et se réexamine à
 * intervalle fixe ; en échec, il les garde aussi et se redemande à intervalle
 * doublé jusqu'à `AFTER_READ_MAX_RETRY_DELAY_MS`. Accompli, il emporte les périodes, qui sont alors OUBLIÉES : une
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
  /**
   * La fin de la PREMIÈRE grâce armée depuis que le dernier regard s'est clos : la base du plafond dur. Aucun
   * réarmement (appel, autre appareil, échec, arrière-plans alternés) ne la déplace ; jamais posée pendant un
   * regard, elle repart à chaque clôture.
   */
  private readonly holdSince = new Map<string, number>();
  /** Les clés dont le départ a été retenu par un appel : à sa fin, une grâce entière se rouvre. */
  private readonly heldByCall = new Set<string>();
  private readonly queueBySocket = new Map<string, Promise<void>>();
  private readonly overflows = new Map<string, Overflow>();
  private readonly viewStarts = new Map<string, readonly number[]>();

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
    if (!this.admitViewStart(socketId)) return Promise.resolve();
    return this.inOrder(socketId, () => this.look(socketId, rawConversationId));
  }

  /** `viewing:stop` — le lecteur quitte la conversation, la socket vit : le départ part après sa grâce, sauf appel. */
  viewStop(socketId: string, rawConversationId: string): Promise<void> {
    return this.inOrder(socketId, async () => {
      this.forgetPendingOpening(socketId, rawConversationId);
      const reader = await this.heldBy(socketId, rawConversationId, 'views');
      if (!reader) return;
      this.lookAway(socketId, reader);
      this.departAfterGrace(reader, this.viewStopGraceMs, { yieldsTo: socketId });
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
      await this.depart(reader, { holdable: false });
    });
  }

  background(socketId: string): Promise<void> {
    return this.inOrder(socketId, async () => {
      this.pendingOpenings.delete(socketId);
      const state = this.sockets.get(socketId);
      if (!state) return;
      [...state.views.values()].forEach((reader) => this.lookAway(socketId, reader));
      [...state.touched.values()].forEach((reader) => this.departAfterGrace(reader, this.graceMs, { by: socketId }));
    });
  }

  disconnecting(socketId: string): Promise<void> {
    return this.inOrder(socketId, async () => {
      this.pendingOpenings.delete(socketId);
      this.viewStarts.delete(socketId);
      const state = this.sockets.get(socketId);
      if (!state) return;
      [...state.views.values()].forEach((reader) => this.lookAway(socketId, reader));
      const touched = [...state.touched.values()];
      this.sockets.delete(socketId);
      touched.forEach((reader) => this.departAfterGrace(reader, this.graceMs, { by: socketId }));
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
    this.forgetAttempts(key);
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
    this.holdSince.delete(key);
    const regard = this.regards.get(key);
    if (!regard?.openedAt) return;
    const closed = this.retain(reader, [...regard.closed, { from: regard.openedAt, to: this.now() }]);
    this.regards.set(key, { closed, openedAt: null });
  }

  /** Un socket évincé ne contribue plus : sans autre contributeur, ce qu'il a regardé part aussitôt, sans être oublié. */
  private withdraw(socketId: string, reader: AfterReadReader): void {
    this.lookAway(socketId, reader);
    const key = keyOf(reader);
    const remaining = withoutMember(this.contributors.get(key), socketId);
    this.contributors.set(key, remaining);
    if (remaining.size > 0) return;
    this.cancelPending(key);
    void this.depart(reader, { holdable: false })
      .then(() => this.settle(key))
      .catch((error: unknown) => this.onError(error));
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

  /**
   * Une échéance déjà armée plus TARD n'est jamais raccourcie — une déconnexion garde sa grâce entière —,
   * sauf celle d'un `viewing:stop`, que l'arrière-plan ou la déconnexion de la MÊME socket (`by`)
   * ramènent à leur propre grâce. Une échéance n'est jamais repoussée par la socket qui l'a armée, ni au-delà
   * du plafond dur d'un départ déjà retenu.
   */
  private departAfterGrace(reader: AfterReadReader, afterMs: number, arming: Arming = {}): void {
    const key = keyOf(reader);
    if (!this.regards.has(key)) return;
    if (!this.holdSince.has(key) && !this.isViewedHere(key)) this.holdSince.set(key, this.now().getTime() + afterMs);
    const delayMs = arming.unbounded ? afterMs : this.boundedByHold(key, afterMs);
    const dueAt = this.now().getTime() + delayMs;
    const armed = this.pendingDepartures.get(key);
    const yieldsHere = armed?.yieldsTo != null && armed.yieldsTo === arming.by;
    if (armed && armed.dueAt > dueAt && !yieldsHere) return;
    if (armed && armed.armedBy !== null && armed.armedBy === arming.by && armed.dueAt <= dueAt) return;
    const holdable = (arming.holdable ?? true) && (armed?.holdable ?? true);
    this.cancelPending(key);
    const timer = guardedTimeout({
      name: 'after-read-departure',
      afterMs: delayMs,
      logger: { error: (_message, error) => this.onError(error) },
      run: () => {
        this.pendingDepartures.delete(key);
        void this.depart(reader, { holdable }).catch((error: unknown) => this.onError(error));
      },
    });
    timer.unref?.();
    this.pendingDepartures.set(key, {
      timer,
      dueAt,
      yieldsTo: arming.yieldsTo ?? null,
      armedBy: arming.yieldsTo === undefined ? arming.by ?? null : null,
      holdable,
    });
  }

  /**
   * `holdable` : un départ ATTENDU (grâce écoulée) cède à un appel établi ; une sortie déclarée, jamais.
   * Une échéance armée PENDANT la vérification de l'appel (le lecteur est revenu puis reparti) reprend la main.
   * Au plafond dur (`AFTER_READ_MAX_HOLD_MS`), plus rien ne retient : appel, autre appareil, vérification en
   * échec — le départ BRÛLE.
   */
  private async depart(reader: AfterReadReader, { holdable }: { readonly holdable: boolean }): Promise<void> {
    const key = keyOf(reader);
    const overdue = this.holdRemaining(key) <= 0;
    if (!overdue && this.isViewedHere(key)) return;
    if ((this.regards.get(key)?.closed.length ?? 0) === 0) return;
    if (holdable && !overdue && !(await this.mayLeaveNow(reader))) return;
    const periods = this.takePeriods(key);
    if (periods.length === 0) return;
    if (!overdue && !(await this.noOtherDeviceViews(reader, periods))) return;

    try {
      await this.onDeparture({ ...reader, periods });
    } catch (error) {
      this.onError(error);
      this.restorePeriods(reader, periods);
      this.retryLater(reader, { holdable });
      return;
    }
    this.forgetAttempts(key);
    this.settle(key);
  }

  /** Le départ attendu peut-il partir ? Sinon il s'est déjà réarmé (appel établi, grâce d'après-appel). */
  private async mayLeaveNow(reader: AfterReadReader): Promise<boolean> {
    const key = keyOf(reader);
    const held = await this.isHeld(reader);
    if (this.pendingDepartures.has(key)) return false;
    if (held) {
      if (this.isViewedHere(key) || !this.regards.has(key)) return false;
      this.heldByCall.add(key);
      this.waitAgain(reader);
      return false;
    }
    if (!this.heldByCall.delete(key)) return true;
    if (!this.isViewedHere(key)) this.departAfterGrace(reader, this.boundedByHold(key, this.viewStopGraceMs));
    return false;
  }

  /** Aucun appareil du lecteur ne regarde, ici ou ailleurs ? Sinon les périodes sont rendues et le départ réarmé. */
  private async noOtherDeviceViews(reader: AfterReadReader, periods: readonly AfterReadPeriod[]): Promise<boolean> {
    const key = keyOf(reader);
    let elsewhere: boolean | 'unknown';
    try {
      elsewhere = await this.viewedElsewhere(reader);
    } catch (error) {
      this.onError(error);
      elsewhere = 'unknown';
    }
    if (elsewhere === false && !this.isViewedHere(key)) return true;
    this.restorePeriods(reader, periods);
    if (this.isViewedHere(key)) return false;
    if (elsewhere === 'unknown') this.retryLater(reader);
    else this.waitAgain(reader);
    return false;
  }

  /** Le temps qui reste avant le plafond dur ; une clé que rien ne retient en a tout son plafond. */
  private holdRemaining(key: string): number {
    const since = this.holdSince.get(key);
    if (since === undefined) return AFTER_READ_MAX_HOLD_MS;
    return since + AFTER_READ_MAX_HOLD_MS - this.now().getTime();
  }

  private boundedByHold(key: string, delayMs: number): number {
    return Math.max(0, Math.min(delayMs, this.holdRemaining(key)));
  }

  private startHold(key: string): void {
    if (!this.holdSince.has(key)) this.holdSince.set(key, this.now().getTime());
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
  private restorePeriods(reader: AfterReadReader, periods: readonly AfterReadPeriod[]): void {
    const key = keyOf(reader);
    const regard = this.regards.get(key) ?? NO_REGARD;
    const closed = this.retain(reader, [...periods, ...regard.closed]);
    this.regards.set(key, { closed, openedAt: regard.openedAt });
  }

  /** Les regards au-delà de `AFTER_READ_MAX_PERIODS` partent aussitôt, les plus anciens d'abord. */
  private retain(reader: AfterReadReader, closed: readonly AfterReadPeriod[]): readonly AfterReadPeriod[] {
    const overflow = closed.length - AFTER_READ_MAX_PERIODS;
    if (overflow <= 0) return closed;
    this.burnOverflow(reader, closed.slice(0, overflow));
    return closed.slice(overflow);
  }

  /** Les regards évincés rejoignent la brûlure de leur clé : une seule en vol, les nouveaux s'y fusionnent. */
  private burnOverflow(reader: AfterReadReader, periods: readonly AfterReadPeriod[]): void {
    const key = keyOf(reader);
    const entry = this.overflows.get(key) ?? { reader, periods: [], busy: false, attempts: 0, timer: null };
    const merged = this.boundOverflow(key, [...entry.periods, ...periods]);
    this.overflows.set(key, { ...entry, reader, periods: merged });
    if (entry.busy || entry.timer !== null) return;
    void this.flushOverflow(key).catch((error: unknown) => this.onError(error));
  }

  /**
   * Brûle ce qui attend pour une clé. En échec, les regards restent (fusionnés, bornés) et se redemandent à
   * intervalle doublé, comme `retryLater` — jamais oubliés.
   */
  private async flushOverflow(key: string): Promise<void> {
    const entry = this.overflows.get(key);
    if (!entry || entry.periods.length === 0) {
      this.overflows.delete(key);
      return;
    }
    const sending = entry.periods.slice(0, AFTER_READ_MAX_PERIODS);
    this.overflows.set(key, { ...entry, periods: entry.periods.slice(AFTER_READ_MAX_PERIODS), busy: true, timer: null });
    try {
      await this.onDeparture({ ...entry.reader, periods: sending });
    } catch (error) {
      this.onError(error);
      this.scheduleOverflowRetry(key, sending);
      return;
    }
    const after = this.overflows.get(key);
    if (!after || after.periods.length === 0) {
      this.overflows.delete(key);
      return;
    }
    this.overflows.set(key, { ...after, busy: false, attempts: 0 });
    await this.flushOverflow(key);
  }

  private scheduleOverflowRetry(key: string, unsent: readonly AfterReadPeriod[]): void {
    const current = this.overflows.get(key);
    if (!current) return;
    const attempts = current.attempts + 1;
    const delay = Math.min(this.graceMs * 2 ** Math.min(attempts - 1, 20), AFTER_READ_MAX_RETRY_DELAY_MS);
    const timer = guardedTimeout({
      name: 'after-read-overflow',
      afterMs: delay,
      logger: { error: (_message, failure) => this.onError(failure) },
      run: () => {
        const waiting = this.overflows.get(key);
        if (waiting) this.overflows.set(key, { ...waiting, timer: null });
        void this.flushOverflow(key).catch((error: unknown) => this.onError(error));
      },
    });
    timer.unref?.();
    const periods = this.boundOverflow(key, [...unsent, ...current.periods]);
    this.overflows.set(key, { ...current, periods, busy: false, attempts, timer });
  }

  /** Par clé, `AFTER_READ_MAX_OVERFLOW_PERIODS_PER_KEY` au plus ; au-delà du budget total, un seul intervalle couvrant. */
  private boundOverflow(key: string, periods: readonly AfterReadPeriod[]): readonly AfterReadPeriod[] {
    const others = [...this.overflows].reduce(
      (total, [other, entry]) => (other === key ? total : total + entry.periods.length),
      0,
    );
    const budget =
      others + AFTER_READ_MAX_OVERFLOW_PERIODS_PER_KEY > AFTER_READ_MAX_OVERFLOW_PERIODS
        ? 1
        : AFTER_READ_MAX_OVERFLOW_PERIODS_PER_KEY;
    return coalesce(periods, budget);
  }

  /** Au plus `AFTER_READ_VIEW_STARTS_PER_MINUTE` regards ouverts par socket et par minute. */
  private admitViewStart(socketId: string): boolean {
    const now = this.now().getTime();
    const recent = (this.viewStarts.get(socketId) ?? []).filter((at) => now - at < VIEW_START_WINDOW_MS);
    if (recent.length >= AFTER_READ_VIEW_STARTS_PER_MINUTE) {
      this.viewStarts.set(socketId, recent);
      return false;
    }
    this.viewStarts.set(socketId, [...recent, now]);
    return true;
  }

  /** Un départ en attente (appel, autre appareil) se réexamine à intervalle fixe et court, jusqu'au plafond dur. */
  private waitAgain(reader: AfterReadReader): void {
    const key = keyOf(reader);
    if (!this.regards.has(key)) return;
    this.startHold(key);
    this.departAfterGrace(reader, this.boundedByHold(key, AFTER_READ_RECHECK_MS));
  }

  /**
   * Un départ en échec se redemande à intervalle doublé : une vérification jusqu'au plafond dur, puis il brûle
   * sans elle ; une consommation, tant qu'elle échoue — jamais oubliée.
   */
  private retryLater(reader: AfterReadReader, { holdable = true }: { readonly holdable?: boolean } = {}): void {
    const key = keyOf(reader);
    if (!this.regards.has(key)) return;
    const overdue = this.holdRemaining(key) <= 0;
    this.startHold(key);
    const attempts = (this.departureRetries.get(key) ?? 0) + 1;
    this.departureRetries.set(key, attempts);
    const delay = Math.min(this.graceMs * 2 ** Math.min(attempts - 1, 20), AFTER_READ_MAX_RETRY_DELAY_MS);
    this.departAfterGrace(reader, delay, { holdable, unbounded: overdue });
  }

  /** Un regard vide (rien de clos, rien d'ouvert) libère ses contributeurs. */
  private settle(key: string): void {
    const regard = this.regards.get(key);
    if (regard && !regard.openedAt && regard.closed.length === 0) this.forget(key);
  }

  /** Les regards CLOS d'une clé sont oubliés ; un regard encore ouvert garde son début. */
  private forgetAttempts(key: string): void {
    this.departureRetries.delete(key);
    this.holdSince.delete(key);
    this.heldByCall.delete(key);
  }

  private forget(key: string): void {
    this.forgetAttempts(key);
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

/**
 * Ramène des regards à `max` intervalles en fusionnant, tant qu'il le faut, les deux voisins les plus PROCHES
 * en un intervalle qui les couvre : rien n'est perdu, seul le trou le plus court est ajouté.
 */
function coalesce(periods: readonly AfterReadPeriod[], max: number): readonly AfterReadPeriod[] {
  const sorted = [...periods].sort((a, b) => a.from.getTime() - b.from.getTime());
  if (sorted.length <= max) return sorted;
  const gaps = sorted.slice(1).map((next, i) => next.from.getTime() - sorted[i].to.getTime());
  const closest = gaps.indexOf(Math.min(...gaps));
  const left = sorted[closest];
  const right = sorted[closest + 1];
  const merged = { from: left.from, to: right.to > left.to ? right.to : left.to };
  return coalesce([...sorted.slice(0, closest), merged, ...sorted.slice(closest + 2)], max);
}

function conversationIdOf(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('conversationId' in data)) return null;
  const { conversationId } = data as { conversationId: unknown };
  return typeof conversationId === 'string' && conversationId.length > 0 ? conversationId : null;
}

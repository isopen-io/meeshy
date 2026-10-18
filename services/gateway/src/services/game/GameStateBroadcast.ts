/**
 * L'ÉTAT DU JEU SE PROPAGE (#10900) — après une frappe, un gain d'étincelles, une reprise, un prestige ou une dépense
 * de Meesh, `game:updated` part dans la room `user:<id>` du seul compte concerné, avec le bloc `game` SERVI (celui que
 * `GET /me/engagement` rendrait au même instant) et son marqueur d'ordre `gameRevision` (`types/game-sync.ts`).
 *
 * Quatre propriétés :
 *
 *  - **le marqueur est la révision GRAVÉE (#10912), lue AVANT le bloc** : toute écriture gravée avant elle est dans le
 *    bloc, quelle que soit l'horloge de la passerelle qui émet ; un client qui a déjà appliqué plus récent ignore
 *    celui-ci (`shouldApplyGameState`). Compte sans révision gravée : l'instant, comme avant ;
 *  - **une seule lecture en vol par compte** : une écriture qui tombe pendant une lecture en commande UNE autre, après —
 *    les marqueurs d'un même compte croissent donc toujours ;
 *  - **les gains sont coalescés** (`creditWindowMs`) : un compte qui gagne dix fois en une seconde ne relit qu'une fois ;
 *    les gestes explicites (frappe, dépense, reprise, prestige) partent aussitôt et absorbent les gains en attente ;
 *  - **jamais une raison de faire échouer l'écriture** : `announce` ne lève pas, une lecture qui tombe émet une
 *    invalidation pure (`game: null`) plutôt que de taire l'écriture.
 *
 * Comme `engagement-emit-registry`, le serveur temps réel et le constructeur du bloc s'enregistrent au montage du
 * socket (`MeeshySocketIOHandler`) : ce module n'importe ni `GameBlockService` ni `MeeshService`, qui l'appellent.
 */

import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { GameBlock } from '@meeshy/shared/types/game';
import type { GameUpdateReason } from '@meeshy/shared/types/game-sync';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { guardedTimeout } from '../../utils/guarded-timer';

const log = enhancedLogger.child({ module: 'GameStateBroadcast' });

/** La fenêtre de coalescence des gains : au plus une relecture par compte toutes les deux secondes. */
export const GAME_CREDIT_WINDOW_MS = 2_000;

/** Le repli du marqueur d'ordre — un compte sans révision gravée (#10912) : l'instant serveur, en millisecondes. */
export const gameRevisionNow = (): number => Date.now();

type Cancel = () => void;

export type GameStateBroadcastDeps = {
  readonly io: () => ServerEmitIO | undefined;
  readonly build: (userId: string) => Promise<GameBlock | null>;
  /** La révision GRAVÉE du compte (#10912) ; `null` (ou absente, tests) : l'instant `now`. */
  readonly revision?: (userId: string) => Promise<number | null>;
  readonly now?: () => number;
  readonly schedule?: (fn: () => void, ms: number) => Cancel;
  readonly creditWindowMs?: number;
};

type UserSlot = {
  cancelWindow: Cancel | null;
  inFlight: boolean;
  next: GameUpdateReason | null;
};

const timerLogger = {
  error: (message: string, error?: unknown) =>
    log.warn(message, { error: error instanceof Error ? error.message : String(error) }),
};

const defaultSchedule = (fn: () => void, ms: number): Cancel => {
  const timer = guardedTimeout({ name: 'game-state-credit-window', afterMs: ms, logger: timerLogger, run: fn });
  timer.unref?.();
  return () => clearTimeout(timer);
};

export class GameStateBroadcast {
  private readonly slots = new Map<string, UserSlot>();

  private readonly now: () => number;

  private readonly schedule: (fn: () => void, ms: number) => Cancel;

  private readonly creditWindowMs: number;

  constructor(private readonly deps: GameStateBroadcastDeps) {
    this.now = deps.now ?? gameRevisionNow;
    this.schedule = deps.schedule ?? defaultSchedule;
    this.creditWindowMs = deps.creditWindowMs ?? GAME_CREDIT_WINDOW_MS;
  }

  /** Une écriture du jeu vient d'être faite pour ce compte. Ne lève jamais. */
  announce(userId: string, reason: GameUpdateReason): void {
    try {
      if (this.deps.io() === undefined) return;
      const slot = this.slotOf(userId);
      if (reason === 'credit') {
        // Une fenêtre déjà ouverte couvre ce gain ; une lecture en vol en commande une après elle.
        if (slot.cancelWindow !== null) return;
        if (slot.inFlight) {
          slot.next = slot.next ?? 'credit';
          return;
        }
        slot.cancelWindow = this.schedule(() => {
          slot.cancelWindow = null;
          this.run(userId, 'credit');
        }, this.creditWindowMs);
        return;
      }
      slot.cancelWindow?.();
      slot.cancelWindow = null;
      this.run(userId, reason);
    } catch (error) {
      log.warn('game:updated not scheduled', { userId, reason, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /** Les comptes qui ont une émission en attente ou en vol — la carte se vide d'elle-même. */
  pendingUsers(): number {
    return this.slots.size;
  }

  private slotOf(userId: string): UserSlot {
    const existing = this.slots.get(userId);
    if (existing !== undefined) return existing;
    const slot: UserSlot = { cancelWindow: null, inFlight: false, next: null };
    this.slots.set(userId, slot);
    return slot;
  }

  private run(userId: string, reason: GameUpdateReason): void {
    const slot = this.slotOf(userId);
    if (slot.inFlight) {
      // Un geste explicite déjà en attente garde son nom : un gain ne le rétrograde pas.
      slot.next = reason === 'credit' && slot.next !== null ? slot.next : reason;
      return;
    }
    slot.inFlight = true;
    void this.publish(userId, reason)
      .catch((error: unknown) =>
        log.warn('game:updated emit failed', { userId, reason, error: error instanceof Error ? error.message : String(error) }),
      )
      .finally(() => {
        slot.inFlight = false;
        const next = slot.next;
        slot.next = null;
        if (next !== null) {
          this.run(userId, next);
          return;
        }
        if (slot.cancelWindow === null) this.slots.delete(userId);
      });
  }

  private async publish(userId: string, reason: GameUpdateReason): Promise<void> {
    // Le repli (compte sans révision gravée) est pris AVANT toute lecture, comme la révision gravée.
    const takenAt = this.now();
    const graved = this.deps.revision === undefined ? null : await this.deps.revision(userId).catch(() => null);
    const gameRevision = graved ?? takenAt;
    const game = await this.deps.build(userId).catch((error: unknown) => {
      log.warn('game block unavailable, game:updated sent as a pure invalidation', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    this.deps.io()?.to(ROOMS.user(userId)).emit(SERVER_EVENTS.GAME_UPDATED, { gameRevision, reason, game });
  }
}

let shared: GameStateBroadcast | undefined;

/** Monté une fois par le serveur temps réel ; `undefined` (tests, scripts) : `announceGameState` ne fait rien. */
export function setGameStateBroadcast(broadcast: GameStateBroadcast | undefined): void {
  shared = broadcast;
}

/** Le point d'appel des écrivains du jeu : annonce l'écriture, sans jamais lever ni attendre. */
export function announceGameState(userId: string, reason: GameUpdateReason): void {
  shared?.announce(userId, reason);
}

/**
 * LA PRÉSENCE SUIT LE PREMIER PLAN (#10575).
 *
 * Une socket vivante ne dit pas qu'une personne est là : un onglet caché ou la
 * coque Android en arrière-plan garde sa connexion et répond aux pongs. Le
 * client le déclare par `presence:app-state { foreground }` (web à chaque
 * changement de visibilité, iOS avant de fermer sa socket). Un utilisateur est
 * PRÉSENT tant qu'au moins une de ses sockets n'a pas déclaré l'arrière-plan —
 * une socket muette compte au premier plan, ce qui garde les anciens clients
 * tels qu'ils étaient.
 *
 * Partir n'est annoncé qu'après `PRESENCE_AWAY_GRACE_MS` : un `.inactive` iOS
 * (centre de contrôle), un changement d'onglet bref ne font pas clignoter la
 * pastille chez les amis. Revenir pendant la grâce n'annonce rien ; revenir
 * après annonce le retour.
 */
import { guardedTimeout, type TimerErrorLogger } from '../utils/guarded-timer.js';

export const PRESENCE_AWAY_GRACE_MS = 15_000;

export type PresenceForegroundDeps = {
  /** Les sockets ouvertes d'un utilisateur (la map `userSockets` partagée). */
  readonly socketsOf: (userKey: string) => ReadonlySet<string> | undefined;
  /** Écrit et diffuse le départ — appelé une fois la grâce écoulée. */
  readonly announceAway: (userKey: string) => void;
  /** Écrit et diffuse le retour d'un utilisateur dont le départ était annoncé. */
  readonly announceBack: (userKey: string) => void;
  readonly logger: TimerErrorLogger;
  readonly graceMs?: number;
};

export class PresenceForeground {
  private readonly hidden = new Set<string>();
  private readonly pendingAway = new Map<string, NodeJS.Timeout>();
  private readonly announcedAway = new Set<string>();

  constructor(private readonly deps: PresenceForegroundDeps) {}

  isPresent(userKey: string): boolean {
    const sockets = this.deps.socketsOf(userKey);
    if (sockets === undefined) return false;
    for (const socketId of sockets) if (!this.hidden.has(socketId)) return true;
    return false;
  }

  isHidden(socketId: string): boolean {
    return this.hidden.has(socketId);
  }

  /**
   * `presence:app-state` d'une socket. Sans `userKey`, la socket n'est pas
   * encore enregistrée — l'authentification n'est pas attendue, et iOS comme
   * Android rejouent leur état à la connexion : l'état est RETENU, et
   * l'enregistrement le lira (`noteSocketAdded`).
   */
  noteAppState(socketId: string, userKey: string | undefined, foreground: boolean): void {
    const wasPresent = userKey !== undefined && this.isPresent(userKey);
    if (foreground) this.hidden.delete(socketId);
    else this.hidden.add(socketId);
    if (userKey !== undefined) this.settle(userKey, wasPresent);
  }

  /**
   * Une socket ajoutée à l'utilisateur, après son enregistrement dans
   * `userSockets`. Une première socket déjà cachée a été annoncée « en ligne »
   * par l'enregistrement : son départ se confirme après la grâce.
   */
  noteSocketAdded(userKey: string, wasPresent: boolean): void {
    const confirmsAway = !this.isPresent(userKey) && !this.announcedAway.has(userKey) && !this.pendingAway.has(userKey);
    if (confirmsAway) {
      this.scheduleAway(userKey);
      return;
    }
    this.settle(userKey, wasPresent);
  }

  /** Une socket tombée avant de s'enregistrer : son état retenu ne survit pas. */
  forgetSocket(socketId: string): void {
    this.hidden.delete(socketId);
  }

  /**
   * Une socket retirée de `userSockets`. S'il en reste, l'utilisateur peut
   * n'en garder que de cachées ; s'il n'en reste aucune, la déconnexion
   * annonce elle-même le départ, et la grâce en cours n'a plus d'objet.
   */
  noteSocketRemoved(socketId: string, userKey: string, wasPresent: boolean): void {
    this.hidden.delete(socketId);
    if ((this.deps.socketsOf(userKey)?.size ?? 0) === 0) {
      this.forgetUser(userKey);
      return;
    }
    this.settle(userKey, wasPresent);
  }

  dispose(): void {
    for (const timer of this.pendingAway.values()) clearTimeout(timer);
    this.pendingAway.clear();
  }

  private settle(userKey: string, wasPresent: boolean): void {
    const present = this.isPresent(userKey);
    if (present === wasPresent) return;
    if (!present) {
      this.scheduleAway(userKey);
      return;
    }
    if (this.cancelAway(userKey)) return;
    if (this.announcedAway.delete(userKey)) this.deps.announceBack(userKey);
  }

  private scheduleAway(userKey: string): void {
    this.cancelAway(userKey);
    const timer = guardedTimeout({
      name: 'presence-away-grace',
      afterMs: this.deps.graceMs ?? PRESENCE_AWAY_GRACE_MS,
      logger: this.deps.logger,
      run: () => {
        this.pendingAway.delete(userKey);
        if (this.isPresent(userKey) || (this.deps.socketsOf(userKey)?.size ?? 0) === 0) return;
        this.announcedAway.add(userKey);
        this.deps.announceAway(userKey);
      },
    });
    timer.unref?.();
    this.pendingAway.set(userKey, timer);
  }

  private cancelAway(userKey: string): boolean {
    const timer = this.pendingAway.get(userKey);
    if (timer === undefined) return false;
    clearTimeout(timer);
    this.pendingAway.delete(userKey);
    return true;
  }

  private forgetUser(userKey: string): void {
    this.cancelAway(userKey);
    this.announcedAway.delete(userKey);
  }
}

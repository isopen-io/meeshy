import type { CallSignalEvent } from '@meeshy/shared/types/video-call';

/**
 * Ce que la file des signaux d'un appel garde À CÔTÉ de la dernière offre
 * (#11468) : les candidats ICE qui l'accompagnent, et les sockets qui l'ont
 * déjà reçue.
 *
 * Un appareil de l'appelé qui arrive après l'offre (troisième appareil, web
 * qui accepte pendant que l'iPhone sonne) la reçoit rejouée — mais sans les
 * candidats de l'appelant, la négociation ne repose plus que sur les siens.
 * Et une socket qui l'a déjà reçue (re-join sur la même socket) ne doit pas
 * la recevoir deux fois : elle répondrait deux fois à la même offre.
 *
 * Une entrée est clée comme le slot de l'offre (`${callId}:${destinataire}`).
 * Une offre qui en REMPLACE une autre (renégociation) remet l'entrée à zéro ;
 * la première offre d'un slot garde les candidats arrivés avant elle — les
 * signaux sont traités en parallèle, et un candidat peut précéder son offre.
 */
export const MAX_REPLAYED_CANDIDATES = 64;

type ReplayEntry = {
  readonly candidates: readonly CallSignalEvent[];
  readonly deliveredTo: ReadonlySet<string>;
  readonly touchedAt: number;
};

const EMPTY: ReplayEntry = { candidates: [], deliveredTo: new Set(), touchedAt: 0 };

export class CallSignalReplay {
  private readonly entries = new Map<string, ReplayEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  descriptionBuffered(slot: string, replacedAnother: boolean): void {
    if (replacedAnother) this.entries.delete(slot);
  }

  candidateRelayed(slot: string, candidate: CallSignalEvent): void {
    const entry = this.entries.get(slot) ?? EMPTY;
    const candidates = [...entry.candidates, candidate].slice(-MAX_REPLAYED_CANDIDATES);
    this.entries.set(slot, { ...entry, candidates, touchedAt: this.now() });
  }

  delivered(slot: string, socketIds: readonly string[]): void {
    const entry = this.entries.get(slot) ?? EMPTY;
    this.entries.set(slot, { ...entry, deliveredTo: new Set([...entry.deliveredTo, ...socketIds]), touchedAt: this.now() });
  }

  wasDeliveredTo(slot: string, socketId: string): boolean {
    return this.entries.get(slot)?.deliveredTo.has(socketId) === true;
  }

  candidatesFor(slot: string): readonly CallSignalEvent[] {
    return this.entries.get(slot)?.candidates ?? [];
  }

  clearSlot(slot: string): void {
    this.entries.delete(slot);
  }

  clearCall(callId: string): void {
    const prefix = `${callId}:`;
    [...this.entries.keys()].filter((slot) => slot.startsWith(prefix)).forEach((slot) => this.entries.delete(slot));
  }

  sweep(ttlMs: number): void {
    const now = this.now();
    [...this.entries.entries()]
      .filter(([, entry]) => now - entry.touchedAt > ttlMs)
      .forEach(([slot]) => this.entries.delete(slot));
  }
}

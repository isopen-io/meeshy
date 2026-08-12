/**
 * Traduit un flux d'apparitions/disparitions de bulles en lots de messages
 * RÉELLEMENT lus.
 *
 * Un message n'est retenu que s'il est resté continûment affiché au moins
 * `dwellMs`. Sans ce seuil, défiler à travers deux cents messages en une seconde
 * les marquerait tous lus — exactement le défaut que le suivi exact corrige côté
 * serveur, qu'il serait absurde de réintroduire côté client.
 *
 * Aucune horloge interne : chaque méthode reçoit l'instant courant. Le module
 * reste ainsi pur, testable sans faux timers, et l'appelant maîtrise la cadence.
 *
 * Miroir Swift : `SeenMessageAccumulator.swift` (SDK) — mêmes cas de test.
 * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
 */

export type SeenMessageAccumulatorOptions = {
  /** Présence continue minimale pour qu'un message compte comme lu. */
  readonly dwellMs?: number;
  /** Nombre d'identifiants acquis à partir duquel un envoi vaut le coup. */
  readonly batchSize?: number;
  /**
   * Plafond du garde-fou anti-doublon. Une session longue ne doit pas faire
   * croître la mémoire sans fin ; au pire, un oubli provoque un signalement
   * redondant, sans conséquence puisque l'écriture serveur est write-once.
   */
  readonly reportedCap?: number;
};

const DEFAULT_DWELL_MS = 300;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_REPORTED_CAP = 2000;

export class SeenMessageAccumulator {
  private readonly dwellMs: number;
  private readonly batchSize: number;
  private readonly reportedCap: number;

  /** messageId → instant de l'apparition en cours. */
  private readonly visibleSince = new Map<string, number>();
  /** Acquis mais pas encore rendus, dans l'ordre d'acquisition. */
  private readonly acquired: string[] = [];
  /** Déjà rendus une fois — borné, ordre d'insertion pour l'éviction. */
  private readonly reported = new Set<string>();

  constructor(options: SeenMessageAccumulatorOptions = {}) {
    this.dwellMs = options.dwellMs ?? DEFAULT_DWELL_MS;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.reportedCap = options.reportedCap ?? DEFAULT_REPORTED_CAP;
  }

  appeared(messageId: string, now: number): void {
    if (this.reported.has(messageId)) return;
    // Une réapparition repart de zéro : le temps passé hors écran ne se cumule
    // pas, sans quoi deux survols éclair vaudraient une lecture.
    this.visibleSince.set(messageId, now);
  }

  disappeared(messageId: string, now: number): void {
    const since = this.visibleSince.get(messageId);
    if (since === undefined) return;

    this.visibleSince.delete(messageId);
    if (now - since >= this.dwellMs) this.acquire(messageId);
  }

  /** `true` si assez d'identifiants sont acquis pour qu'un envoi vaille le coup. */
  isBatchReady(now: number): boolean {
    return this.countAcquired(now) >= this.batchSize;
  }

  /**
   * Rend les identifiants acquis et les retire de l'état. Les bulles encore à
   * l'écran ayant franchi le seuil sont acquises au passage, ce qui permet
   * d'appeler cette méthode à la fermeture ou au passage en arrière-plan sans
   * perdre une lecture en cours.
   */
  drain(now: number): string[] {
    this.promoteVisible(now);

    const batch = this.acquired.splice(0, this.acquired.length);
    for (const messageId of batch) this.markReported(messageId);
    return batch;
  }

  private countAcquired(now: number): number {
    this.promoteVisible(now);
    return this.acquired.length;
  }

  private promoteVisible(now: number): void {
    for (const [messageId, since] of this.visibleSince) {
      if (now - since < this.dwellMs) continue;
      this.visibleSince.delete(messageId);
      this.acquire(messageId);
    }
  }

  private acquire(messageId: string): void {
    if (this.reported.has(messageId)) return;
    if (this.acquired.includes(messageId)) return;
    this.acquired.push(messageId);
  }

  private markReported(messageId: string): void {
    if (this.reported.size >= this.reportedCap) {
      const oldest = this.reported.values().next();
      if (!oldest.done) this.reported.delete(oldest.value);
    }
    this.reported.add(messageId);
  }
}

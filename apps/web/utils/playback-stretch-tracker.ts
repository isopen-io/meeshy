/**
 * Capture fidèle de l'interaction d'un participant avec un média.
 *
 * ## Pourquoi pas d'échantillonnage périodique
 *
 * Relever la position toutes les N secondes perd structurellement du contenu :
 * un média d'une seconde n'est jamais relevé, une écoute de 500 ms non plus, et
 * même sur du contenu long la portion écoutée entre le dernier relevé et la
 * pause disparaît. Réduire l'intervalle ne corrige rien — ça déplace le seuil
 * de perte et multiplie les réveils.
 *
 * Le lecteur connaît les frontières exactes : lecture, pause, déplacement du
 * curseur, coupure du son, fin du média, fermeture de l'écran. Chaque
 * intervalle entre deux frontières est une écoute continue, donc un segment
 * exact — quelle que soit sa durée.
 *
 * ## Pourquoi le motif de fin est conservé
 *
 * La frontière est elle-même une information. S'être arrêté en pause, avoir
 * sauté ailleurs, coupé le son ou laissé le média se terminer ne racontent pas
 * la même chose sur l'intérêt porté au contenu. La trace est donc
 * **chronologique et motivée** : elle préserve l'interaction, pas seulement le
 * volume écouté.
 *
 * La couverture (quelles portions, sans doublon) se DÉDUIT de cette trace en la
 * fusionnant. Elle n'est pas stockée à part : une seule source de vérité.
 *
 * Aucune horloge interne, aucun timer : l'appelant fournit la position média à
 * chaque frontière. Le type reste pur et testable.
 *
 * Miroir Swift : `PlaybackStretchTracker.swift` (SDK) — mêmes cas de test.
 * @see docs/superpowers/specs/2026-07-24-media-views-enrichment-design.md
 */

/** Ce qui a mis fin à une écoute continue. */
export type StretchEnd =
  /** L'utilisateur a mis en pause. */
  | 'pause'
  /** L'utilisateur a déplacé le curseur ailleurs. */
  | 'seek'
  /** L'utilisateur a coupé le son — un média muet n'est pas écouté. */
  | 'muted'
  /** Le média est allé jusqu'au bout tout seul. */
  | 'completed'
  /** L'écran a été quitté, ou l'app est passée en arrière-plan. */
  | 'dismissed'
  /** Une nouvelle lecture a démarré sans que la précédente soit fermée —
   *  le lecteur a manqué un événement. Conservé plutôt que perdu. */
  | 'superseded';

export type PlaybackStretch = {
  readonly startMs: number;
  readonly endMs: number;
  readonly endedBy: StretchEnd;
};

export class PlaybackStretchTracker {
  /** Position d'ouverture de l'écoute en cours, `null` si aucune. */
  private openedAtMs: number | null = null;
  /** Dernière position connue, pour fermer une écoute sans position explicite. */
  private lastObservedMs = 0;
  private readonly stretches: PlaybackStretch[] = [];

  get hasOpenStretch(): boolean {
    return this.openedAtMs !== null;
  }

  /** Début d'une lecture continue à cette position média. */
  begin(positionMs: number): void {
    // Une ouverture qui en écrase une autre signale un événement manqué : on
    // ferme la précédente à la position courante plutôt que de la perdre.
    if (this.openedAtMs !== null) this.close(positionMs, 'superseded');
    this.openedAtMs = positionMs;
    this.lastObservedMs = positionMs;
  }

  /**
   * Met à jour la position connue sans rien clore. Sert uniquement à pouvoir
   * fermer proprement une écoute dont la position finale serait illisible.
   */
  observe(positionMs: number): void {
    this.lastObservedMs = positionMs;
  }

  pause(positionMs?: number): void {
    this.close(positionMs ?? this.lastObservedMs, 'pause');
  }

  muted(positionMs?: number): void {
    this.close(positionMs ?? this.lastObservedMs, 'muted');
  }

  completed(positionMs?: number): void {
    this.close(positionMs ?? this.lastObservedMs, 'completed');
  }

  dismissed(positionMs?: number): void {
    this.close(positionMs ?? this.lastObservedMs, 'dismissed');
  }

  /**
   * Déplacement du curseur : clôt l'écoute en cours et en ouvre une autre.
   *
   * Déplacer le curseur d'un média EN PAUSE n'ouvre rien : rien n'est écouté
   * tant que la lecture n'a pas repris. Sans cette garde, parcourir la barre de
   * progression à l'arrêt fabriquerait une écoute qui n'a pas eu lieu.
   */
  seek(fromPositionMs: number, toPositionMs: number): void {
    const wasPlaying = this.openedAtMs !== null;
    this.close(fromPositionMs, 'seek');
    if (wasPlaying) this.openedAtMs = toPositionMs;
    this.lastObservedMs = toPositionMs;
  }

  /**
   * Rend les écoutes terminées et les retire, en préservant l'ordre
   * CHRONOLOGIQUE — pas l'ordre des positions. Écouter la fin puis revenir au
   * début doit se lire dans cet ordre-là.
   *
   * Une écoute encore ouverte est conservée : elle partira à sa fermeture.
   */
  drain(): PlaybackStretch[] {
    return this.stretches.splice(0, this.stretches.length);
  }

  private close(positionMs: number, endedBy: StretchEnd): void {
    const openedAt = this.openedAtMs;
    this.openedAtMs = null;
    this.lastObservedMs = positionMs;

    if (openedAt === null) return;
    // Durée nulle ou négative : le lecteur se contredit. Mieux vaut perdre une
    // observation que fabriquer un segment absurde.
    if (positionMs <= openedAt) return;

    this.stretches.push({ startMs: openedAt, endMs: positionMs, endedBy });
  }
}

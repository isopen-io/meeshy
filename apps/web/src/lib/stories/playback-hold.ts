/**
 * **UNE STORY RETENUE SE FIGE OU BOUCLE** (décision du porteur, 2026-10-09,
 * #9821 — miroir de `StoryPlaybackHold`, `StoryViewerView+PlaybackHold.swift`).
 *
 * - `pause` : l'image se fige — la pause demandée (appui long, double tap,
 *   espace), l'onglet caché, un appel en cours.
 * - `loop` : commentaires, options, langues, feuilles « Vues » / « Envoyer »,
 *   profil, composition — la story JOUE ; à sa fin, elle repart à son début
 *   au lieu de passer à la suivante ou de fermer le lecteur.
 * - `null` : rien ne la retient, elle avance.
 */
export type StoryPlaybackHold = 'pause' | 'loop';

export type StoryEndAction = 'advance' | 'restart-in-place';

export function resolveStoryPlaybackHold(causes: {
  readonly paused: boolean;
  readonly engaged: boolean;
}): StoryPlaybackHold | null {
  if (causes.paused) return 'pause';
  return causes.engaged ? 'loop' : null;
}

export function storyEndAction(hold: StoryPlaybackHold | null): StoryEndAction {
  return hold === 'loop' ? 'restart-in-place' : 'advance';
}

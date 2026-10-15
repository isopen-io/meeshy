/**
 * **UNE HUMEUR SANS UN MOT SE CONFIRME** (#10527) — demande du porteur du
 * 2026-10-13 : à la validation sans texte, prévenir et proposer d'ajouter un
 * mot ou de publier quand même.
 *
 * Le mot se mesure APRÈS rognage, comme `publishStatusMood` le fait avant
 * d'écrire `content` : une note d'espaces part sans texte, donc elle se
 * confirme comme une note vide.
 *
 * Miroir iOS : `ComposerMoodBarePublish.step` (`ComposerMoodBarePublish.swift`).
 */
export type MoodPublishStep = 'ask' | 'publish';

export function moodPublishStep({ note }: { readonly note: string }): MoodPublishStep {
  return note.trim() === '' ? 'ask' : 'publish';
}

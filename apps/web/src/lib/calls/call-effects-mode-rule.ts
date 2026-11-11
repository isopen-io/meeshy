/**
 * **LES LOOKS DU MODE EFFETS** (P8b, loi 14 ; `CallEffectsModeRule` d'iOS) — les deux genres de
 * looks que le mode propose, en deux bandes qui se CUMULENT : Visage et Couleur se posent dans la
 * même configuration d'effets.
 */
export type EffectsCategory = 'face' | 'color';

/** « (+) Ajouter un autre look » ouvre les looks d'un AUTRE genre, à poser par-dessus celui qu'on a. */
export const addingLook = (from: EffectsCategory): EffectsCategory => (from === 'face' ? 'color' : 'face');

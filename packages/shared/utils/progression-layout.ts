import type { EngagementProgress } from './engagement-progress.js';

/**
 * LA COMPOSITION DE L'ÉCRAN « PROGRESSION » — déclarée UNE fois (#5838).
 *
 * ## Pourquoi ce fichier existe
 *
 * `resolveEngagementProgress()` décide de ce que l'écran MONTRE ; personne ne
 * décidait de l'ORDRE dans lequel il le montre. Chaque client a donc composé le
 * sien, et les deux ont divergé sans qu'aucun témoin ne rougisse :
 *
 * | client | ordre |
 * |---|---|
 * | iOS natif | Meesh → badges → succès → défis |
 * | web-v3 | élan → Meesh → niveau/série → défis → badges → succès |
 *
 * Deux jumelles pour un écran, ce que le CLAUDE.md interdit. La divergence
 * n'était pas détectable par un témoin par client : chacun listait SES sections
 * et passait au vert sur SON ordre. Ce qui manquait n'était pas un test de
 * plus, c'était un endroit où l'ordre soit ÉCRIT.
 *
 * ## Ce que ce type est, et n'est pas
 *
 * Il déclare la SÉQUENCE, pas le rendu : ni taille, ni couleur, ni icône — ces
 * choix restent à chaque plateforme, qui n'a pas les mêmes idiomes. Ce qui doit
 * être commun est ce que l'utilisateur RETROUVE : le même bloc à la même place,
 * quel que soit l'appareil (dimension 6, cohérence de positionnement).
 */

/** Les trois destinations dédiées, dans l'ordre où le hub les propose. */
export const PROGRESSION_SECTIONS = ['badges', 'defis', 'succes'] as const;

export type ProgressionSection = (typeof PROGRESSION_SECTIONS)[number];

/**
 * Un bloc du hub.
 *
 * Type SOMME et non un tableau de chaînes : une entrée de section porte laquelle
 * — et le compilateur refuse alors qu'on l'oublie chez un client, ce qu'une
 * chaîne libre aurait laissé passer.
 */
export type ProgressionBlock =
  | { readonly kind: 'next-achievement' }
  | { readonly kind: 'level' }
  | { readonly kind: 'elans' }
  | { readonly kind: 'section-link'; readonly section: ProgressionSection };

/**
 * La séquence du hub pour une progression donnée.
 *
 * Les trois heros sont TOUJOURS servis, y compris sur un compte vide : un écran
 * neuf doit expliquer ce qu'on peut y gagner, pas se taire. C'est le contraire
 * du réflexe « pas de données, pas de bloc », qui produit un premier lancement
 * muet — le moment où l'utilisateur a le plus besoin qu'on lui parle.
 */
export function progressionLayout(_progress: EngagementProgress): readonly ProgressionBlock[] {
  return [
    { kind: 'next-achievement' },
    { kind: 'level' },
    { kind: 'elans' },
    ...PROGRESSION_SECTIONS.map((section) => ({ kind: 'section-link', section }) as const),
  ];
}

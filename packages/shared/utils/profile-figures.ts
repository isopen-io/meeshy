/**
 * « EN CHIFFRES » D'UNE AUTRE PERSONNE — combien elle écrit, combien elle traduit
 * (#19371, chantier #18857, planche Autre-Vitrine).
 *
 * #4161 a rendu ces compteurs intimes : soi et l'administration seulement. La
 * planche les montre à un Proche. Ils partent donc vers un lecteur dont la fiche
 * par cercle OUVRE la présence détaillée — le même verdict de `resolveRelationAccess`
 * que la fiche (`resolveProfileCircleView`), donc Proche et au-dessus, blocage et
 * compte désactivé fermés, privilège d'équipe compris — et sous la préférence du
 * sujet `privacy.showProfileFigures`.
 *
 * Aucune feature n'est ajoutée à la matrice : ses miroirs Swift et Kotlin exigent
 * l'égalité des listes. Le cercle et le défaut sont provisoires, à trancher par le
 * porteur (#19372).
 *
 * La préférence n'a PAS de défaut stocké (comme `autoAcquaintance`) : l'absence de
 * choix se lit ici, et une valeur qui n'est pas un booléen vaut l'absence de choix.
 */
import type { ProfileCircleView } from './profile-circle-view.js';

/** Le défaut d'une personne qui n'a rien réglé (provisoire, #19372). */
export const PROFILE_FIGURES_DEFAULT = true;

export const profileFiguresShared = (stored: unknown): boolean =>
  typeof stored === 'boolean' ? stored : PROFILE_FIGURES_DEFAULT;

export const profileFiguresServed = (params: {
  readonly view: ProfileCircleView;
  readonly showProfileFigures: unknown;
}): boolean =>
  params.view.capabilities.presenceDetailed?.state === 'open' && profileFiguresShared(params.showProfileFigures);

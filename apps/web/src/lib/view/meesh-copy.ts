import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

/**
 * LA COPIE DU DÉTAIL MEESH — site unique (#6478).
 *
 * Relevé à la recette : « Vos 1 points de conversation ». La phrase vivait en
 * DOUBLE, recopiée dans `progression-parts.tsx` et `progression.tsx` — donc
 * fausse deux fois, et corrigible une fois sur deux.
 *
 * Le pendant iOS (`ProgressionCopy.meeshMissing`) passe par les VARIANTES DE
 * PLURIEL du catalogue, sept langues, six catégories pour l'arabe ; le web les
 * porte désormais au catalogue du jeu (`game.progression.missing.*`,
 * `game.progression.floor.*`, #10823), dans la langue d'interface. L'accord ne
 * se décide jamais par un `=== 1` : `Intl.PluralRules` porte la règle de la
 * langue (`translateGamePlural`).
 */

/**
 * Ce qui manque avant une Meesh, et pourquoi le plancher n'y répond pas.
 *
 * Miroir de `ProgressionCopy.meeshMissing(missing:floor:)`. À UN, le plancher
 * ne montre plus le chiffre du tout — « votre point », jamais « votre 1 point ».
 */
export function meeshMissing(
  missingPoints: number,
  floorPoints: number,
  language: InterfaceLanguage = currentInterfaceLanguage(),
): string {
  const manque = translateGamePlural(language, 'game.progression.missing', missingPoints);
  if (floorPoints <= 0) return manque;
  return `${manque} ${translateGamePlural(language, 'game.progression.floor', floorPoints)}`;
}

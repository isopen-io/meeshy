/**
 * LA COPIE DU DÉTAIL MEESH — site unique (#6478).
 *
 * Relevé à la recette : « Vos 1 points de conversation ». La phrase vivait en
 * DOUBLE, recopiée dans `progression-parts.tsx` et `progression.tsx` — donc
 * fausse deux fois, et corrigible une fois sur deux.
 *
 * Le pendant iOS (`ProgressionCopy.meeshMissing`) passe par les VARIANTES DE
 * PLURIEL du catalogue, sept langues, six catégories pour l'arabe. Le web n'a
 * pas cet outillage sur cet écran : `progression.tsx` et `progression-parts.tsx`
 * n'appellent `translate()` NULLE PART — toute leur copie est du français en
 * dur. C'est une dette distincte, et la nommer vaut mieux que la masquer.
 *
 * En attendant, l'accord ne se décide pas par un `=== 1` : `Intl.PluralRules`
 * porte la règle de la langue. Le jour où cet écran rejoint le catalogue, le
 * point de bascule est déjà au bon endroit.
 */

const REGLE_FR = new Intl.PluralRules('fr-FR');

/** `true` quand la langue met ce nombre au singulier — en français, 0 et 1. */
function estSingulier(nombre: number): boolean {
  return REGLE_FR.select(nombre) === 'one';
}

/**
 * Ce qui manque avant une Meesh, et pourquoi le plancher n'y répond pas.
 *
 * Miroir de `ProgressionCopy.meeshMissing(missing:floor:)`.
 */
export function meeshMissing(missingPoints: number, floorPoints: number): string {
  const manque = estSingulier(missingPoints)
    ? `Encore ${missingPoints} point convertible avant une Meesh.`
    : `Encore ${missingPoints} points convertibles avant une Meesh.`;

  if (floorPoints <= 0) return manque;

  // À UN, le plancher ne montre plus le chiffre du tout — « votre point »,
  // jamais « votre 1 point ». C'est la forme que la directive demande, et elle
  // ne découle pas de l'accord seul.
  const plancher = estSingulier(floorPoints)
    ? 'Votre point de conversation sera repris en dernier, sans éteindre aucun badge.'
    : `Vos ${floorPoints} points de conversation seront repris en dernier, sans éteindre aucun badge.`;

  return `${manque} ${plancher}`;
}

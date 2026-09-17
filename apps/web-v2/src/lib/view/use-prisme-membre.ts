import { useMemo } from 'react';

import { prismeDuMembre, type LanguesDuMembre, type PrismeMembre } from '@/lib/admin/prisme-membre';

/**
 * **LE PRISME DU MEMBRE, À IDENTITÉ STABLE** (#6862, revue-correction).
 *
 * `prismeDuMembre` est PUR, et c'est sa qualité : il se mesure sans React. Mais
 * il rend un TABLEAU, et un tableau construit dans le corps d'un composant
 * change d'identité à CHAQUE rendu. Le `CLAUDE.md` racine nomme ce piège sur
 * ce mot précis — « `preferredLanguages` est un tableau, donc son IDENTITÉ
 * change à chaque rendu chez tout hôte qui le construit en ligne ».
 *
 * Ce tableau descend jusqu'à `Bubble` / `FocalRow`, deux composants `memo` :
 * une identité neuve à chaque rendu de la fiche re-rendait toutes les rangées
 * visibles, ce que le chantier interdit (« Zero Unnecessary Re-render »).
 *
 * La clé est faite des TROIS PRIMITIVES, jamais de l'objet `membre` : la fiche
 * vient d'une requête qui se rafraîchit, et une nouvelle réponse au contenu
 * identique porte un objet neuf. C'est exactement la discipline de
 * `useReaderLanguages` (`lib/view/use-reader.ts`) pour le lecteur courant —
 * deux prismes, une seule façon de les tenir.
 */
export function usePrismeDuMembre(membre: LanguesDuMembre): PrismeMembre {
  const { systemLanguage, regionalLanguage, customDestinationLanguage } = membre;

  return useMemo(
    () => prismeDuMembre({ systemLanguage, regionalLanguage, customDestinationLanguage }),
    [systemLanguage, regionalLanguage, customDestinationLanguage],
  );
}

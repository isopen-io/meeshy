import { useMemo } from 'react';

import { prismeDuMembre, type LanguesDuMembre, type PrismeMembre } from './prisme-membre';

/**
 * **LE PRISME DU MEMBRE, À IDENTITÉ STABLE, RANG 4 COMPRIS** (#8005) — le jumeau de
 * `usePrismeDuMembre` (`lib/view/use-prisme-membre.ts`) qui porte aussi la locale de
 * l'appareil du membre.
 *
 * `prismeDuMembre` est PUR et rend un TABLEAU : construit dans le corps d'un composant,
 * il changerait d'identité à CHAQUE rendu, et ce tableau descend jusqu'aux rangées
 * `memo` du fil. La clé est faite des QUATRE PRIMITIVES, jamais de l'objet `membre` —
 * la fiche vient d'une requête qui se rafraîchit, et une réponse neuve au contenu
 * identique porte un objet neuf.
 */
export function usePrismeDuMembreComplet(membre: LanguesDuMembre): PrismeMembre {
  const { systemLanguage, regionalLanguage, customDestinationLanguage } = membre;
  const deviceLocale = membre.deviceLocale ?? null;

  return useMemo(
    () => prismeDuMembre({ systemLanguage, regionalLanguage, customDestinationLanguage, deviceLocale }),
    [systemLanguage, regionalLanguage, customDestinationLanguage, deviceLocale],
  );
}

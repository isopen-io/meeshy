import { langueDuVisiteur, languesOffertes, type ChoixDeLangue } from '@/lib/langue-du-visiteur';

/**
 * LA LANGUE PRÉ-REMPLIE DE LA MODALE — depuis `Accept-Language`, jamais `'fr'`
 * en dur (critère de fin de `join` ; `apps/web/hooks/use-join-flow.ts:24,55`
 * la figeait).
 *
 * LE PARSEUR N'EST PLUS ICI. Il a été remonté dans `lib/langue-du-visiteur.ts`
 * le jour où l'écran d'inscription est devenu le SECOND site à pré-remplir une
 * langue depuis cet en-tête (#5217) : deux lectures du même en-tête auraient
 * divergé au premier poids `q`. Ce module reste la porte de la modale — il
 * ré-exporte ce qui a déménagé, pour que rien de ce qui l'importait ne bouge,
 * et garde ce qui n'appartient qu'à un LIEN : la restriction `allowedLanguages`.
 */

export type { ChoixDeLangue };
export { langueDuVisiteur, languesOffertes };

/**
 * Un lien peut restreindre ses langues (`allowedLanguages`, servi par
 * l'aperçu) : la liste offerte est alors la sienne, et la langue du visiteur
 * n'y est pré-sélectionnée que si elle y figure — sinon la première autorisée.
 */
export const langueProposee = (acceptLanguage: string | null, autorisees: readonly string[]): string => {
  const souhaitee = langueDuVisiteur(acceptLanguage);
  if (autorisees.length === 0 || autorisees.includes(souhaitee)) return souhaitee;
  return autorisees[0] ?? souhaitee;
};

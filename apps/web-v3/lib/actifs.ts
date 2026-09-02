import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Comment la v3 LIT un actif de `packages/` — le site unique de cette lecture.
 *
 * Deux surfaces en dépendent, et pour la même raison : le repli de `/l/:token`
 * (table de jetons + un glyphe du sprite) et la coquille racine (sous-sprite
 * critique). Toutes deux inlinent un fichier COMMITÉ plutôt que de recopier ses
 * valeurs — la seconde table que le § 3.2 corollaire 2 interdit — et toutes deux
 * doivent le faire sans expédier une requête de plus (§ 8.3).
 *
 * Ce module ne porte donc AUCUNE valeur de design : il porte la façon d'aller la
 * chercher. La recopier chez le second consommateur aurait fabriqué deux
 * conventions de chemin pour un seul arbre de paquets — et c'est la convention,
 * pas la valeur, qui casse en silence le jour où l'image ne trace plus le
 * fichier.
 *
 * `next.config.ts` nomme ces fichiers dans `outputFileTracingIncludes` :
 * `standalone` ne trace que ce qu'un `import` désigne, et une lecture par chemin
 * n'en est pas un. Sans cette déclaration, le défaut ne se verrait qu'en
 * production.
 *
 * La lecture est faite UNE fois par processus (`memo`) : c'est un actif de
 * build, jamais une donnée de requête.
 */

const PAQUETS = 'node_modules';

const cheminDe = (paquet: string, fichier: string): string =>
  join(process.cwd(), PAQUETS, '@meeshy', paquet, fichier);

/**
 * Un actif absent rend la chaîne vide, jamais une exception : un glyphe manquant
 * dégrade un écran, une exception le supprime. Le gate qui attrape l'absence est
 * `__tests__/sprite.test.ts` (défaut « dérive »), pas une pile d'appels servie
 * au lecteur.
 */
export const lisLActif = (paquet: string, fichier: string): string => {
  try {
    return readFileSync(cheminDe(paquet, fichier), 'utf8');
  } catch {
    return '';
  }
};

export const memo = <T,>(produit: () => T): (() => T) => {
  let valeur: T | null = null;
  return () => {
    if (valeur === null) valeur = produit();
    return valeur;
  };
};

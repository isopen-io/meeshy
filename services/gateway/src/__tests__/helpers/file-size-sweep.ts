/**
 * La MESURE de taille des fichiers du gateway — une seule, pour tous les
 * cliquets qui la lisent (#4284, élargie par #4426).
 *
 * Deux cliquets gouvernent le budget de taille, avec deux règles différentes :
 * `unit/routes/route-file-size-budget.test.ts` exige ZÉRO fichier hors budget
 * sous `routes/`, où la dette a été soldée en entier ; `gateway-file-size-budget.test.ts`
 * borne et fait décroître la dette du RESTE de `src/`, qui n'a pas pu l'être
 * dans le même lot. Les deux règles sont légitimement distinctes.
 *
 * Ce qui ne doit PAS l'être, c'est la mesure. Deux implémentations de
 * `lineCount` divergeraient d'une ligne au premier fichier sans saut de ligne
 * final, et les deux cliquets se contrediraient sur le même fichier — la
 * jumelle divergente que ce dépôt interdit. D'où ce module : la mesure vit ici,
 * les RÈGLES vivent chez leurs cliquets.
 */
import { readdirSync, readFileSync } from 'fs';
import { relative, join, sep } from 'path';

/**
 * Seules les sources ÉCRITES À LA MAIN sont visées : la directive 2026-08-28
 * exclut explicitement le code généré et les dépendances. Les suites de tests
 * ont leur propre économie — un témoin par ligne d'un tableau produit de longs
 * fichiers sans dette de lisibilité — et sortent du périmètre, comme le montre
 * la commande de mesure de #4426, qui les écarte elle aussi.
 */
export const isHandWrittenSource = (path: string): boolean =>
  path.endsWith('.ts') && !path.endsWith('.d.ts') && !path.split(sep).includes('__tests__');

export const walk = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return isHandWrittenSource(full) ? [full] : [];
  });

/**
 * Compte comme `wc -l` — le nombre de FINS de ligne — pour que les chiffres de
 * ces cliquets soient les mêmes que ceux des issues et des commentaires, qui
 * citent tous `wc -l`. `split('\n').length` en rendrait un de plus sur tout
 * fichier terminé par un saut de ligne, et le seuil mordrait à 999.
 */
export const lineCount = (path: string): number => {
  const text = readFileSync(path, 'utf8');
  const newlines = (text.match(/\n/g) ?? []).length;
  return text.endsWith('\n') || text.length === 0 ? newlines : newlines + 1;
};

export type FichierMesure = {
  readonly path: string;
  readonly lines: number;
};

/**
 * Les fichiers d'une racine qui atteignent ou dépassent `seuil`, du plus gros
 * au plus petit, chemin relatif à cette racine.
 */
export const overBudget = (root: string, seuil: number): readonly FichierMesure[] =>
  walk(root)
    .map((path) => ({ path: relative(root, path), lines: lineCount(path) }))
    .filter((file) => file.lines >= seuil)
    .sort((a, b) => b.lines - a.lines);

/**
 * La MESURE de taille des fichiers du gateway — une seule, pour tous les
 * cliquets qui la lisent (#4284, élargie par #4426, puis par #4531).
 *
 * Trois cliquets gouvernent le budget de taille, avec trois règles différentes :
 * `unit/routes/route-file-size-budget.test.ts` exige ZÉRO fichier hors budget
 * sous `routes/`, où la dette a été soldée en entier ; `gateway-file-size-budget.test.ts`
 * borne et fait décroître la dette du RESTE des sources de production ;
 * `gateway-test-file-size-budget.test.ts` fait la même chose pour les SUITES.
 * Les trois règles sont légitimement distinctes.
 *
 * Ce qui ne doit PAS l'être, c'est la mesure. Deux implémentations de
 * `lineCount` divergeraient d'une ligne au premier fichier sans saut de ligne
 * final, et les cliquets se contrediraient sur le même fichier — la jumelle
 * divergente que ce dépôt interdit. D'où ce module : la mesure vit ici,
 * les RÈGLES vivent chez leurs cliquets.
 */
import { readdirSync, readFileSync } from 'fs';
import { relative, join, sep } from 'path';

/**
 * Ce qu'un balayage RETIENT. C'est un PARAMÈTRE, et #4531 a mesuré pourquoi
 * il devait le devenir.
 *
 * L'issue supposait que `overBudget(racine, seuil)` « prend n'importe quelle
 * racine ». Elle ne le prenait pas : le prédicat était CODÉ EN DUR dans `walk`,
 * si bien que `overBudget(<…>/src/__tests__, 1000)` rendait **`[]`** — tout
 * chemin sous cette racine porte le segment `__tests__` que le prédicat de
 * production exclut. Un cliquet posé dessus aurait été VERT sur un balayage
 * vide : la pire des façons de passer (§ « un témoin qui ne peut pas tomber »).
 *
 * La racine n'était donc pas libre, et le rendre libre n'aurait pas suffi :
 * les suites ne vivent pas toutes sous `src/__tests__`. **Onze des 87 fichiers
 * hors budget sont ailleurs** — dont le PLUS GROS du dépôt
 * (`socketio/__tests__/MeeshySocketIOManager.test.ts`, 8158 lignes) et le
 * quatrième (`socketio/__tests__/CallEventsHandler.test.ts`, 4650). Un cliquet
 * enraciné sur `src/__tests__` aurait manqué 26 968 lignes en se croyant
 * exhaustif.
 *
 * D'où la forme retenue : **une racine UNIQUE (`src/`) et un SÉLECTEUR**. Ce
 * qui distingue les deux cliquets est ce qu'ils retiennent, jamais où ils
 * regardent.
 */
export type SelecteurDeFichier = (path: string) => boolean;

const estSourceTypeScript = (path: string): boolean =>
  path.endsWith('.ts') && !path.endsWith('.d.ts');

const sousUnRepertoireDeTests = (path: string): boolean => path.split(sep).includes('__tests__');

/**
 * Les sources de PRODUCTION. La directive 2026-08-28 exclut explicitement le
 * code généré et les dépendances — d'où le rejet des `.d.ts`.
 *
 * ## Les témoins ne sont plus EXCLUS : ils ont leur propre cliquet (#4531)
 *
 * Ce prédicat a porté, de #4284 au 2026-08-31, l'exemption des suites de tests,
 * sur cette justification écrite ici même :
 *
 * > « Les suites de tests ont leur propre économie (un témoin par ligne d'un
 * > tableau produit de longs fichiers sans dette de lisibilité) et sortent du
 * > périmètre. »
 *
 * **C'était une HYPOTHÈSE, et elle a été mesurée FAUSSE le 2026-08-31.** Sur
 * les 87 fichiers de témoins hors budget (160 730 lignes) :
 *
 * | ce que l'hypothèse prédit | ce que la mesure rend |
 * |---|---|
 * | des `it` engendrés par un tableau | **3 sur 7778** — 0,04 % |
 * | des fichiers longs sans complexité | **60 fichiers sur 87** rouvrent un `describe` de premier niveau déjà ouvert |
 * | une forme propre aux suites | 40 `describe` de premier niveau s'appellent « coverage extension », « extra branch coverage », « pass 2 » |
 *
 * Aucun des DIX plus gros fichiers ne porte un seul cas engendré. La forme qui
 * domine est l'autre — l'empilement — et sous sa variante la plus chère : le
 * MÊME sujet rouvert au premier niveau, 52 fois dans un seul fichier. Savoir
 * ce qui est testé d'une route y demande de lire cinq blocs distants de
 * milliers de lignes.
 *
 * La séparation des deux prédicats ne dit donc plus « les témoins sortent du
 * périmètre ». Elle dit que les deux dettes sont GELÉES SÉPARÉMENT, parce
 * qu'elles se soldent par des lots différents et ne doivent pas pouvoir se
 * compenser : découper un service ne doit pas acheter le droit de faire
 * grossir une suite.
 *
 * Ce que ce prédicat exclut, il faut donc que l'autre l'inclue — et c'est
 * vérifié, pas supposé : les deux sélecteurs PARTITIONNENT les sources
 * TypeScript de `src/` (témoin de partition dans les deux cliquets). Une
 * troisième catégorie qui apparaîtrait échapperait aux deux, et c'est
 * exactement le trou que #4531 vient de fermer.
 */
export const isHandWrittenSource = (path: string): boolean =>
  estSourceTypeScript(path) && !sousUnRepertoireDeTests(path);

/**
 * Les SUITES écrites à la main, bornées par `gateway-test-file-size-budget.test.ts`.
 *
 * Le segment `__tests__` est le discriminant COMPLET, et c'est mesuré : zéro
 * fichier `*.test.ts` du gateway vit hors d'un répertoire `__tests__`
 * (2026-08-31). Discriminer sur le suffixe `.test.ts` laisserait au contraire
 * dehors les harnais, fabriques et balayages partagés qui vivent dans ces
 * répertoires — c'est-à-dire une partie de la dette qu'on veut borner.
 */
export const isHandWrittenTest = (path: string): boolean =>
  estSourceTypeScript(path) && sousUnRepertoireDeTests(path);

export const walk = (
  dir: string,
  retenir: SelecteurDeFichier = isHandWrittenSource,
): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, retenir);
    return retenir(full) ? [full] : [];
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
 * Les fichiers d'une racine que `retenir` sélectionne et qui atteignent ou
 * dépassent `seuil`, du plus gros au plus petit, chemin relatif à cette racine.
 */
export const overBudget = (
  root: string,
  seuil: number,
  retenir: SelecteurDeFichier = isHandWrittenSource,
): readonly FichierMesure[] =>
  walk(root, retenir)
    .map((path) => ({ path: relative(root, path), lines: lineCount(path) }))
    .filter((file) => file.lines >= seuil)
    .sort((a, b) => b.lines - a.lines);

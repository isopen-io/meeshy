/**
 * LA RÈGLE QUI PUBLIE UNE LIGNE DE LA MESURE DE L'IMMORTALISATION (D15, #10185 — lot L20 #10176).
 *
 * Deux audits adversariaux ont montré qu'un rapport à plusieurs niveaux (cellules jour × clé, taux par clé et par
 * famille, push par jour) laisse toujours une soustraction qui isole un compte : chaque ligne publiée passait le seuil,
 * et la DIFFÉRENCE de deux lignes emboîtées n'en passait aucun. Le rapport ne publie donc plus qu'un niveau (la famille
 * à la semaine), et chaque ligne candidate n'y entre qu'à trois conditions, sur des ensembles de COMPTES, jamais des
 * moments :
 *
 *  1. son ensemble porteur compte au moins `minAccounts` comptes ;
 *  2. chaque ensemble qu'on y LIT — porteur, sous-ensemble publié, et son COMPLÉMENT (annoncés − gardés, envoyés −
 *     lus), que la soustraction rend aussi sûrement qu'un nombre imprimé — vaut zéro ou au moins `minAccounts` ;
 *  3. aucun de ses ensembles n'est CONTENU dans un ensemble déjà publié (ou ne le contient) à moins de `minAccounts`
 *     comptes près : la différence de deux ensembles emboîtés est exactement le nombre de comptes qui les séparent.
 *
 * La condition 3 se mesure sur les ensembles RÉELS, pas sur les seuls emboîtements de construction : une inclusion
 * fortuite qu'un lecteur peut déduire (une seule famille annoncée dans la semaine contient tous les comptes poussés)
 * isole aussi bien qu'une inclusion par définition. Deux ensembles qui se recouvrent sans s'emboîter ne se soustraient
 * pas : leur différence n'est le cardinal d'aucun ensemble.
 *
 * Les lignes sont examinées dans un ordre FIXE, indépendant des données (familles, puis push) : une ligne retenue n'est
 * comptée que dans `withheld`, sans étiquette. Toutes les candidates viennent d'UNE semaine : aucune ligne ne se garde
 * contre un autre rapport, parce qu'aucune ne dépend d'une autre semaine (fiche de décision, « une semaine face à une
 * autre »).
 */

export type Accounts = ReadonlySet<string>;

/** Une ligne candidate : ce qu'elle publierait, et les ensembles de comptes qu'un lecteur y lirait. */
export type CandidateLine<L> = {
  readonly line: L;
  /** L'ensemble qui porte la ligne : sous `minAccounts` comptes, elle ne sort pas. */
  readonly base: Accounts;
  /** Tout ce qu'on lit dans la ligne : le porteur, ses sous-ensembles publiés, et leurs compléments. */
  readonly sets: readonly Accounts[];
};

const isSubset = (inner: Accounts, outer: Accounts): boolean => inner.size <= outer.size && [...inner].every((id) => outer.has(id));

/** Zéro ou au moins `minAccounts` : un groupe, ou rien — jamais une poignée de comptes qu'on pourrait nommer. */
const safeCount = (count: number, minAccounts: number): boolean => count === 0 || count >= minAccounts;

/** Deux ensembles emboîtés ne se lisent ensemble que si ce qui les sépare est un groupe. */
const separable = (a: Accounts, b: Accounts, minAccounts: number): boolean =>
  !(isSubset(a, b) || isSubset(b, a)) || safeCount(Math.abs(a.size - b.size), minAccounts);

function publishable<L>(candidate: CandidateLine<L>, published: readonly Accounts[], minAccounts: number): boolean {
  if (candidate.base.size < minAccounts) return false;
  if (!candidate.sets.every((set) => safeCount(set.size, minAccounts))) return false;
  return candidate.sets.every((set) => published.every((other) => separable(set, other, minAccounts)));
}

/** Les lignes publiables, dans l'ordre des candidates, et le nombre de lignes retenues. */
export function publishLines<L>(candidates: readonly CandidateLine<L>[], minAccounts: number): { readonly published: readonly L[]; readonly withheld: number } {
  const accepted = candidates.reduce<{ readonly sets: readonly Accounts[]; readonly lines: readonly L[] }>(
    (state, candidate) =>
      publishable(candidate, state.sets, minAccounts) ? { sets: [...state.sets, ...candidate.sets], lines: [...state.lines, candidate.line] } : state,
    { sets: [], lines: [] },
  );
  return { published: accepted.lines, withheld: candidates.length - accepted.lines.length };
}

/** Les comptes de `whole` qui ne sont pas dans `part` : le complément qu'une soustraction rend. */
export const complement = (whole: Accounts, part: Accounts): Accounts => new Set([...whole].filter((id) => !part.has(id)));

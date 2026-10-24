/**
 * LA FENÊTRE DE RANGÉES (#11228) — la loi qui dit, pour une liste de rangées
 * de hauteur FIXE, lesquelles monter.
 *
 * La liste des conversations montait TOUTES ses rangées : deux cents chargées
 * par la pagination, deux cents composants, deux cents abonnements, pour huit
 * rangées à l'écran. La passe de perspective était déjà bornée à ce qui se
 * voit (`trackVisibleRows`, #11207) ; le DOM, lui, ne l'était pas.
 *
 * La hauteur de mise en page d'une rangée de Lentille ne change JAMAIS
 * (`ROW_HEIGHT`, `components/lens-row.tsx`) : la fenêtre se calcule donc sans
 * rien mesurer d'autre que la tête de chaque section, et une CALE de hauteur
 * exacte tient la place de chaque rangée démontée — la hauteur totale, donc
 * la position de défilement et sa restauration au retour, ne bougent pas.
 *
 * TROIS RÈGLES, chacune pour un piège précis :
 *
 * 1. **La fenêtre ne bouge que quand le besoin la déborde** (`settleRange`).
 *    Recalculer à chaque rangée franchie re-rendrait la liste toutes les 84 px ;
 *    une réserve de part et d'autre ne la fait bouger que toutes les quelques
 *    rangées.
 * 2. **Certaines rangées ne se démontent JAMAIS** (`keptRowIds`) : les deux
 *    bouts de la liste, pour que Début et Fin y mènent ; la rangée qui tient
 *    l'arrêt clavier (#11227), pour que le focus survive au défilement à la
 *    roulette ; et ses deux voisines, pour que haut et bas y mènent — la
 *    rangée atteinte entre au champ, et la fenêtre la rejoint.
 * 3. **Une rangée retenue est montée À SA PLACE**, entre deux cales
 *    (`rowSlices`) : l'ordre du document reste l'ordre de la liste, que le
 *    parcours au clavier et le lecteur d'écran lisent.
 *
 * POURQUOI UNE FENÊTRE MAISON, ET PAS `@tanstack/react-virtual` qui sert le
 * fil : ce dernier positionne ses cellules dans UN conteneur, alors que la
 * liste a des SECTIONS dont chaque bloc borne son en-tête collant ; et il
 * mesure des hauteurs variables, quand celle d'une rangée de Lentille est une
 * constante. Une loi de quelques lignes suffit, sans rien ajouter au chunk de
 * la liste que la bibliothèque y aurait apporté.
 */

/** Un intervalle d'indices `[start, end)`. */
export type RowRange = { readonly start: number; readonly end: number };

export const EMPTY_RANGE: RowRange = { start: 0, end: 0 };

/** Une tranche de la liste : des rangées montées, ou une cale qui tient leur place. */
export type RowSlice =
  | { readonly kind: 'rows'; readonly from: number; readonly to: number }
  | { readonly kind: 'gap'; readonly at: number; readonly rows: number };

/**
 * Les rangées que le défileur montre, marge comprise. `top` est la position
 * de la PREMIÈRE rangée par rapport au haut du défileur (négative une fois
 * défilée).
 */
export function rowsInView(input: {
  readonly top: number;
  readonly viewport: number;
  readonly rowHeight: number;
  readonly count: number;
  readonly marginPx: number;
}): RowRange {
  const { top, viewport, rowHeight, count, marginPx } = input;
  const start = Math.max(0, Math.floor((-top - marginPx) / rowHeight));
  const end = Math.min(count, Math.ceil((viewport - top + marginPx) / rowHeight));
  return start >= end ? EMPTY_RANGE : { start, end };
}

const contains = (outer: RowRange, inner: RowRange): boolean => outer.start <= inner.start && outer.end >= inner.end;

/**
 * La fenêtre montée, rendue STABLE : la même référence tant que le besoin y
 * tient — c'est ce qui épargne un rendu à chaque rangée franchie.
 */
export function settleRange(current: RowRange, need: RowRange, input: { readonly count: number; readonly extraRows: number }): RowRange {
  const { count, extraRows } = input;
  if (need.start >= need.end) return EMPTY_RANGE;
  if (current.end <= count && contains(current, need)) return current;
  return { start: Math.max(0, need.start - extraRows), end: Math.min(count, need.end + extraRows) };
}

type Run = { readonly from: number; readonly to: number };

const mergeRuns = (runs: readonly Run[]): readonly Run[] =>
  [...runs]
    .sort((a, b) => a.from - b.from)
    .reduce<readonly Run[]>((merged, run) => {
      const last = merged.at(-1);
      if (last === undefined || run.from > last.to) return [...merged, run];
      return [...merged.slice(0, -1), { from: last.from, to: Math.max(last.to, run.to) }];
    }, []);

/**
 * Les tranches à peindre, dans l'ordre de la liste. Elles s'ouvrent TOUJOURS
 * par une cale (vide en tête de liste) : c'est l'ancre dont la position dit
 * où commence la section.
 */
export function rowSlices(input: { readonly count: number; readonly range: RowRange; readonly keep: readonly number[] }): readonly RowSlice[] {
  const { count, range, keep } = input;
  const window: readonly Run[] = range.end > range.start ? [{ from: range.start, to: Math.min(count, range.end) }] : [];
  const kept = keep.filter((index) => Number.isInteger(index) && index >= 0 && index < count).map((index) => ({ from: index, to: index + 1 }));
  const runs = mergeRuns([...window, ...kept]);
  const lead: RowSlice = { kind: 'gap', at: 0, rows: runs[0]?.from ?? count };
  const body = runs.flatMap((run, i): readonly RowSlice[] => {
    const next = runs[i + 1]?.from ?? count;
    const rows: RowSlice = { kind: 'rows', from: run.from, to: run.to };
    return next > run.to ? [rows, { kind: 'gap', at: run.to, rows: next - run.to }] : [rows];
  });
  return [lead, ...body];
}

/**
 * Les fenêtres d'ENTRÉE, avant que la moindre tête de section n'ait été
 * mesurée : les blocs se suivent, donc le premier écran (`rows` rangées,
 * réserve comprise) se partage dans l'ordre, et un bloc qui commence au-delà
 * n'entre avec RIEN. Donner un écran entier à chaque section montait, au
 * démarrage à froid, une poignée de rangées par section — dix sections, cent
 * soixante rangées — que la mesure démontait aussitôt.
 */
export function entryRanges(blocks: readonly { readonly id: string; readonly count: number }[], input: { readonly rows: number }): ReadonlyMap<string, RowRange> {
  const before = blocks.map((_, i) => blocks.slice(0, i).reduce((sum, block) => sum + block.count, 0));
  return new Map(
    blocks.map((block, i) => {
      const end = Math.min(block.count, input.rows - (before[i] ?? 0));
      return [block.id, end > 0 ? { start: 0, end } : EMPTY_RANGE] as const;
    }),
  );
}

/** Les rangées que la fenêtre ne démonte jamais — voir la règle 2 du doc-comment. */
export function keptRowIds(input: { readonly order: readonly string[]; readonly active: string | null }): ReadonlySet<string> {
  const { order, active } = input;
  const at = active === null ? -1 : order.indexOf(active);
  const around = at < 0 ? [] : [order[at - 1], order[at], order[at + 1]];
  return new Set([order[0], order.at(-1), ...around].filter((id): id is string => id !== undefined));
}

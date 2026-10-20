/**
 * L'ENSEMBLE DES RANGÉES VISIBLES D'UN DÉFILEUR (#11207) — ce que le
 * navigateur sait déjà, sans qu'aucune passe ne lise la géométrie de ce qui
 * est hors de l'écran.
 *
 * Un `IntersectionObserver` (racine : le défileur, marge verticale :
 * `overscanPx`) tient l'ensemble ; un `MutationObserver` lui présente chaque
 * rangée montée APRÈS coup (pagination, dépli d'une section) et lui retire
 * chaque rangée démontée — un observateur retient ses cibles tant qu'on ne
 * les lui reprend pas, et une liste qui pagine sans `unobserve` garderait en
 * mémoire toutes les rangées qu'elle a jamais montées.
 *
 * TANT QUE L'OBSERVATEUR N'A RIEN DIT (son premier rapport arrive à l'image
 * qui suit `observe`), et partout où il n'existe pas, `current()` rend TOUTES
 * les rangées : on paie une passe complète, jamais une passe vide qui
 * n'élirait rien.
 */
export type VisibleRows = {
  readonly current: () => readonly HTMLElement[];
  readonly stop: () => void;
};

export type VisibleRowsOptions = {
  readonly selector: string;
  readonly overscanPx: number;
  /** Des rangées viennent d'entrer dans l'ensemble. */
  readonly onEnter?: (rows: readonly HTMLElement[]) => void;
  /** Des rangées viennent d'en sortir (elles sont encore montées). */
  readonly onLeave?: (rows: readonly HTMLElement[]) => void;
};

const rowsWithin = (node: Node, selector: string): readonly HTMLElement[] => {
  if (!(node instanceof HTMLElement)) return [];
  const nested = [...node.querySelectorAll<HTMLElement>(selector)];
  return node.matches(selector) ? [node, ...nested] : nested;
};

export function trackVisibleRows(root: HTMLElement, options: VisibleRowsOptions): VisibleRows {
  const { selector, overscanPx, onEnter, onLeave } = options;
  const all = (): readonly HTMLElement[] => [...root.querySelectorAll<HTMLElement>(selector)];
  if (typeof IntersectionObserver !== 'function') return { current: all, stop: () => {} };

  const inView = new Set<HTMLElement>();
  const state = { reported: false };

  const io = new IntersectionObserver(
    (entries) => {
      state.reported = true;
      const targets = entries.flatMap((entry) => (entry.target instanceof HTMLElement ? [{ row: entry.target, visible: entry.isIntersecting }] : []));
      const entered = targets.filter(({ row, visible }) => visible && !inView.has(row)).map(({ row }) => row);
      const left = targets.filter(({ row, visible }) => !visible && inView.has(row)).map(({ row }) => row);
      entered.forEach((row) => inView.add(row));
      left.forEach((row) => inView.delete(row));
      if (entered.length > 0) onEnter?.(entered);
      const stillMounted = left.filter((row) => row.isConnected);
      if (stillMounted.length > 0) onLeave?.(stillMounted);
    },
    { root, rootMargin: `${overscanPx}px 0px` },
  );

  all().forEach((row) => io.observe(row));

  const mo =
    typeof MutationObserver === 'function'
      ? new MutationObserver((records) => {
          for (const record of records) {
            record.removedNodes.forEach((node) =>
              rowsWithin(node, selector).forEach((row) => {
                io.unobserve(row);
                inView.delete(row);
              }),
            );
            record.addedNodes.forEach((node) => rowsWithin(node, selector).forEach((row) => io.observe(row)));
          }
        })
      : null;
  mo?.observe(root, { childList: true, subtree: true });

  return {
    current: () => (state.reported ? [...inView].filter((row) => row.isConnected) : all()),
    stop: () => {
      mo?.disconnect();
      io.disconnect();
      inView.clear();
    },
  };
}

/**
 * L'ANNEAU DES ACTES DU JOUR (#17768) — autour du bouton du menu, un segment s'allume par acte du jour réalisé.
 *
 * Le client ne recalcule AUCUNE règle : le jour du joueur, ses actes et leur réalisation sont décidés par la
 * passerelle et servis dans le bloc `game` (`missions.items[].completedAt`). Cette loi ne fait
 * que LIRE ce bloc — le cache d'abord — et dire combien d'actes sont faits sur ceux du jour.
 *
 * `null` ⇒ aucun anneau : « Jeu masqué », aucun bloc (cache vide, ancien serveur), ou jour servi sans acte —
 * dont un ancien serveur sous le niveau 5. Le premier Rêve (#17370) a un acte : un anneau d'un segment. Aucune notification n'en découle (#17368).
 */
export type GameActsRing = {
  readonly done: number;
  readonly total: number;
};

/** La part du bloc `game` que la loi lit — rien d'autre. */
export type GameActsRingSource = {
  readonly missions: {
    readonly items: ReadonlyArray<{ readonly completedAt: string | null }>;
  };
};

export function gameActsRing(game: GameActsRingSource | null | undefined, options: { readonly hidden: boolean }): GameActsRing | null {
  if (options.hidden || game === null || game === undefined) return null;
  const { items } = game.missions;
  if (items.length === 0) return null;
  return { done: items.filter((item) => item.completedAt !== null).length, total: items.length };
}

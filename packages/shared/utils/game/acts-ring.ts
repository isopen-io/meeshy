/**
 * L'ANNEAU DES ACTES DU JOUR (#17768) — autour du bouton du menu, un segment s'allume par acte du jour réalisé.
 *
 * Le client ne recalcule AUCUNE règle : le jour du joueur, ses actes et leur réalisation sont décidés par la
 * passerelle et servis dans le bloc `game` (`missions.unlocked`, `missions.items[].completedAt`). Cette loi ne fait
 * que LIRE ce bloc — le cache d'abord — et dire combien d'actes sont faits sur ceux du jour.
 *
 * `null` ⇒ aucun anneau : « Jeu masqué », aucun bloc (cache vide, ancien serveur), actes pas encore ouverts
 * (avant le niveau 5) ou jour servi sans acte. Aucune notification n'en découle (#17368).
 */
export type GameActsRing = {
  readonly done: number;
  readonly total: number;
};

/** La part du bloc `game` que la loi lit — rien d'autre. */
export type GameActsRingSource = {
  readonly missions: {
    readonly unlocked: boolean;
    readonly items: ReadonlyArray<{ readonly completedAt: string | null }>;
  };
};

export function gameActsRing(game: GameActsRingSource | null | undefined, options: { readonly hidden: boolean }): GameActsRing | null {
  if (options.hidden || game === null || game === undefined) return null;
  const { unlocked, items } = game.missions;
  if (!unlocked || items.length === 0) return null;
  return { done: items.filter((item) => item.completedAt !== null).length, total: items.length };
}

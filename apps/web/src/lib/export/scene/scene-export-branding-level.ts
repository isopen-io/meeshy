/**
 * **LE PORT DU NIVEAU DE LIEN** (#13997) — d'où vient le niveau EFFECTIF du
 * lien exportateur ↔ auteur que le logo de cercle projette. Il viendra du
 * serveur (#13998, route de relation) ; tant que cette route n'est pas
 * livrée, le fournisseur par défaut ne sait rien (`null`) et le logo ne se
 * peint pas. Le rendu et le câblage jusqu'ici sont complets : un fournisseur
 * injecté suffit à voir le logo.
 *
 * La résolution est BORNÉE comme le reste du préambule : l'export n'attend
 * jamais le réseau au-delà de `budgetMs`, il part sans logo.
 */

export type RelationLevelProvider = (params: { readonly authorId: string; readonly signal: AbortSignal }) => Promise<unknown>;

export const noRelationLevel: RelationLevelProvider = () => Promise.resolve(null);

export async function resolveRelationLevel(params: {
  readonly provider: RelationLevelProvider;
  readonly authorId: string;
  readonly self: boolean;
  readonly budgetMs: number;
  readonly signal: AbortSignal;
}): Promise<unknown> {
  if (params.self) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), params.budgetMs);
  });
  const served = params.provider({ authorId: params.authorId, signal: params.signal }).catch(() => null);
  try {
    return await Promise.race([served, budget]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ordonnancement borné de tâches asynchrones.
 *
 * `Promise.all(items.map(fn))` lance TOUT en même temps : à 199 pièces jointes
 * par message (cf. `MAX_ATTACHMENTS_PER_MESSAGE`), cela signifie 199 requêtes
 * HTTP simultanées côté navigateur ou 199 dispatches ML simultanés côté
 * gateway. Un pool borné garde le parallélisme — la latence reste celle du
 * lot le plus lent, pas la somme — sans transformer un envoi en rafale de
 * déni de service contre son propre backend.
 *
 * Source de vérité unique : le gateway (dispatch audio) et le web (uploads)
 * partagent CE module plutôt que de réinventer chacun sa boucle.
 */

/**
 * Applique `task` à chaque élément avec au plus `limit` tâches en vol.
 *
 * - Les résultats sont rendus dans l'ORDRE des entrées, jamais dans l'ordre
 *   d'achèvement — les appelants indexent leurs entrées par position.
 * - `limit` est ramené dans `[1, items.length]` : une valeur nulle, négative
 *   ou non finie vaut 1 (séquentiel), jamais « aucune borne ».
 * - Sémantique d'erreur identique à `Promise.all` : le premier rejet rejette
 *   l'appel. Les tâches déjà en vol restent surveillées (aucun rejet
 *   orphelin), mais les éléments non encore démarrés par le worker fautif ne
 *   le seront pas. Un appelant « best-effort » (chaque élément indépendant)
 *   doit donc capturer DANS `task`, pas autour de `mapWithConcurrency`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const total = items.length;
  if (total === 0) return [];

  const workers = Math.max(1, Math.min(Number.isFinite(limit) ? Math.floor(limit) : 1, total));
  const results = new Array<R>(total);

  // File d'attente indexée : un `entries[cursor]` hors borne rend `undefined`,
  // ce qui termine le worker — la borne se lit sur la valeur, sans assertion
  // de type ni `shift()` quadratique.
  const entries = items.map((item, index) => ({ item, index }));
  let cursor = 0;

  const runWorker = async (): Promise<void> => {
    for (;;) {
      const entry = entries[cursor];
      cursor += 1;
      if (entry === undefined) return;
      results[entry.index] = await task(entry.item, entry.index);
    }
  };

  await Promise.all(Array.from({ length: workers }, runWorker));
  return results;
}

/**
 * Variante best-effort : chaque élément est isolé, un échec n'empêche ni les
 * suivants ni la restitution des réussites. Rendu dans l'ordre des entrées.
 */
export async function settleWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<ReadonlyArray<{ readonly ok: true; readonly value: R } | { readonly ok: false; readonly error: unknown }>> {
  return mapWithConcurrency(items, limit, async (item, index) => {
    try {
      return { ok: true as const, value: await task(item, index) };
    } catch (error) {
      return { ok: false as const, error };
    }
  });
}

/**
 * Découpe une liste en tranches de `size` éléments, dans l'ordre.
 * `size` non finie ou < 1 produit une tranche unique.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [];
  // `size` non finie OU < 1 ⇒ tranche unique (step = tout le tableau). Le test
  // `size >= 1` est indispensable : `Math.max(1, Math.floor(size))` ramenait un
  // `size` fini < 1 (0, négatif, fractionnaire) à `step = 1`, fragmentant la
  // liste en singletons au lieu de la tranche unique documentée — alors que le
  // chemin non fini (NaN/Infinity) l'honorait déjà. Un `size` absurde signifie
  // « ne pas découper », pas « découper au grain 1 ».
  const step = Number.isFinite(size) && size >= 1 ? Math.floor(size) : items.length;
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += step) {
    chunks.push(items.slice(start, start + step));
  }
  return chunks;
}

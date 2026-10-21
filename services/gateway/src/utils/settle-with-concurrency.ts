/**
 * `Promise.allSettled` à débit BORNÉ : au plus `limit` appels de `run` en vol,
 * résultats rendus dans l'ordre des `items`.
 *
 * Pourquoi pas des tranches (`slice` + `allSettled` par tranche) : une tranche
 * attend son membre le plus lent avant de lancer la suivante. Un réservoir de
 * `limit` ouvriers relance dès qu'une place se libère, et tient la file Prisma
 * à hauteur constante (#10819).
 */
export async function settleWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: 'fulfilled', value: await run(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  const workers = Math.max(1, Math.min(Math.floor(limit), items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

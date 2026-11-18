/**
 * Attend une promesse PUIS les effets qu'elle a lancés sans les attendre (signal, alerte) :
 * la file des microtâches se vide avant le prochain tour de boucle.
 */
export const flushBackground = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export async function settled<T>(promise: Promise<T>): Promise<T> {
  const result = await promise;
  await flushBackground();
  return result;
}

/**
 * Lance des tâches par lots de `size` (dix par défaut, l'ancien plafond d'un post) : une story peut porter 200
 * médias (#13590), et autant d'écritures simultanées dans la transaction d'une édition saturent la session.
 */
export async function inBatches(tasks: ReadonlyArray<() => Promise<unknown>>, size = 10): Promise<void> {
  for (let start = 0; start < tasks.length; start += size) {
    await Promise.all(tasks.slice(start, start + size).map((task) => task()));
  }
}

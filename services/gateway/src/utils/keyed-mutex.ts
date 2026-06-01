/**
 * Mutex asynchrone à clé : sérialise les sections critiques partageant la même
 * clé, tout en laissant les clés différentes s'exécuter en parallèle.
 *
 * Usage : sérialiser un read-modify-write sur un même document (ex. l'objet
 * `translations` d'un attachment) quand plusieurs événements concurrents
 * (une langue chacun) le mettent à jour — sinon chaque handler lit l'ancien
 * objet et le réécrit, écrasant les langues des autres (lost update).
 */
export class KeyedMutex {
  private readonly chains = new Map<string, Promise<unknown>>();

  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();

    // Enchaîne après la précédente, qu'elle réussisse ou échoue (la chaîne
    // ne doit jamais se rompre sur une erreur d'une opération antérieure).
    const run = previous.then(() => fn(), () => fn());

    // La queue de la chaîne ignore le résultat/erreur pour garder l'ordre.
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.chains.set(key, tail);

    try {
      return await run;
    } finally {
      // Évite la croissance non bornée de la Map : si personne d'autre n'a
      // enchaîné après nous, on retire la clé.
      if (this.chains.get(key) === tail) {
        this.chains.delete(key);
      }
    }
  }
}

/**
 * `createOfflineQueue` (#7367, W3) — LA FILE FIFO GÉNÉRIQUE (CLAUDE.md §
 * Instant App, « Offline Graceful Degradation : Write actions queued
 * (OfflineQueue). FIFO flush on reconnect ») : `grep -r OfflineQueue
 * apps/web-v2` rendait ZÉRO résultat avant ce lot — aucune infrastructure de
 * rejeu n'existait, une panne (réseau, 5xx/408/429) pendant une écriture
 * optimiste la LAISSAIT en l'état, sans jamais la reposter (#7367, doc-
 * comment `markCaughtUp` avant ce lot).
 *
 * PUR, sans DOM ni réseau : `run` (le POST/PATCH réel) est REÇU par `flush`,
 * jamais lu depuis un singleton (même discipline que `SendDeps` dans
 * `send/perform-send.ts` — « queryClient/outbox/online sont REÇUS, jamais
 * lus depuis un singleton »). Le premier consommateur est
 * `lib/api/receipts.ts` (le marquage lu perdu hors ligne) ; un futur domaine
 * (favoris, réactions…) instancie SA PROPRE file par ce même constructeur —
 * jamais une file PARTAGÉE entre domaines, dont le dédoublonnage par clé se
 * mélangerait.
 *
 * ## DÉDOUBLONNAGE PAR CLÉ, POSITION FIFO INCHANGÉE
 *
 * `enqueue(key, payload)` REMPLACE le job déjà en attente pour cette clé
 * (`Map.set` sur une clé existante ne déplace jamais sa position
 * d'itération, garanti par la spécification) : une seconde panne sur la
 * MÊME conversation ne fait pas repartir le job en fin de file — seul son
 * CONTENU avance (la frontière la plus récente rattrape les précédentes,
 * jamais l'inverse).
 *
 * ## LE FLUSH S'ARRÊTE AU PREMIER ÉCHEC
 *
 * `flush` rejoue les jobs dans l'ordre d'ENQUEUE et retire ceux qui
 * réussissent ; un `run` qui échoue encore (toujours hors ligne, ou une
 * panne transitoire persistante) ARRÊTE le flush — les jobs restants
 * gardent leur position, prêts pour le PROCHAIN `online`. Un flush déjà en
 * cours ignore un second appel concurrent (deux `online` rapprochés ne
 * rejouent jamais la même file deux fois en parallèle).
 */
export type OfflineQueue<T> = {
  readonly enqueue: (key: string, payload: T) => void;
  /** `run` rend `true` ⇒ le job est retiré ; `false` ⇒ le flush s'arrête là. */
  readonly flush: (run: (payload: T) => Promise<boolean>) => Promise<void>;
  readonly size: () => number;
  readonly clear: () => void;
};

export function createOfflineQueue<T>(): OfflineQueue<T> {
  const jobs = new Map<string, T>();
  let flushing = false;

  function enqueue(key: string, payload: T): void {
    jobs.set(key, payload);
  }

  async function flush(run: (payload: T) => Promise<boolean>): Promise<void> {
    if (flushing) return;
    flushing = true;
    try {
      for (const [key, payload] of jobs) {
        const succeeded = await run(payload);
        if (!succeeded) break;
        jobs.delete(key);
      }
    } finally {
      flushing = false;
    }
  }

  function size(): number {
    return jobs.size;
  }

  function clear(): void {
    jobs.clear();
  }

  return { enqueue, flush, size, clear };
}

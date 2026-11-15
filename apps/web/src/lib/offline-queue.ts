import type { SafeStorage } from '@/lib/storage';

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
  /**
   * LE JOB DE CETTE CLÉ EST PÉRIMÉ (revue-correction #7367) — appelé quand
   * l'appelant a obtenu, PAR UN AUTRE CHEMIN, une issue qui rend le job en
   * attente sans objet. Sans ce geste, un job gardé indéfiniment (une panne
   * TRANSITOIRE ne fait basculer aucun `offline`) se rejouait au premier
   * `online` venu et REMETTAIT une valeur périmée par-dessus une plus
   * récente. Sur une clé absente : sans effet.
   */
  readonly remove: (key: string) => void;
  /** `run` rend `true` ⇒ le job est retiré ; `false` ⇒ le flush s'arrête là. */
  readonly flush: (run: (payload: T) => Promise<boolean>) => Promise<void>;
  readonly size: () => number;
  /** Les jobs en attente, dans l'ordre FIFO : ce qu'un écran doit continuer d'afficher comme fait. */
  readonly pending: () => readonly T[];
  readonly clear: () => void;
};

/**
 * LA FILE QUI SURVIT AU RECHARGEMENT (#10174) — sans elle, une écriture mise
 * en file hors ligne mourait avec l'onglet. Le stockage est une FRONTIÈRE DE
 * CONFIANCE : chaque entrée relue passe par `parse`, et une entrée illisible
 * est écartée sans faire tomber les autres. Une écriture refusée (quota,
 * navigation privée) laisse la file en mémoire : elle se rejoue tant que
 * l'onglet vit, comme avant.
 */
export type OfflineQueuePersistence<T> = {
  readonly storage: SafeStorage;
  readonly key: string;
  readonly parse: (raw: unknown) => T | null;
};

const readPersisted = <T,>(persistence: OfflineQueuePersistence<T>): readonly (readonly [string, T])[] => {
  try {
    const raw: unknown = JSON.parse(persistence.storage.getItem(persistence.key) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry: unknown): (readonly [string, T])[] => {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string') return [];
      const payload = persistence.parse(entry[1]);
      return payload === null ? [] : [[entry[0], payload]];
    });
  } catch {
    return [];
  }
};

export function createOfflineQueue<T>(persistence?: OfflineQueuePersistence<T>): OfflineQueue<T> {
  const jobs = new Map<string, T>(persistence === undefined ? [] : readPersisted(persistence));
  let flushing = false;

  function save(): void {
    if (persistence === undefined) return;
    try {
      if (jobs.size === 0) persistence.storage.removeItem(persistence.key);
      else persistence.storage.setItem(persistence.key, JSON.stringify([...jobs]));
    } catch {
      return;
    }
  }

  function enqueue(key: string, payload: T): void {
    jobs.set(key, payload);
    save();
  }

  function remove(key: string): void {
    jobs.delete(key);
    save();
  }

  /**
   * Toujours la TÊTE de la file : un job remplacé pendant son envoi garde sa
   * place et repart avec sa valeur la plus récente, au lieu d'être retiré
   * avec celle qui vient de partir.
   */
  async function flush(run: (payload: T) => Promise<boolean>): Promise<void> {
    if (flushing) return;
    flushing = true;
    try {
      for (let head = jobs.entries().next(); !head.done; head = jobs.entries().next()) {
        const [key, payload] = head.value;
        const succeeded = await run(payload);
        if (!succeeded) break;
        if (jobs.get(key) === payload) remove(key);
      }
    } finally {
      flushing = false;
    }
  }

  function size(): number {
    return jobs.size;
  }

  function pending(): readonly T[] {
    return [...jobs.values()];
  }

  function clear(): void {
    jobs.clear();
    save();
  }

  return { enqueue, remove, flush, size, pending, clear };
}

/**
 * Le magasin du partage temporaire de position, EN MÉMOIRE et ATOMIQUE comme ses scripts
 * Lua : chaque geste conditionnel (prise, écriture sous condition, arrêt) s'exécute d'un
 * bloc. La pause modélise la latence réseau d'une écriture, AVANT qu'elle n'atteigne le
 * magasin ; la panne modélise un Redis injoignable : le geste lève, comme le client natif.
 */
import type { SharedLocationKv } from '../../services/sharedLocation/sharedLocationKv';

type Entry = { value: string; ttl?: number; until?: number };
type Ecriture = 'set' | 'claim' | 'setIfCurrent' | 'advance';

/** `horloge` fournie : une clé posée avec une durée de vie disparaît à son terme, comme dans Redis. */
export function sharedLocationKvEnMemoire(options: { readonly horloge?: () => number } = {}) {
  const entries = new Map<string, Entry>();
  let pause: Promise<void> | null = null;
  let cible: Ecriture | null = null;
  let relacher = (): void => undefined;
  let enPanne = false;

  const panne = (): void => {
    if (enPanne) throw new Error('redis injoignable');
  };
  const vivante = (key: string): Entry | undefined => {
    const entry = entries.get(key);
    if (entry?.until !== undefined && options.horloge && entry.until <= options.horloge()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  const poser = (key: string, value: string, ttl?: number): void => {
    const until = ttl !== undefined && options.horloge ? options.horloge() + ttl * 1000 : undefined;
    entries.set(key, { value, ttl, until });
  };
  const ecriture = async (op: Ecriture): Promise<void> => {
    panne();
    if (cible !== null && cible !== op) return;
    const attente = pause;
    pause = null;
    cible = null;
    if (attente) await attente;
    panne();
  };

  const kv: SharedLocationKv = {
    get: async (key) => {
      panne();
      return vivante(key)?.value ?? null;
    },
    set: async (key, value, ttl) => {
      await ecriture('set');
      poser(key, value, ttl);
    },
    del: async (key) => {
      panne();
      entries.delete(key);
    },
    claim: async (keys, args) => {
      await ecriture('claim');
      if ((vivante(keys.generation)?.value ?? '0') !== args.generation) return { claimed: false, displaced: null };
      const displaced = vivante(keys.pointer)?.value ?? null;
      poser(keys.pointer, args.session, args.ttlSeconds);
      return { claimed: true, displaced };
    },
    setIfCurrent: async (keys, args) => {
      await ecriture('setIfCurrent');
      if (vivante(keys.pointer)?.value !== args.session) return false;
      poser(keys.state, args.value, args.ttlSeconds);
      return true;
    },
    advance: async (keys) => {
      await ecriture('advance');
      poser(keys.generation, String(Number(vivante(keys.generation)?.value ?? '0') + 1));
      const previous = vivante(keys.pointer)?.value ?? null;
      entries.delete(keys.pointer);
      return previous;
    },
  };

  return {
    ...kv,
    entries,
    /**
     * La prochaine écriture (de l'opération `op`, ou de n'importe laquelle) attend `relacher()` :
     * un geste en vol, rattrapé par un autre. La pause précède l'opération, qui reste atomique.
     */
    suspendreProchaineEcriture: (op?: Ecriture) => {
      cible = op ?? null;
      pause = new Promise<void>((resolve) => {
        relacher = resolve;
      });
    },
    relacher: () => relacher(),
    /** Redis injoignable (`true`) ou revenu (`false`). */
    panne: (etat: boolean) => {
      enPanne = etat;
    },
    /** Les clés d'état et de pointeur d'un compte (la génération, compteur sans donnée, n'en fait pas partie). */
    clesDe: (userId: string) =>
      [...entries.keys()].filter((key) => key.startsWith(`shared-location:{${userId}}:`) || key === `shared-location-current:{${userId}}`),
    etatsDe: (userId: string) => [...entries.keys()].filter((key) => key.startsWith(`shared-location:{${userId}}:`)),
    pointeurDe: (userId: string) => entries.get(`shared-location-current:{${userId}}`)?.value ?? null,
  };
}

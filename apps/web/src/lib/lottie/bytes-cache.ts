import type { LottieBytesLoader } from './sources';

/**
 * **LES OCTETS PARTAGÉS** (#10815) — une même couche (le même contour posé sur
 * trente rangées) se charge et se vérifie UNE fois : la promesse est retenue
 * par clé, dans un cache borné où la clé la moins récemment servie part la
 * première. Un échec (`null` ou rejet) n'est pas retenu : la couche suivante
 * réessaie. Les octets sont relus, jamais modifiés.
 */
export type LottieBytesCache = (key: string, load: LottieBytesLoader) => LottieBytesLoader;

export function createLottieBytesCache(capacity: number): LottieBytesCache {
  const entries = new Map<string, Promise<Uint8Array | null>>();

  const forget = (key: string, pending: Promise<Uint8Array | null>): void => {
    if (entries.get(key) === pending) entries.delete(key);
  };

  return (key, load) => () => {
    const known = entries.get(key);
    if (known !== undefined) {
      entries.delete(key);
      entries.set(key, known);
      return known;
    }
    const pending = load();
    entries.set(key, pending);
    pending.then(
      (bytes) => (bytes === null ? forget(key, pending) : undefined),
      () => forget(key, pending),
    );
    [...entries.keys()].slice(0, Math.max(0, entries.size - capacity)).forEach((old) => entries.delete(old));
    return pending;
  };
}

export const sharedLottieBytes: LottieBytesCache = createLottieBytesCache(24);

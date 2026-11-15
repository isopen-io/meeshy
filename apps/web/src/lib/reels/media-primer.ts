/**
 * L'AMORCEUR D'OCTETS DES RÉELS (#9702) — la part de la fenêtre de
 * préchargement (`preload-window.ts`) qui ne monte AUCUN élément.
 *
 * Un `<video>` monté coûte un lecteur au navigateur, et le décodeur matériel
 * est une ressource bornée : au-delà de N±2, on ne monte rien. On télécharge
 * en revanche la TÊTE du fichier (une plage `bytes=0-n`, de quoi tenir
 * l'atome `moov` et les premières secondes) pour que le cache HTTP du
 * navigateur la serve à l'élément quand le réel entrera dans la fenêtre
 * montée. Le corps est LU jusqu'au bout : une réponse abandonnée non lue ne
 * s'écrit pas dans le cache.
 *
 * - **Priorité basse** (`priority: 'low'`) : l'amorce ne dispute jamais le
 *   réseau au réel qui joue.
 * - **Concurrence bornée**, file servie dans l'ordre donné (l'appelant met le
 *   plus proche d'abord).
 * - **Ce qui sort de la fenêtre s'abandonne**, en vol comme en file : un
 *   balayage rapide ne laisse aucune requête orpheline.
 * - Une tête amorcée ne se redemande pas ; un échec ne bloque pas la file
 *   (l'élément refera la requête lui-même, l'amorce n'est qu'une avance).
 */
export type PrimeTarget = { readonly url: string; readonly bytes: number };

export type MediaPrimer = {
  readonly sync: (targets: readonly PrimeTarget[]) => void;
  readonly dispose: () => void;
};

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export function createMediaPrimer(params: { readonly fetch: Fetcher; readonly maxConcurrent: number }): MediaPrimer {
  const primed = new Set<string>();
  const inFlight = new Map<string, AbortController>();
  let queue: readonly PrimeTarget[] = [];

  const pump = (): void => {
    const room = params.maxConcurrent - inFlight.size;
    if (room <= 0) return;
    const next = queue.filter((t) => !inFlight.has(t.url) && !primed.has(t.url)).slice(0, room);
    next.forEach(start);
  };

  const settle = (url: string, controller: AbortController, ok: boolean): void => {
    if (inFlight.get(url) !== controller) return;
    inFlight.delete(url);
    if (ok) primed.add(url);
    queue = queue.filter((t) => t.url !== url);
    pump();
  };

  const start = (target: PrimeTarget): void => {
    const controller = new AbortController();
    inFlight.set(target.url, controller);
    const init: RequestInit & { readonly priority: 'low' } = {
      headers: { Range: `bytes=0-${Math.max(0, target.bytes - 1)}` },
      signal: controller.signal,
      priority: 'low',
    };
    params
      .fetch(target.url, init)
      .then((response) => response.arrayBuffer())
      .then(
        () => settle(target.url, controller, true),
        () => settle(target.url, controller, false),
      );
  };

  return {
    sync: (targets) => {
      const wanted = new Set(targets.map((t) => t.url));
      [...inFlight].filter(([url]) => !wanted.has(url)).forEach(([url, controller]) => {
        inFlight.delete(url);
        controller.abort();
      });
      queue = targets.filter((t) => !primed.has(t.url));
      pump();
    },
    dispose: () => {
      inFlight.forEach((controller) => controller.abort());
      inFlight.clear();
      queue = [];
    },
  };
}

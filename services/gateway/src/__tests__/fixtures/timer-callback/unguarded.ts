/**
 * Les formes que le balayage des minuteries doit VOIR.
 *
 * Un balayage qui ne trouve jamais rien rend un inventaire vide pour la
 * mauvaise raison, et c'est indiscernable du succès. Les formes sont celles
 * relevées en production au #9480 : le rappel SYNCHRONE en ligne (la purge
 * GeoIP du #9474, `StatusHandler._evictStale`), la RÉFÉRENCE dont le corps
 * n'est pas visible au site, l'appel d'une méthode ASYNCHRONE abandonné sans
 * même un `void` (`TusCleanupService`), la fonction `async` en ligne, le bloc
 * qui appelle autre chose que `resolve` / `reject`, et l'appel via `globalThis`.
 */
declare const cache: { evict(): number };
declare const svc: { cleanup(): Promise<void> };
declare const settle: () => void;
declare function purge(): void;

export function syncInline(): NodeJS.Timeout {
  return setInterval(() => cache.evict(), 10);
}

export function reference(): NodeJS.Timeout {
  return setInterval(purge, 10);
}

export function abandonedPromise(): NodeJS.Timeout {
  return setInterval(() => svc.cleanup(), 10);
}

export function asyncInline(): NodeJS.Timeout {
  return setTimeout(async () => {
    await svc.cleanup();
  }, 10);
}

export function blockCallingAnotherFunction(): NodeJS.Timeout {
  return setTimeout(() => { settle(); }, 10);
}

export function throughGlobalThis(): NodeJS.Timeout {
  return globalThis.setTimeout(() => cache.evict(), 10);
}

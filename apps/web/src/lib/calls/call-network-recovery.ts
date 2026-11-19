/**
 * **UN APPEL SURVIT À UN CHANGEMENT DE RÉSEAU** (#19776) — le Wi-Fi qui cède
 * à la 4G change l'adresse de l'appareil. La socket de signalisation se croit
 * encore connectée et avale l'offre de reprise ; les paires ICE d'avant sont
 * mortes. Sans ce module, la reprise attendait un ICE `failed` ou un
 * battement manqué (~45 s).
 *
 * Seul un changement de CHEMIN relance : le retour en ligne, ou un type de
 * connexion qui change (`navigator.connection.type`, là où il existe). Le même
 * événement `change` annonce chaque estimation de débit ou de latence ; les
 * suivre recyclerait la socket au moindre creux.
 */

export const NETWORK_RECOVERY_COOLDOWN_MS = 2_000;

type Listening = {
  readonly addEventListener: (event: string, listener: () => void) => void;
  readonly removeEventListener: (event: string, listener: () => void) => void;
};

export type NetworkPathHost = {
  readonly window: Listening | null;
  readonly connection: (Listening & { readonly type?: string | undefined }) | null;
};

const NO_NETWORK = 'none';

const typeOf = (host: NetworkPathHost): string | undefined => host.connection?.type;

export function watchNetworkPath(host: NetworkPathHost, onChange: () => void): () => void {
  let lastType = typeOf(host);
  const onConnection = (): void => {
    const type = typeOf(host);
    const changed = type !== undefined && type !== lastType;
    lastType = type;
    if (changed && type !== NO_NETWORK) onChange();
  };
  host.window?.addEventListener('online', onChange);
  host.connection?.addEventListener('change', onConnection);
  return () => {
    host.window?.removeEventListener('online', onChange);
    host.connection?.removeEventListener('change', onConnection);
  };
}

const isListening = (value: unknown): value is Listening & { readonly type?: string | undefined } =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'addEventListener') === 'function' && typeof Reflect.get(value, 'removeEventListener') === 'function';

function browserNetworkPathHost(): NetworkPathHost {
  const connection: unknown = typeof navigator === 'object' ? Reflect.get(navigator, 'connection') : undefined;
  return { window: typeof window === 'undefined' ? null : window, connection: isListening(connection) ? connection : null };
}

export const watchBrowserNetworkPath = (onChange: () => void): (() => void) => watchNetworkPath(browserNetworkPathHost(), onChange);

export type NetworkRecoveryDeps = {
  readonly now: () => number;
  /** Abandonner la socket de signalisation, peut-être morte, et rouvrir. */
  readonly reconnect: () => void;
  readonly links: () => Iterable<{ readonly restartIce: () => void }>;
};

/** `online` et `change` arrivent souvent ensemble pour un même changement : une seule reprise par fenêtre. */
export function createNetworkRecovery(deps: NetworkRecoveryDeps): () => void {
  let last: number | null = null;
  return () => {
    const now = deps.now();
    if (last !== null && now - last < NETWORK_RECOVERY_COOLDOWN_MS) return;
    last = now;
    deps.reconnect();
    for (const link of deps.links()) link.restartIce();
  };
}

/**
 * **LE PORT D'APPEL** (#6382) — un module SANS dépendance, motif
 * `api/publication-rooms.ts` : la connexion temps réel (`api/realtime.ts`)
 * s'ENREGISTRE, le moteur d'appel (`calls/engine.ts`, chargé à la demande)
 * APPELLE. Importer la connexion depuis le moteur ferait de `socket.io-client`
 * une dépendance statique de l'écran d'appel.
 *
 * **Un appel entrant ne doit pas attendre le moteur.** Le moteur (WebRTC,
 * écrans) n'est chargé qu'au premier appel. Tant qu'aucun abonné n'écoute, un
 * événement `call:*` reçu est MIS EN ATTENTE et `wake` est appelé : c'est ce
 * qui charge le moteur, qui vide la file en s'abonnant. Un `call:initiated`
 * arrivé pendant le chargement du chunk n'est donc jamais perdu.
 */

export type CallTransport = {
  readonly connected: () => boolean;
  readonly emit: (event: string, payload: unknown) => void;
  /** Émission avec accusé ; rejette passé `timeoutMs` ou si le socket ne sait pas accuser. */
  readonly request: (event: string, payload: unknown, timeoutMs: number) => Promise<unknown>;
};

export type CallEventListener = (event: string, payload: unknown) => void;

export type CallTransportBinding = {
  /** À appeler pour chaque événement `call:*` reçu par la connexion. */
  readonly dispatch: (event: string, payload: unknown) => void;
  /** À appeler à chaque (ré)authentification du socket. */
  readonly authenticated: () => void;
  readonly detach: () => void;
};

const PENDING_LIMIT = 32;

let transport: CallTransport | null = null;
let listener: CallEventListener | null = null;
let reauthListener: (() => void) | null = null;
let pending: ReadonlyArray<readonly [string, unknown]> = [];
let wake: (() => void) | null = null;

export function currentCallTransport(): CallTransport | null {
  return transport;
}

/** Posé une fois par la coquille : ce qui charge le moteur quand un appel arrive. */
export function setCallEngineWake(next: (() => void) | null): void {
  wake = next;
}

/**
 * Le moteur s'abonne ; la file d'attente lui est rendue aussitôt, dans
 * l'ordre d'arrivée. Rend la fonction de désabonnement.
 */
export function listenCallEvents(next: CallEventListener, onReauthenticated: () => void): () => void {
  listener = next;
  reauthListener = onReauthenticated;
  const queued = pending;
  pending = [];
  for (const [event, payload] of queued) next(event, payload);
  return () => {
    if (listener === next) listener = null;
    if (reauthListener === onReauthenticated) reauthListener = null;
  };
}

export function bindCallTransport(next: CallTransport): CallTransportBinding {
  transport = next;
  return {
    dispatch: (event, payload) => {
      if (transport !== next) return;
      if (listener !== null) {
        listener(event, payload);
        return;
      }
      pending = [...pending, [event, payload] as const].slice(-PENDING_LIMIT);
      wake?.();
    },
    authenticated: () => {
      if (transport !== next) return;
      reauthListener?.();
    },
    detach: () => {
      if (transport === next) transport = null;
    },
  };
}

/** Réservé aux témoins : rend le module à son état de chargement. */
export function resetCallTransportForTests(): void {
  transport = null;
  listener = null;
  reauthListener = null;
  pending = [];
  wake = null;
}

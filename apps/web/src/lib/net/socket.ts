/**
 * LE TRANSPORT TEMPS RÉEL — la forme d'une connexion socket vers la
 * passerelle, INJECTABLE (#5793), motif `net/transport.ts` (le contrat HTTP)
 * appliqué au canal qui manquait : c'est ce qui permet à `api/socket.ts`
 * (la RÈGLE — connexion, reconnexion, dédoublonnage) d'être témoigné sans
 * jamais construire un vrai `socket.io-client`, exactement comme le port
 * HTTP se témoigne avec un `fetchImpl` de test (`http.test.ts`).
 *
 * `SocketFactory` est le SEUL point de variation entre TROIS producteurs :
 * `net/socket-io-factory.ts` (la passerelle réelle, `socket.io-client`),
 * `api/fixtures-realtime.ts` (le bouchon de fixtures, § 3.5 de la
 * spécification #5793) et tout FAUX socket de témoin (`socket.test.ts`).
 * Aucun des trois ne connaît `api/socket.ts` — seule sa FORME compte.
 */

export type SocketAuth = {
  readonly token: string;
  readonly sessionToken: string;
};

export type SocketHandler<T = unknown> = (payload: T) => void;

/**
 * UN client socket — jamais reconstruit tant qu'une connexion existe ou est
 * en cours (miroir `MessageSocketManager.swift:1962`, § 1.1 de la
 * spécification #5793). `connected` est une PROPRIÉTÉ lue, jamais un
 * événement : `api/socket.ts` s'en sert pour décider si `online` doit
 * relancer `connect()`.
 */
export type SocketClient = {
  readonly connected: boolean;
  connect(): void;
  disconnect(): void;
  on<T = unknown>(event: string, handler: SocketHandler<T>): void;
  off<T = unknown>(event: string, handler: SocketHandler<T>): void;
  emit(event: string, payload?: unknown): void;
};

/**
 * `base` — LA MÊME `apiConfig.base` que le transport HTTP (`api/client.ts`) :
 * une origine ABSOLUE en déploiement/coques, une chaîne VIDE en DEV (résolue
 * par le proxy `vite.config.ts` § `server.proxy['/socket.io']`, jamais par ce
 * module). `auth` voyage dans la poignée de main (§ 1.1/3.1 de la
 * spécification) — un navigateur ne pose aucun en-tête sur un WebSocket.
 */
export type SocketFactory = (params: { readonly base: string; readonly auth: SocketAuth }) => SocketClient;

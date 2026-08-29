'use client';

import { io } from 'socket.io-client';
import { logger } from '@/utils/logger';
import { getWebSocketUrl } from '@/lib/config';
import { isJWTExpired } from '@/utils/auth';
import { authManager } from '../auth-manager.service';
import { SERVER_EVENTS, CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { logConversationIdDebug, getConversationIdType, getConversationApiId } from '@/utils/conversation-id-utils';
import { triggerManualUpdateCheck } from '@/utils/service-worker';
import type { User } from '@/types';
import { authService } from '../auth.service';
import type {
  TypedSocket,
  ConnectionState,
  ConnectionStatus,
  ConnectionDiagnostics
} from './types';

export class ConnectionService {
  private state: ConnectionState = {
    isConnected: false,
    isConnecting: false,
    reconnectAttempts: 0,
    socket: null
  };

  private currentUser: User | null = null;
  private currentConversationId: string | null = null;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isAppUpdating = false;
  private autoJoinCallback: (() => void) | null = null;

  private statusListeners = new Set<(diag: ConnectionDiagnostics) => void>();

  private listenerCallbacks: {
    onAuthenticated?: (user: User) => void;
    onDisconnected?: (reason: string) => void;
    onError?: (error: any) => void;
    onSessionRevoked?: () => void;
  } | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('sw-update-available', () => {
        this.isAppUpdating = true;
        if (this.state.socket) this.state.socket.disconnect();
      });

      // Source unique de vérité réseau : aligner l'état du socket sur la
      // connectivité physique du navigateur. Évite que la bannière
      // "attente de réseau" reste affichée après le retour du réseau.
      window.addEventListener('offline', () => {
        if (this.state.isConnected || this.state.isConnecting) {
          this.state.isConnected = false;
          this.state.isConnecting = false;
          this.emitStatusChange();
        }
      });

      window.addEventListener('online', () => {
        if (this.isAppUpdating) return;
        this.state.reconnectAttempts = 0;
        if (!this.state.isConnected && !this.state.isConnecting) {
          this.connect();
        }
      });

      document.addEventListener('visibilitychange', () => this.handleTabVisible());
    }
  }

  /**
   * Reprise immédiate au retour de l'onglet.
   *
   * Un onglet en arrière-plan voit ses timers étranglés à ~1/minute et son
   * socket coupé par le navigateur. Or les DEUX boucles de reprise reposent sur
   * des timers — celle de socket.io et notre backoff (`reconnect()`) — donc
   * l'onglet redevenu visible peut rester muet une minute entière, voire
   * davantage si le backoff en était déjà à plusieurs secondes. Un lecteur
   * passif (aucun envoi, aucun join, donc aucun `ensureConnection`) ne reçoit
   * pendant ce temps AUCUN événement temps réel : ni message, ni frappe, ni
   * accusé, ni réaction.
   *
   * Le retour à l'écran est le signal exact qu'il manquait : il ne coûte rien
   * quand le lien est vivant (garde ci-dessous) et court-circuite le backoff
   * quand il ne l'est pas.
   *
   * La vérité est le SOCKET, pas le miroir : un onglet gelé peut voir sa
   * connexion coupée sans que `disconnect` atteigne jamais `state.isConnected`,
   * et c'est précisément le cas que ce chemin doit réparer. `connect()` gère
   * ensuite les deux sens de la réconciliation.
   */
  private handleTabVisible(): void {
    if (document.visibilityState !== 'visible') return;
    if (this.isAppUpdating) return;
    if (navigator.onLine === false) return;
    if (this.state.socket?.connected) return;
    if (this.state.isConnecting) return;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    // Le backoff décrit une suite d'échecs ; revenir à l'écran est un signal
    // neuf, pas la n-ième tentative de cette série.
    this.state.reconnectAttempts = 0;
    this.connect();
  }

  onStatusChange(callback: (diag: ConnectionDiagnostics) => void): () => void {
    this.statusListeners.add(callback);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  private emitStatusChange(): void {
    const diag = this.getConnectionDiagnostics();
    for (const cb of this.statusListeners) {
      try {
        cb(diag);
      } catch (err) {
        logger.warn('[Socket] status listener error', err as any);
      }
    }
  }

  /**
   * Credentials for the NEXT handshake, read at the moment it happens.
   *
   * Socket.IO replays the `auth` option on every reconnection attempt. Passed
   * as a literal, the socket stayed pinned for life to the token it was built
   * with: a silent REST refresh, an anonymous session rotation, or a gateway
   * restart after the token had already turned over left every retry
   * presenting credentials the gateway rejects — the built-in loop burned its
   * attempts, `reconnect_failed` handed off to our backoff, and that one
   * re-presented the same dead token. An auth-locked tab, on a session whose
   * valid credentials were sitting in storage the whole time.
   *
   * As a callback, each handshake asks again. Nothing has to remember to push
   * a new token in — and nothing may pin one back onto `socket.auth`, which
   * would replace this resolver and restore the old failure.
   *
   * Le NOM du champ fait partie du justificatif. La passerelle lit deux clés
   * distinctes (`socketio/utils/socket-helpers.ts`) : `auth.token` part au
   * vérificateur JWT, `auth.sessionToken` est résolu en participant anonyme par
   * l'empreinte du jeton. Un jeton `anon_…` annoncé sous `token` échouait donc
   * en `jwt malformed` — la passerelle émettait « Authentication failed » et
   * coupait la socket, laissant tout participant anonyme sans temps réel.
   */
  /**
   * Ce que le handshake transmet — et, depuis #4213, le jeton de SESSION d'un
   * utilisateur inscrit en plus de son JWT.
   *
   * Un socket inscrit s'authentifiait au JWT SEUL. `UserSession.sessionToken`
   * stocke le hash d'un jeton opaque que rien n'obligeait à transmettre ici :
   * il n'existait donc AUCUN moyen, côté serveur, de dire quel socket
   * appartient à quelle session. Révoquer une session passait la ligne à
   * `isValid: false` et l'appareil continuait de tout recevoir — `message:new`,
   * `conversation:updated` — indéfiniment, un socket n'étant authentifié qu'une
   * fois, au connect, et jamais revérifié.
   *
   * Les deux clés voyagent ENSEMBLE pour un inscrit : le serveur branche sur la
   * présence du JWT (`token`), et ne lit `sessionToken` que pour étiqueter le
   * socket. Un anonyme n'envoie que `sessionToken`, qui est alors son identité.
   */
  private resolveHandshakeCredentials(): Record<string, string> {
    const token = authManager.getAuthToken();
    if (token) {
      const sessionToken = authManager.getSessionToken();
      return sessionToken ? { token, sessionToken } : { token };
    }

    const sessionToken = authManager.getAnonymousSession()?.token;
    return sessionToken ? { sessionToken } : {};
  }

  initializeConnection(): TypedSocket | null {
    if (this.state.socket) return this.state.socket;
    const token = authManager.getAuthToken();
    const anonymousSession = authManager.getAnonymousSession();
    const sessionToken = anonymousSession?.token;
    if (!token && !sessionToken) return null;

    if (token && isJWTExpired(token)) {
      // Skip this connect attempt and let the REST API 401 path trigger a
      // silent refresh. The session stays in place — only explicit logout
      // can clear credentials.
      logger.warn('[Socket]', 'JWT expired, skipping connection — will reconnect after refresh');
      return null;
    }

    const socketUrl = getWebSocketUrl();
    const socket = io(socketUrl, {
      auth: (cb: (data: Record<string, unknown>) => void) => cb(this.resolveHandshakeCredentials()),
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: 20000
    }) as unknown as TypedSocket;

    this.state.socket = socket;
    return socket;
  }

  /**
   * Ouvre la connexion — ou réaligne le miroir quand le socket est déjà vivant.
   *
   * Le handler `offline` marque la connexion perdue SANS toucher au socket,
   * délibérément : la bannière doit réagir à la seconde où le réseau tombe. Mais
   * une coupure plus courte que le cycle ping/pong de Socket.IO ne fait jamais
   * tomber le socket — bascule Wi-Fi/cellulaire, VPN, réveil de veille, tunnel.
   * Au retour du réseau, `socket.connected` vaut donc encore `true`.
   *
   * Sans la branche ci-dessous, le miroir n'avait alors AUCUN chemin de retour :
   * la garde `!socket.connected` faisait sortir `connect()` en silence, donc
   * aucun `connect` n'était réémis, et `state.isConnected` restait `false`
   * jusqu'à la prochaine vraie déconnexion. Tout ce qui lit `isReady`
   * (`useConnectionStatus`) restait dégradé sur un lien pourtant intact : la
   * bannière de reconnexion figée, et surtout le rejeu de la file d'échecs
   * (`useAutoRetryFailedMessages`, dont le déclencheur EST `isReady`) désarmé
   * pour le reste de la session — les messages en attente n'étaient plus jamais
   * réessayés.
   *
   * Le socket est la vérité ; le miroir se réaligne dessus. La réconciliation
   * vit ici plutôt que dans le handler `online` parce que `connect()` est le
   * point de passage de TOUS les appelants (handler `online`, orchestrateur,
   * `ensureConnection`) : un seul d'entre eux réparant l'état laisserait les
   * autres sur la même impasse. Aucun rejoin de room n'est nécessaire — le
   * socket n'a jamais quitté les siennes.
   */
  connect(): void {
    if (this.isAppUpdating) return;
    const socket = this.state.socket || this.initializeConnection();
    if (!socket) return;

    if (socket.connected) {
      if (this.state.isConnected && !this.state.isConnecting) return;
      this.state.isConnected = true;
      this.state.isConnecting = false;
      this.emitStatusChange();
      return;
    }

    if (!this.state.isConnecting) {
      this.state.isConnecting = true;
      socket.connect();
      this.emitStatusChange();
    }
  }

  disconnect(): void {
    if (this.state.socket) {
      this.state.socket.disconnect();
      this.state.isConnected = false;
      this.state.isConnecting = false;
      this.emitStatusChange();
    }
  }

  reconnect(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.disconnect();
    const attempt = this.state.reconnectAttempts;
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000) + Math.random() * 1000;
    this.reconnectTimeout = setTimeout(() => {
      this.state.reconnectAttempts = Math.min(attempt + 1, 10);
      this.connect();
    }, delay);
  }

  disconnectForUpdate(): void {
    this.isAppUpdating = true;
    this.disconnect();
  }

  setAutoJoinCallback(callback: () => void): void {
    this.autoJoinCallback = callback;
  }

  setupConnectionListeners(onAuthenticated?: (user: User) => void, onDisconnected?: (reason: string) => void, onError?: (error: any) => void, onSessionRevoked?: () => void): void {
    const socket = this.state.socket;
    if (!socket) return;

    this.listenerCallbacks = { onAuthenticated, onDisconnected, onError, onSessionRevoked };

    socket.on('connect', () => {
      this.state.isConnected = true;
      this.state.isConnecting = false;
      this.state.reconnectAttempts = 0;
      if (this.autoJoinCallback) this.autoJoinCallback();
      this.emitStatusChange();
    });

    socket.on('disconnect', (reason) => {
      this.state.isConnected = false;
      this.state.isConnecting = false;
      if (onDisconnected) onDisconnected(reason);
      this.emitStatusChange();
    });

    socket.on('connect_error', (error) => {
      this.state.isConnecting = false;
      if (onError) onError(error);
      this.handleConnectionError(error);
      this.emitStatusChange();
    });

    socket.on('reconnect_failed', () => {
      this.state.isConnecting = false;
      logger.warn('[Socket]', `reconnection failed after ${this.maxReconnectAttempts} attempts`);
      if (onError) onError(new Error('reconnect_failed'));
      this.emitStatusChange();
      // socket.io's built-in reconnection loop gives up permanently after
      // `maxReconnectAttempts` — without this, a tab that's open but idle
      // (no outbound joinConversation/sendMessage to trigger ensureConnection)
      // stops receiving ALL realtime events (messages, typing, receipts,
      // reactions) silently until the user takes an action or refreshes.
      // Hand off to our own manual backoff loop so passive readers recover.
      this.reconnect();
    });

    socket.on(SERVER_EVENTS.AUTHENTICATED, (data: any) => {
      this.currentUser = data.user;
      if (onAuthenticated) onAuthenticated(data.user);
    });

    socket.on(SERVER_EVENTS.ERROR, (error: any) => {
      this.handleConnectionError(error);
    });

    socket.on(SERVER_EVENTS.AUTH_TOKEN_EXPIRED, () => {
      logger.info('[Socket]', 'auth token expired — refreshing and reconnecting');
      // No token is pushed onto the socket here: `resolveHandshakeCredentials()`
      // reads storage at the handshake, so the reconnect below already carries
      // whatever the refresh just stored. Assigning `socket.auth` would swap
      // the resolver out for a literal and re-pin the socket.
      authService.refreshToken().then(() => {
        this.reconnect();
      }).catch((err) => {
        logger.warn('[Socket]', 'token refresh failed after auth:token-expired', { err });
      });
    });

    socket.on(SERVER_EVENTS.AUTH_SESSION_REVOKED as any, () => {
      logger.warn('[Socket]', 'auth session revoked — forcing logout');
      if (this.listenerCallbacks?.onSessionRevoked) this.listenerCallbacks.onSessionRevoked();
    });
  }

  private handleConnectionError(error: any): void {
    // Log only — NEVER clear the session from a socket error. Loose string
    // matching on error payloads previously produced false positives that
    // kicked users out on transient failures. Socket.IO's own reconnect loop
    // takes over; the REST 401 path handles silent token refresh (and even
    // there, the session is preserved on failure). The user stays signed in
    // until they explicitly press "Logout".
    const errorMessage = error?.message || error?.error || 'Connection error';
    logger.warn('[Socket] connection error', { errorMessage });
  }

  joinConversation(conversationOrId: any): void {
    const socket = this.getSocket();
    if (!socket || !socket.connected) return;

    const conversationId = typeof conversationOrId === 'string' ? conversationOrId : getConversationApiId(conversationOrId);
    socket.emit(CLIENT_EVENTS.CONVERSATION_JOIN, { conversationId });
  }

  leaveConversation(conversationOrId: any): void {
    const socket = this.getSocket();
    if (!socket || !socket.connected) return;

    const conversationId = typeof conversationOrId === 'string' ? conversationOrId : getConversationApiId(conversationOrId);
    socket.emit(CLIENT_EVENTS.CONVERSATION_LEAVE, { conversationId });
  }

  updateCurrentConversationId(conversationId: string | null): void {
    this.currentConversationId = conversationId;
  }

  getCurrentConversationId(): string | null {
    return this.currentConversationId;
  }

  getConnectionStatus(): ConnectionStatus {
    if (this.state.isConnected) return 'connected';
    if (this.state.isConnecting) return 'connecting';
    return 'disconnected';
  }

  getConnectionDiagnostics(): ConnectionDiagnostics {
    return {
      status: this.getConnectionStatus(),
      isConnected: this.state.isConnected,
      hasSocket: !!this.state.socket,
      reconnectAttempts: this.state.reconnectAttempts,
      transport: this.state.socket?.io?.engine?.transport?.name || 'unknown',
      socketId: this.state.socket?.id || null
    };
  }

  getSocket(): TypedSocket | null { return this.state.socket; }

  setCurrentUser(user: User): void {
    this.currentUser = user;
  }

  cleanup(): void {
    this.disconnect();
    this.state.socket = null;
    this.currentUser = null;
  }
}

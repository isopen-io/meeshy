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
    }
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
      auth: { token: token || sessionToken },
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

  connect(): void {
    if (this.isAppUpdating) return;
    const socket = this.state.socket || this.initializeConnection();
    if (socket && !socket.connected && !this.state.isConnecting) {
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

    socket.on(SERVER_EVENTS.AUTHENTICATED, (data: any) => {
      this.currentUser = data.user;
      if (onAuthenticated) onAuthenticated(data.user);
    });

    socket.on(SERVER_EVENTS.ERROR, (error: any) => {
      this.handleConnectionError(error);
    });

    socket.on(SERVER_EVENTS.AUTH_TOKEN_EXPIRED, () => {
      logger.info('[Socket]', 'auth token expired — refreshing and reconnecting');
      authService.refreshToken().then(() => {
        const newToken = authManager.getAuthToken();
        if (newToken && this.state.socket) {
          (this.state.socket as any).auth = { token: newToken };
        }
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

/**
 * Connection Service
 * Handles Socket.IO connection management
 * - Connection/reconnection logic
 * - Authentication
 * - Conversation join/leave
 * - Connection state management
 */

'use client';

import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { logger } from '@/utils/logger';
import { getWebSocketUrl } from '@/lib/config';
import { authManager } from '../auth-manager.service';
import { SERVER_EVENTS, CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { logConversationIdDebug, getConversationIdType, getConversationApiId } from '@/utils/conversation-id-utils';
import type { User } from '@/types';
import type {
  TypedSocket,
  ConnectionState,
  ConnectionStatus,
  ConnectionDiagnostics
} from './types';

// Import translations
import enTranslations from '@/locales/en';
import frTranslations from '@/locales/fr';
import ptTranslations from '@/locales/pt';
import esTranslations from '@/locales/es';

/**
 * ConnectionService
 * Single Responsibility: Manage Socket.IO connection lifecycle
 */
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

  // Callback for auto-join after connection
  private autoJoinCallback: (() => void) | null = null;

  /**
   * Get translation helper
   */
  private t(key: string): string {
    try {
      const userLang = typeof window !== 'undefined'
        ? (localStorage.getItem('meeshy-i18n-language') || 'en')
        : 'en';

      const allTranslations =
        userLang === 'fr' ? frTranslations :
        userLang === 'pt' ? ptTranslations :
        userLang === 'es' ? esTranslations :
        enTranslations;

      const keys = key.split('.');
      let value: any = allTranslations;

      for (const k of keys) {
        value = value?.[k];
      }

      // Try double namespace nesting if not found
      if (!value && keys.length >= 2) {
        const namespace = keys[0];
        value = (allTranslations as any)?.[namespace]?.[namespace];
        for (let i = 1; i < keys.length; i++) {
          value = value?.[keys[i]];
        }
      }

      return value || key;
    } catch (error) {
      console.error('[ConnectionService] Translation error:', error);
      return key;
    }
  }

  /**
   * Initialize connection
   */
  initializeConnection(): void {
    // Server-side check
    if (typeof window === 'undefined') {
      logger.warn('[ConnectionService]', 'Server-side execution, skipping connection');
      return;
    }

    // Public page check
    const currentPath = window.location.pathname;
    const publicPaths = ['/about', '/contact', '/privacy', '/terms', '/partners'];
    if (publicPaths.includes(currentPath)) {
      logger.debug('[ConnectionService]', 'Public page detected, skipping connection', { path: currentPath });
      return;
    }

    // Prevent multiple connections
    if (this.state.isConnecting || (this.state.socket && (this.state.isConnected || this.state.socket.connected))) {
      return;
    }

    // Check authentication
    const hasAuthToken = !!authManager.getAuthToken();
    const hasSessionToken = !!authManager.getAnonymousSession()?.token;

    if (!hasAuthToken && !hasSessionToken) {
      this.state.isConnecting = false;
      return;
    }

    // Clean up existing socket if needed
    if (this.state.socket) {
      const socketState = {
        connected: this.state.socket.connected,
        disconnected: this.state.socket.disconnected,
        connecting: !this.state.socket.connected && !this.state.socket.disconnected
      };

      if (socketState.connected || socketState.disconnected) {
        try {
          this.state.socket.removeAllListeners();
          if (socketState.connected) {
            this.state.socket.disconnect();
          }
          this.state.socket = null;
        } catch (e) {
          console.warn('[ConnectionService] Cleanup error:', e);
        }
      } else {
        return; // Reuse connecting socket
      }
    }

    this.state.isConnecting = true;

    // Get authentication tokens
    const authToken = authManager.getAuthToken();
    const sessionToken = authManager.getAnonymousSession()?.token;

    if (!authToken && !sessionToken) {
      this.state.isConnecting = false;
      return;
    }

    const serverUrl = getWebSocketUrl();

    // Prepare auth headers
    const extraHeaders: Record<string, string> = {};
    if (authToken) {
      extraHeaders['Authorization'] = `Bearer ${authToken}`;
    }
    if (sessionToken) {
      extraHeaders['x-session-token'] = sessionToken;
    }

    try {
      // Prepare auth data
      const authData: any = {};
      if (authToken) {
        authData.authToken = authToken;
        authData.tokenType = 'jwt';
      }
      if (sessionToken) {
        authData.sessionToken = sessionToken;
        authData.sessionType = 'anonymous';
      }

      // Create socket with autoConnect: false
      this.state.socket = io(serverUrl, {
        auth: authData,
        extraHeaders,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        timeout: 10000,
        path: '/socket.io/',
        forceNew: false,
        autoConnect: false
      }) as TypedSocket;

      this.state.isConnecting = false;

    } catch (error) {
      console.error('[ConnectionService] Socket creation error:', error);
      this.state.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Setup connection event listeners
   * Must be called BEFORE connecting
   */
  setupConnectionListeners(
    onAuthenticated: () => void,
    onDisconnected: (reason: string) => void,
    onError: (error: Error) => void
  ): void {
    if (!this.state.socket) return;

    // Connect event
    this.state.socket.on('connect', () => {
      this.state.isConnecting = false;
      this.state.reconnectAttempts = 0;

      // Safety timeout if AUTHENTICATED doesn't arrive
      setTimeout(() => {
        if (!this.state.isConnected && this.state.socket?.connected) {
          this.state.socket?.disconnect();
        }
      }, 5000);
    });

    // Authenticated event
    this.state.socket.on(SERVER_EVENTS.AUTHENTICATED, (response: any) => {
      if (response?.success) {
        this.state.isConnected = true;
        onAuthenticated();

        // Auto-join conversation if callback provided
        if (this.autoJoinCallback) {
          this.autoJoinCallback();
        }
      } else {
        this.state.isConnected = false;
        const errorMessage = response?.error || 'Unknown error';
        this.handleAuthenticationFailure(errorMessage);
      }
    });

    // Disconnect event
    this.state.socket.on('disconnect', (reason) => {
      this.state.isConnected = false;
      this.state.isConnecting = false;

      const shouldReconnect = reason !== 'io client disconnect';
      const wasNeverConnected = this.state.reconnectAttempts === 0 && reason === 'io server disconnect';

      if (wasNeverConnected) {
        return; // Don't reconnect if first connection failed
      }

      onDisconnected(reason);

      if (reason === 'io server disconnect') {
        if (shouldReconnect) {
          setTimeout(() => {
            if (!this.state.isConnected && !this.state.isConnecting) {
              this.reconnect();
            }
          }, 2000);
        }
      } else if (reason === 'transport close' || reason === 'transport error') {
        if (shouldReconnect) {
          setTimeout(() => {
            if (!this.state.isConnected && !this.state.isConnecting) {
              this.reconnect();
            }
          }, 3000);
        }
      } else if (shouldReconnect) {
        setTimeout(() => {
          if (!this.state.isConnected && !this.state.isConnecting) {
            this.reconnect();
          }
        }, 2000);
      }
    });

    // Connect error
    this.state.socket.on('connect_error', (error) => {
      console.error('[ConnectionService] Connect error:', error);
      this.state.isConnected = false;
      this.state.isConnecting = false;
      onError(error);
      this.scheduleReconnect();
    });

    // Error event
    this.state.socket.on(SERVER_EVENTS.ERROR, (error) => {
      console.error('[ConnectionService] Server error:', error);
      const errorMessage = error.message || 'Server error';
      this.handleAuthenticationFailure(errorMessage);
    });
  }

  /**
   * Connect the socket
   * Must be called AFTER setupConnectionListeners
   */
  connect(): void {
    if (this.state.socket && !this.state.socket.connected) {
      this.state.socket.connect();
    }
  }

  /**
   * Disconnect the socket
   */
  disconnect(): void {
    if (this.state.socket) {
      this.state.socket.disconnect();
      this.state.isConnected = false;
      this.state.isConnecting = false;
    }
  }

  /**
   * Reconnect the socket
   */
  reconnect(): void {
    if (this.state.isConnecting) {
      return;
    }

    const actuallyConnected = this.state.socket?.connected === true && this.state.isConnected;
    if (this.state.socket && actuallyConnected) {
      return; // Already connected
    }

    // Clean up if disconnected
    if (this.state.socket) {
      const socketState = {
        connected: this.state.socket.connected,
        disconnected: this.state.socket.disconnected,
        connecting: !this.state.socket.connected && !this.state.socket.disconnected
      };

      if (socketState.disconnected) {
        try {
          this.state.socket.removeAllListeners();
          this.state.socket.disconnect();
          this.state.socket = null;
        } catch (e) {
          // Ignore
        }
      } else if (socketState.connecting) {
        return; // Don't interrupt ongoing connection
      } else if (socketState.connected) {
        try {
          this.state.socket.removeAllListeners();
          this.state.socket.disconnect();
          this.state.socket = null;
        } catch (e) {
          // Ignore
        }
      }
    }

    this.state.isConnected = false;
    this.state.isConnecting = false;
    this.state.reconnectAttempts = 0;

    const hasAuthToken = typeof window !== 'undefined' && !!authManager.getAuthToken();
    const hasSessionToken = typeof window !== 'undefined' && !!authManager.getAnonymousSession()?.token;

    if (this.currentUser || hasAuthToken || hasSessionToken) {
      this.initializeConnection();
    } else {
      toast.warning('Please reconnect to use real-time chat');
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.state.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = Math.pow(2, this.state.reconnectAttempts) * 1000;
    this.state.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      if (!this.state.isConnected) {
        this.initializeConnection();
      }
    }, delay);
  }

  /**
   * Handle authentication failure
   */
  private async handleAuthenticationFailure(errorMessage: string): Promise<void> {
    const isAuthRequiredError = errorMessage.includes('Authentification requise') ||
                                errorMessage.includes('Bearer token') ||
                                errorMessage.includes('x-session-token');

    if (!isAuthRequiredError) {
      toast.error(errorMessage);
      return;
    }

    // Try reconnection
    const hasAuthToken = !!authManager.getAuthToken();
    const hasSessionToken = !!authManager.getAnonymousSession()?.token;

    if (hasAuthToken || hasSessionToken) {
      try {
        if (this.state.socket) {
          this.state.socket.disconnect();
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        this.initializeConnection();

        for (let i = 0; i < 6; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          if (this.state.isConnected) {
            return; // Success
          }
        }
      } catch (error) {
        // Silence error
      }
    }

    // Logout and redirect
    await authManager.logout();

    const message = this.t('websocket.sessionExpired') || 'Your session has expired, please reconnect';
    toast.error(message);

    await new Promise(resolve => setTimeout(resolve, 1000));

    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }

  /**
   * Join conversation
   */
  joinConversation(conversationOrId: any): void {
    if (!this.state.socket || !this.state.socket.connected) {
      // Memorize for auto-join after connection
      try {
        let conversationId: string;
        if (typeof conversationOrId === 'string') {
          conversationId = conversationOrId;
        } else {
          conversationId = getConversationApiId(conversationOrId);
        }
        this.currentConversationId = conversationId;
      } catch (error) {
        // Ignore
      }
      return;
    }

    try {
      let conversationId: string;

      if (typeof conversationOrId === 'string') {
        const idType = getConversationIdType(conversationOrId);
        if (idType === 'objectId' || idType === 'identifier') {
          conversationId = conversationOrId;
        } else {
          throw new Error(`Invalid conversation identifier: ${conversationOrId}`);
        }
      } else {
        conversationId = getConversationApiId(conversationOrId);
      }

      this.currentConversationId = conversationId;
      this.state.socket.emit(CLIENT_EVENTS.CONVERSATION_JOIN, { conversationId });
    } catch (error) {
      console.error('[ConnectionService] Error joining conversation:', error);
    }
  }

  /**
   * Leave conversation
   */
  leaveConversation(conversationOrId: any): void {
    if (!this.state.socket) {
      return;
    }

    try {
      let conversationId: string;

      if (typeof conversationOrId === 'string') {
        const idType = getConversationIdType(conversationOrId);
        if (idType === 'objectId' || idType === 'identifier') {
          conversationId = conversationOrId;
        } else {
          throw new Error(`Invalid conversation identifier: ${conversationOrId}`);
        }
      } else {
        conversationId = getConversationApiId(conversationOrId);
      }

      if (this.currentConversationId === conversationId) {
        this.currentConversationId = null;
      }

      this.state.socket.emit(CLIENT_EVENTS.CONVERSATION_LEAVE, { conversationId });
    } catch (error) {
      console.error('[ConnectionService] Error leaving conversation:', error);
    }
  }

  /**
   * Set current user
   */
  setCurrentUser(user: User): void {
    const userChanged = this.currentUser && this.currentUser.id !== user.id;

    if (userChanged) {
      logger.debug('[ConnectionService]', 'User changed, forcing reconnection', {
        oldUser: this.currentUser?.username,
        newUser: user.username
      });
      this.cleanup();
    }

    this.currentUser = user;
  }

  /**
   * Set auto-join callback
   */
  setAutoJoinCallback(callback: () => void): void {
    this.autoJoinCallback = callback;
  }

  /**
   * Update current conversation ID (called after CONVERSATION_JOINED)
   */
  updateCurrentConversationId(conversationId: string): void {
    this.currentConversationId = conversationId;
  }

  /**
   * Get current conversation ID
   */
  getCurrentConversationId(): string | null {
    return this.currentConversationId;
  }

  /**
   * Get socket instance
   */
  getSocket(): TypedSocket | null {
    return this.state.socket;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): ConnectionStatus {
    const socketConnected = this.state.socket?.connected === true;
    const actuallyConnected = this.state.isConnected && socketConnected;

    // Sync if desynchronized
    if (this.state.isConnected !== socketConnected) {
      this.state.isConnected = socketConnected;
    }

    return {
      isConnected: actuallyConnected,
      hasSocket: !!this.state.socket,
      currentUser: this.currentUser?.username || 'Not defined'
    };
  }

  /**
   * Get connection diagnostics
   */
  getConnectionDiagnostics(): Omit<ConnectionDiagnostics, 'listenersCount'> {
    const token = typeof window !== 'undefined' ? authManager.getAuthToken() : null;
    const url = typeof window !== 'undefined' ? getWebSocketUrl() : 'N/A (server-side)';

    return {
      isConnected: this.state.isConnected,
      hasSocket: !!this.state.socket,
      hasToken: !!token,
      url: url,
      socketId: this.state.socket?.id,
      transport: this.state.socket?.io.engine?.transport.name,
      reconnectAttempts: this.state.reconnectAttempts,
      currentUser: this.currentUser?.username
    };
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.state.socket) {
      this.state.socket.disconnect();
      this.state.socket = null;
    }

    this.state.isConnected = false;
    this.currentUser = null;
    this.currentConversationId = null;
  }
}

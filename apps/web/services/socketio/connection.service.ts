'use client';

import { isPublicRoute } from '@/utils/route-utils';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { logger } from '@/utils/logger';
import { getWebSocketUrl } from '@/lib/config';
import { authManager } from '../auth-manager.service';
import { SERVER_EVENTS, CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { logConversationIdDebug, getConversationIdType, getConversationApiId } from '@/utils/conversation-id-utils';
import { triggerManualUpdateCheck } from '@/utils/service-worker';
import type { User } from '@/types';
import type {
  TypedSocket,
  ConnectionState,
} from './types';

import enTranslations from '@/locales/en';
import frTranslations from '@/locales/fr';
import ptTranslations from '@/locales/pt';
import esTranslations from '@/locales/es';

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

  private listenerCallbacks: {
    onAuthenticated?: (user: User) => void;
    onDisconnected?: (reason: string) => void;
    onError?: (error: any) => void;
  } | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('sw-update-available', () => {
        this.isAppUpdating = true;
        if (this.state.socket) this.state.socket.disconnect();
      });
    }
  }

  private t(key: string): string {
    const lang = typeof window !== 'undefined' ? localStorage.getItem('meeshy-language') || 'fr' : 'fr';
    const bundle: any = lang === 'en' ? enTranslations : lang === 'pt' ? ptTranslations : lang === 'es' ? esTranslations : frTranslations;
    const keys = key.split('.');
    let value = bundle;
    for (const k of keys) {
      value = value?.[k];
    }
    return value || key;
  }

  initializeConnection(): TypedSocket | null {
    if (this.state.socket) return this.state.socket;
    const token = authManager.getAuthToken();
    const anonymousSession = authManager.getAnonymousSession();
    const sessionToken = anonymousSession?.token;
    if (!token && !sessionToken) return null;

    const socketUrl = getWebSocketUrl();
    const socket = io(socketUrl, {
      auth: { token: token || sessionToken },
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
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
    }
  }

  disconnect(): void {
    if (this.state.socket) {
      this.state.socket.disconnect();
      this.state.isConnected = false;
      this.state.isConnecting = false;
    }
  }

  setupConnectionListeners(onAuthenticated?: (user: User) => void, onDisconnected?: (reason: string) => void, onError?: (error: any) => void): void {
    const socket = this.state.socket;
    if (!socket) return;

    this.listenerCallbacks = { onAuthenticated, onDisconnected, onError };

    socket.on('connect', () => {
      this.state.isConnected = true;
      this.state.isConnecting = false;
      this.state.reconnectAttempts = 0;
    });

    socket.on('disconnect', (reason) => {
      this.state.isConnected = false;
      this.state.isConnecting = false;
      if (onDisconnected) onDisconnected(reason);
    });

    socket.on('connect_error', (error) => {
      this.state.isConnecting = false;
      if (onError) onError(error);
      this.handleConnectionError(error);
    });

    socket.on(SERVER_EVENTS.AUTHENTICATED, (data: any) => {
      this.currentUser = data.user;
      if (onAuthenticated) onAuthenticated(data.user);
    });

    socket.on(SERVER_EVENTS.ERROR, (error: any) => {
      this.handleConnectionError(error);
    });
  }

  private handleConnectionError(error: any): void {
    const errorMessage = error?.message || error?.error || 'Connection error';
    if (errorMessage.includes('auth') || errorMessage.includes('token') || errorMessage.includes('session')) {
      this.handleAuthenticationFailure(errorMessage);
    }
  }

  private async handleAuthenticationFailure(errorMessage: string): Promise<void> {
    if (this.isAppUpdating) return;
    const isAuthRequiredError = errorMessage.includes('Authentification requise') || errorMessage.includes('token');
    if (!isAuthRequiredError) return;

    authManager.clearAllSessions();
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      if (pathname !== '/login' && !isPublicRoute(pathname)) {
        window.location.href = '/login';
      }
    }
  }

  getSocket(): TypedSocket | null { return this.state.socket; }
  cleanup(): void {
    this.disconnect();
    this.state.socket = null;
    this.currentUser = null;
  }
}

export const meeshySocketIOService = new ConnectionService();

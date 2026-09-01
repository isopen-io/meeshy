/**
 * La plomberie du socket : enveloppe de réponse, contrats de socket et
 * diagnostics de connexion, plus les alias de rétrocompatibilité.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

import type { SocketIOUser } from './user.js';

export interface SocketIOResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  /** Machine-readable error code (e.g. ErrorCode.USER_BLOCKED) when success === false. */
  readonly code?: string;
}

// ===== TYPES POUR LES CONNEXIONS =====

export interface ConnectionStatus {
  readonly isConnected: boolean;
  readonly hasSocket: boolean;
  readonly currentUser: string;
  readonly connectedAt?: Date;
  readonly lastReconnectAttempt?: Date;
  readonly reconnectAttempts?: number;
}

export interface ConnectionDiagnostics {
  readonly connectionStatus: ConnectionStatus;
  readonly socketId?: string;
  readonly transport?: string;
  readonly connectedSockets?: number;
  readonly serverStatus?: 'online' | 'offline' | 'unknown';
}

// ===== TYPES POUR L'AUTHENTIFICATION =====

/**
 * Listener générique pour les événements Socket.IO
 */
export type SocketEventListener = (...args: readonly unknown[]) => void;

/**
 * Base Socket interface pour éviter l'import de socket.io dans shared
 */
export interface BaseSocket {
  readonly id: string;
  emit: (event: string, ...args: readonly unknown[]) => boolean;
  on: (event: string, listener: SocketEventListener) => void;
  join: (room: string) => void;
  leave: (room: string) => void;
}

/**
 * Socket authentifié avec métadonnées utilisateur
 */
export interface AuthenticatedSocket extends BaseSocket {
  readonly userId: string;
  readonly username: string;
  readonly userData: SocketIOUser;
  readonly connectedAt: Date;
  readonly currentConversations: readonly string[];
}

// ===== EXPORTS POUR RÉTROCOMPATIBILITÉ =====

// Aliases pour faciliter la migration
// ❌ SUPPRIMÉ : export type Message = SocketIOMessage; // Conflit avec conversation.ts
export type User = SocketIOUser;
export type Response<T = unknown> = SocketIOResponse<T>;

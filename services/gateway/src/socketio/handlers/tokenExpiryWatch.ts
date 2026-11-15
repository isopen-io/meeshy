import type { MeeshySocket as Socket } from '../typed-socket';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { guardedTimeout } from '../../utils/guarded-timer.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'AuthHandler' });

// Node's `setTimeout` truncates any delay above ~24.8 days (a 32-bit signed
// int of ms) and fires IMMEDIATELY instead of throwing — a `rememberDevice`
// JWT (365 days, `session-jwt.ts`) would otherwise disconnect a fresh login
// right away. Capped below that ceiling and re-armed against the real `exp`
// on every fire, so a long-lived token is re-checked periodically rather
// than scheduled once for a delay it cannot express.
export const MAX_EXPIRY_TIMER_MS = 20 * 24 * 60 * 60 * 1000;

/**
 * #3625 — un socket ne revérifie jamais son JWT après le handshake : un
 * compte dont le token reste valide 24h (ou 365 jours, `rememberDevice`)
 * gardait un accès temps réel jusqu'à la prochaine reconnexion, bien après
 * l'expiration réelle du jeton. Arme un minuteur sur `exp` qui émet
 * `auth:token-expired` et coupe le socket — le même signal que
 * `jwt.TokenExpiredError` au connect, pour un jeton qui expire pendant que le
 * socket est ouvert plutôt qu'avant.
 *
 * Le minuteur se désarme lui-même sur `disconnect` : un socket qui part
 * avant l'échéance ne doit pas laisser un timer actif derrière lui.
 */
export function scheduleTokenExpiry(socket: Socket, exp: number | undefined): void {
  if (typeof exp !== 'number') return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  socket.on('disconnect', () => {
    disposed = true;
    if (timer) clearTimeout(timer);
  });

  const arm = () => {
    if (disposed) return;
    const msRemaining = exp * 1000 - Date.now();
    if (msRemaining <= 0) {
      logger.info('socket JWT expired while connected — disconnecting', { socketId: socket.id });
      socket.emit(SERVER_EVENTS.AUTH_TOKEN_EXPIRED, { code: 'token_expired', message: 'JWT token has expired' });
      socket.disconnect(true);
      return;
    }
    timer = guardedTimeout({ name: 'socket-token-expiry', afterMs: Math.min(msRemaining, MAX_EXPIRY_TIMER_MS), logger, run: arm });
  };

  arm();
}

import type { z } from 'zod';
import type { CallControlAck, CallControlErrorCode } from '@meeshy/shared/types/call-controls';
import type { MeeshySocket } from './typed-socket';
import type { RateLimitConfig, SocketRateLimiter } from '../utils/socket-rate-limiter';
import { logger } from '../utils/logger';

/**
 * LA PORTE COMMUNE des contrôles d'un appel en cours — inviter (#8433), couper
 * un micro (#8438), réagir (#8439).
 *
 * Dans cet ordre, et pour les trois : authentifié, puis débit, puis forme
 * (Zod). Rien de ce qui échoue à une étape n'atteint la suivante, et l'accusé
 * dit laquelle : une entrée refusée ne produit aucune diffusion. Ce que chaque
 * verbe décide ensuite (qui a le droit, sur quel état de l'appel) est à lui.
 */

export type CallControlAckCallback = (response: CallControlAck) => void;

export const refused = (code: CallControlErrorCode): CallControlAck => ({ success: false, code });

export const ACCEPTED: CallControlAck = { success: true };

export type CallControlGate<S extends z.ZodTypeAny> = {
  readonly socket: MeeshySocket;
  readonly getUserId: (socketId: string) => string | undefined;
  readonly rateLimiter: Pick<SocketRateLimiter, 'checkLimit'>;
  readonly limit: RateLimitConfig;
  readonly schema: S;
  readonly label: string;
  readonly run: (userId: string, input: z.infer<S>) => Promise<CallControlAck>;
};

export function gatedCallControl<S extends z.ZodTypeAny>(gate: CallControlGate<S>) {
  return async (raw: unknown, ack?: CallControlAckCallback): Promise<void> => {
    const reply = (response: CallControlAck): void => {
      if (typeof ack === 'function') ack(response);
    };
    try {
      const userId = gate.getUserId(gate.socket.id);
      if (!userId) return reply(refused('NOT_AUTHENTICATED'));
      if (!(await gate.rateLimiter.checkLimit(userId, gate.limit))) return reply(refused('RATE_LIMITED'));
      const parsed = gate.schema.safeParse(raw);
      if (!parsed.success) return reply(refused('VALIDATION_ERROR'));
      reply(await gate.run(userId, parsed.data));
    } catch (error) {
      logger.error(`${gate.label}: handler failed`, { error });
      reply(refused('INTERNAL_ERROR'));
    }
  };
}

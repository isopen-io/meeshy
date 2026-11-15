/**
 * #13102 — le démarrage de l'oubli au translator : la file durable sur le
 * Redis de la passerelle, l'envoi par le client ZMQ, l'acquittement par
 * `cache_forget_done`, et le rejeu toutes les deux minutes.
 */
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { guardedInterval } from '../utils/guarded-timer.js';
import { configureTranslatorForget, redisForgetQueue, translatorForget, type ForgetQueueStore } from './translatorForget';
import type { CacheForgetRequest } from './zmq-translation/types';

const logger = enhancedLogger.child({ module: 'translatorForgetBootstrap' });

export const FORGET_REPLAY_EVERY_MS = 2 * 60 * 1000;

type ForgetTransport = {
  sendCacheForget(request: CacheForgetRequest): Promise<void>;
  on(event: 'cacheForgetDone', listener: (event: { requestId: string }) => void): unknown;
};

export function startTranslatorForget(input: {
  readonly zmq: ForgetTransport | null;
  readonly redis: Parameters<typeof redisForgetQueue>[0] | null;
}): { stop(): void } {
  if (!input.zmq) {
    logger.warn('oubli au translator inactif : aucun client ZMQ');
    return { stop: () => undefined };
  }
  const store: ForgetQueueStore | null = input.redis ? redisForgetQueue(input.redis) : null;
  const zmq = input.zmq;
  const forget = translatorForget({ store, send: (request) => zmq.sendCacheForget(request) });
  configureTranslatorForget(forget);
  zmq.on('cacheForgetDone', ({ requestId }) => {
    forget.acknowledge(requestId).catch(() => undefined);
  });
  const timer = guardedInterval({ name: 'translator-forget-replay', everyMs: FORGET_REPLAY_EVERY_MS, logger, run: () => forget.replay() });
  timer.unref?.();
  return { stop: () => { clearInterval(timer); configureTranslatorForget(null); } };
}

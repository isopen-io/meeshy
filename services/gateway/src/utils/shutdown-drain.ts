import type { FastifyInstance } from 'fastify';

export type ShutdownDrain = {
  readonly begin: () => void;
  readonly isDraining: () => boolean;
};

export const SHUTDOWN_DRAIN_MAX_MS = 60_000;
const RETRY_AFTER_SECONDS = '5';

export const createShutdownDrain = (): ShutdownDrain => {
  const state = { draining: false };
  return {
    begin: () => { state.draining = true; },
    isDraining: () => state.draining,
  };
};

export const resolveDrainMs = (env: Readonly<Record<string, string | undefined>>): number => {
  const parsed = Number.parseInt(env.GATEWAY_DRAIN_MS ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, SHUTDOWN_DRAIN_MAX_MS);
};

/**
 * À enregistrer APRÈS `@fastify/cors` : son `onRequest` a déjà posé les en-têtes
 * CORS (ou les a refusés) quand ce hook répond, et les prévols ne passent pas ici.
 */
export const registerShutdownDrain = (server: FastifyInstance, drain: ShutdownDrain): void => {
  server.addHook('onRequest', async (request, reply) => {
    if (!drain.isDraining()) return;
    const isHealth = request.url.split('?')[0] === '/health';
    reply
      .header('Retry-After', RETRY_AFTER_SECONDS)
      .header('Cache-Control', 'no-store')
      .code(503);
    return reply.send(
      isHealth
        ? { status: 'unhealthy', draining: true }
        : { success: false, error: 'Service momentanément indisponible', code: 'SERVICE_SHUTTING_DOWN' }
    );
  });
};

type TwoPhaseShutdown = {
  readonly drain: ShutdownDrain;
  readonly drainMs: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly close: () => Promise<void>;
};

const shutdownsInFlight = new WeakMap<ShutdownDrain, Promise<void>>();

const shutDown = async ({ drain, drainMs, sleep, close }: TwoPhaseShutdown): Promise<void> => {
  drain.begin();
  if (drainMs > 0) {
    await sleep(drainMs).catch(() => undefined);
  }
  await close();
};

/**
 * Un second signal (SIGTERM répété, SIGINT) pendant la vidange rejoint l'arrêt
 * en cours : ni seconde attente, ni seconde fermeture en parallèle de la première.
 */
export const runTwoPhaseShutdown = (params: TwoPhaseShutdown): Promise<void> => {
  const inFlight = shutdownsInFlight.get(params.drain);
  if (inFlight) return inFlight;
  const shutdown = shutDown(params);
  shutdownsInFlight.set(params.drain, shutdown);
  return shutdown;
};

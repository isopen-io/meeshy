import type { FastifyInstance } from 'fastify';

import { redactReaderFileUrl } from '../utils/redact-reader-file-url';

type TimingLogger = {
  readonly info: (message: string, meta: Record<string, unknown>) => void;
  readonly warn: (message: string, meta: Record<string, unknown>) => void;
};

/**
 * Le chronométrage des requêtes lentes — extrait de `server.ts` (hors budget de
 * taille) par #9600.
 *
 * Au-delà de 2 s une ligne `info`, au-delà de 5 s une ligne `warn`. L'adresse
 * écrite passe par `redactReaderFileUrl` : un flux audio ou vidéo dure presque
 * toujours plus de deux secondes, et l'adresse SIGNÉE d'un fichier protégé
 * porte un jeton qui suffit, pendant sa vie, à lire les octets à la place de
 * son lecteur (audit #9600, L1-B). Fonction posée sur l'instance RACINE, sans
 * `register` : un hook encapsulé ne verrait aucune route sœur.
 */
export function registerRequestTimingHooks(
  fastify: FastifyInstance,
  deps: { readonly logger: TimingLogger; readonly now?: () => number }
): void {
  const now = deps.now ?? (() => performance.now());

  fastify.addHook('onRequest', (request, _reply, done) => {
    request.__startTime = now();
    done();
  });

  fastify.addHook('onResponse', (request, reply, done) => {
    const start = request.__startTime;
    if (start !== undefined) {
      const durationMs = Math.round(now() - start);
      const level = durationMs > 5000 ? 'warn' : durationMs > 2000 ? 'info' : null;
      if (level) {
        const url = redactReaderFileUrl(request.url);
        deps.logger[level](`⏱️ ${request.method} ${url} → ${reply.statusCode} (${durationMs}ms)`, {
          module: 'RequestTiming',
          durationMs,
          method: request.method,
          url,
          statusCode: reply.statusCode,
        });
      }
    }
    done();
  });
}

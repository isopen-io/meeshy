/**
 * LE PORT INTERNE DES MESURES (#11257).
 *
 * Traefik route `gate.<domaine>` vers le port 3000 de la passerelle, TOUS
 * chemins compris : un `/metrics` monté sur l'application Fastify serait
 * public. Les mesures se servent donc sur un serveur HTTP à part, sur un port
 * que ni Traefik ni le compose ne publient :
 *
 * - OPT-IN : rien n'écoute tant que `METRICS_PORT` ne désigne pas un port (un
 *   test, le collecteur du manifeste ou un poste de dev n'ouvrent rien) ;
 * - `127.0.0.1` par défaut ; `METRICS_HOST=0.0.0.0` seulement pour un
 *   collecteur du réseau des conteneurs ;
 * - jamais le port de l'API (`PORT`), même déclaré par erreur ;
 * - `GET /metrics` seul, au format texte de Prometheus. Rien n'est poussé :
 *   aucune mesure ne quitte le serveur sans qu'un collecteur interne vienne la lire.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Registry } from 'prom-client';
import { logWarn } from '../../utils/logger';

export type MetricsServerConfig = { readonly port: number; readonly host: string };

export function metricsServerConfig(env: Readonly<Record<string, string | undefined>>): MetricsServerConfig | null {
  const raw = env.METRICS_PORT?.trim() ?? '';
  if (!/^\d{1,5}$/.test(raw)) return null;
  const port = Number(raw);
  if (port < 1 || port > 65_535) return null;
  if (port === Number(env.PORT ?? '3000')) return null;
  const host = env.METRICS_HOST?.trim() || '127.0.0.1';
  return { port, host };
}

export type RunningMetricsServer = { readonly port: number; readonly close: () => Promise<void> };

export async function startMetricsServer(options: MetricsServerConfig & { readonly registry: Pick<Registry, 'metrics' | 'contentType'> }): Promise<RunningMetricsServer> {
  const server: Server = createServer((request, response) => {
    const path = (request.url ?? '').split('?')[0];
    if (path !== '/metrics') {
      response.writeHead(404).end();
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' }).end();
      return;
    }
    options.registry
      .metrics()
      .then((body) => response.writeHead(200, { 'Content-Type': options.registry.contentType }).end(body))
      .catch(() => response.writeHead(500).end());
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * Accroche le port interne au cycle de vie de la passerelle : il s'ouvre quand
 * elle est prête et se ferme avec elle. Une configuration `null` n'ouvre rien.
 * Un port qui ne s'ouvre pas ne fait jamais tomber la passerelle : il se journalise par
 * `logWarn`, qui écrit même sous `logger: false` (garde `direct-log-warn-forbidden-guard`).
 */
export function attachMetricsServer(
  app: { addHook(name: 'onReady' | 'onClose', hook: () => Promise<void>): unknown; readonly log: unknown },
  config: MetricsServerConfig | null,
  registry: Pick<Registry, 'metrics' | 'contentType'>,
  onListening: (port: number) => void = () => undefined,
): void {
  if (config === null) return;
  let running: RunningMetricsServer | null = null;
  app.addHook('onReady', async () => {
    try {
      running = await startMetricsServer({ ...config, registry });
      onListening(running.port);
    } catch (error) {
      logWarn(app.log, `metrics server did not start on port ${config.port}`, error);
    }
  });
  app.addHook('onClose', async () => {
    await running?.close();
    running = null;
  });
}

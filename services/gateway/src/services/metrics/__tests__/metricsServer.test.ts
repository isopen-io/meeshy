/**
 * #11257 — les mesures se lisent sur un port INTERNE, jamais sur le port
 * 3000 que Traefik route vers Internet. Le serveur est OPT-IN
 * (`METRICS_PORT`), écoute `127.0.0.1` par défaut, ne sert que `GET /metrics`
 * et ne pousse rien nulle part : aucune mesure ne quitte le serveur.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { mediaStageMetrics } from '../mediaStageMetrics';
import { metricsServerConfig, startMetricsServer } from '../metricsServer';

describe('metricsServerConfig', () => {
  it('est éteint tant que METRICS_PORT n’est pas posé, ou s’il ne désigne pas un port', () => {
    expect(metricsServerConfig({})).toBeNull();
    expect(metricsServerConfig({ METRICS_PORT: '' })).toBeNull();
    expect(metricsServerConfig({ METRICS_PORT: 'off' })).toBeNull();
    expect(metricsServerConfig({ METRICS_PORT: '0' })).toBeNull();
    expect(metricsServerConfig({ METRICS_PORT: '70000' })).toBeNull();
  });

  it('écoute la boucle locale par défaut ; un hôte se déclare pour un collecteur du réseau des conteneurs', () => {
    expect(metricsServerConfig({ METRICS_PORT: '9464' })).toEqual({ port: 9464, host: '127.0.0.1' });
    expect(metricsServerConfig({ METRICS_PORT: '9464', METRICS_HOST: '0.0.0.0' })).toEqual({ port: 9464, host: '0.0.0.0' });
  });

  it('refuse de servir le port de l’API publique', () => {
    expect(metricsServerConfig({ METRICS_PORT: '3000', PORT: '3000' })).toBeNull();
  });
});

describe('startMetricsServer', () => {
  it('sert GET /metrics au format Prometheus, et rien d’autre', async () => {
    const metrics = mediaStageMetrics({ clock: (() => { let t = 0; return () => (t += 100); })() });
    await metrics.time('exif', 'image', async () => undefined);
    const server = await startMetricsServer({ port: 0, host: '127.0.0.1', registry: metrics.registry });
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const ok = await fetch(`${base}/metrics`);
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-type')).toContain('text/plain');
      expect(await ok.text()).toContain('media_stage_seconds_count{stage="exif",kind="image"} 1');

      expect((await fetch(`${base}/`)).status).toBe(404);
      expect((await fetch(`${base}/api/v1/health`)).status).toBe(404);
      expect((await fetch(`${base}/metrics`, { method: 'POST' })).status).toBe(405);
    } finally {
      await server.close();
    }
  });
});

describe('attachMetricsServer', () => {
  it('ouvre le port interne quand la passerelle est prête, et le ferme avec elle', async () => {
    const { default: Fastify } = await import('fastify');
    const { attachMetricsServer } = await import('../metricsServer');
    const metrics = mediaStageMetrics();
    const app = Fastify({ logger: false });
    const started: number[] = [];
    attachMetricsServer(app, { port: 0, host: '127.0.0.1' }, metrics.registry, (port) => started.push(port));

    await app.ready();
    expect(started).toHaveLength(1);
    expect((await fetch(`http://127.0.0.1:${started[0]}/metrics`)).status).toBe(200);

    await app.close();
    await expect(fetch(`http://127.0.0.1:${started[0]}/metrics`)).rejects.toThrow();
  });

  it('sans configuration, n’ouvre rien', async () => {
    const { default: Fastify } = await import('fastify');
    const { attachMetricsServer } = await import('../metricsServer');
    const app = Fastify({ logger: false });
    const started: number[] = [];
    attachMetricsServer(app, null, mediaStageMetrics().registry, (port) => started.push(port));
    await app.ready();
    await app.close();
    expect(started).toEqual([]);
  });

  it('un port déjà pris ne fait pas tomber la passerelle, et l’avertissement est ÉCRIT (pas le no-op de logger: false)', async () => {
    const { default: Fastify } = await import('fastify');
    const { createServer } = await import('node:net');
    const { attachMetricsServer } = await import('../metricsServer');
    const squatter = createServer();
    await new Promise<void>((resolve) => squatter.listen(0, '127.0.0.1', resolve));
    const port = (squatter.address() as { port: number }).port;
    const written: string[] = [];
    const spy = jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { written.push(args.map(String).join(' ')); });
    try {
      const app = Fastify({ logger: false });
      const started: number[] = [];
      attachMetricsServer(app, { port, host: '127.0.0.1' }, mediaStageMetrics().registry, (p) => started.push(p));

      await app.ready();
      await app.close();

      expect(started).toEqual([]);
      expect(written.some((line) => line.includes('metrics server did not start'))).toBe(true);
    } finally {
      spy.mockRestore();
      await new Promise<void>((resolve) => squatter.close(() => resolve()));
    }
  });
});

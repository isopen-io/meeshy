/**
 * #11267, contre-audit C2 — UN SEAU MUET NE SUSPEND AUCUN EFFACEMENT. Le
 * client S3 n'avait aucun délai et l'effacement de la copie était attendu :
 * un MinIO en pause gardait pendantes la suppression pour tous, la vue
 * unique brûlée et la purge de compte. Le client a désormais des délais de
 * connexion et de requête et des tentatives bornées ; l'effacement d'une copie
 * est borné à quelques secondes, et le balayage rattrape ce qu'il laisse.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { s3ClientOptions } from '../mediaObjectStoreFactory';
import { eraseMirroredCopy } from '../mirroredErasure';

const CONFIG = {
  kind: 'mirror' as const,
  endpoint: 'http://media-s3-staging:9000',
  bucket: 'meeshy-media-staging',
  region: 'us-east-1',
  accessKeyId: 'gw',
  secretAccessKey: 'secret',
  forcePathStyle: true,
};

describe('s3ClientOptions — le client S3 n’attend jamais sans fin', () => {
  it('pose des délais de connexion et de requête de quelques secondes, et des tentatives bornées', () => {
    const options = s3ClientOptions(CONFIG);
    const handler = options.requestHandler as { connectionTimeout?: number; requestTimeout?: number };
    expect(handler.connectionTimeout).toBeGreaterThan(0);
    expect(handler.connectionTimeout).toBeLessThanOrEqual(3_000);
    expect(handler.requestTimeout).toBeGreaterThan(0);
    expect(handler.requestTimeout).toBeLessThanOrEqual(30_000);
    expect(options.maxAttempts).toBeGreaterThanOrEqual(1);
    expect(options.maxAttempts).toBeLessThanOrEqual(3);
  });

  it('garde le point d’accès, la région, le style de chemin et les identifiants', () => {
    expect(s3ClientOptions(CONFIG)).toMatchObject({
      endpoint: CONFIG.endpoint,
      region: CONFIG.region,
      forcePathStyle: true,
      credentials: { accessKeyId: 'gw', secretAccessKey: 'secret' },
    });
  });
});

describe('eraseMirroredCopy — borné, jamais bloquant', () => {
  it('un seau qui ne répond pas rend la main au bout du délai', async () => {
    const silent = { remove: () => new Promise<void>(() => undefined) };
    const started = Date.now();
    await eraseMirroredCopy('/srv/uploads/2026/10/a.jpg', '/srv/uploads', silent, { timeoutMs: 50 });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('un seau qui répond efface, dans le délai', async () => {
    const removed: string[] = [];
    await eraseMirroredCopy('/srv/uploads/2026/10/a.jpg', '/srv/uploads', { remove: async (key: string) => { removed.push(key); } }, { timeoutMs: 1_000 });
    expect(removed).toEqual(['2026/10/a.jpg']);
  });
});

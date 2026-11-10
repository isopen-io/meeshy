/**
 * #17116 — la coquille « ami WhatsApp » et le faux WhatsApp n'existent qu'au
 * STAGING. La composition de production ne demande jamais le faux (la porte y
 * resterait close de toute façon : `selectExternalPeer`), et celle du staging
 * le demande pour la passerelle, à côté de `MEESHY_ENV=staging` qui l'autorise.
 *
 * Lit les FICHIERS du dépôt, sans parseur YAML.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.join(REPO, relative), 'utf8');

const serviceBlock = (compose: string, service: string): string => {
  const start = compose.indexOf(`\n  ${service}:\n`);
  if (start < 0) throw new Error(`service ${service} absent`);
  const next = compose.slice(start + 1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
  return next < 0 ? compose.slice(start) : compose.slice(start, start + 1 + next);
};

describe('la coquille ami WhatsApp reste au staging', () => {
  it('la composition de production ne demande ni le faux WhatsApp ni la coquille', () => {
    const production = read('infrastructure/docker/compose/docker-compose.prod.yml');

    expect(production).not.toMatch(/EXTERNAL_PEER/);
    expect(production).not.toMatch(/fake-whatsapp/i);
    expect(production).not.toMatch(/coquille/i);
  });

  it('la passerelle de staging demande le faux WhatsApp, sous le staging déclaré', () => {
    const gateway = serviceBlock(read('infrastructure/docker/compose/docker-compose.staging.yml'), 'gateway-staging');

    expect(gateway).toMatch(/^\s+- EXTERNAL_PEER_PROVIDER=\$\{EXTERNAL_PEER_PROVIDER:-fake-whatsapp\}$/m);
    expect(gateway).toMatch(/^\s+- MEESHY_ENV=staging$/m);
  });

  it('l’image de la passerelle construit la coquille depuis le pont libsignal du web, sans copie', () => {
    const dockerfile = read('services/gateway/Dockerfile');

    expect(dockerfile).toContain('COPY apps/web/src/lib/e2ee/ ./coquille/src/lib/e2ee/');
    expect(dockerfile).toContain('COPY apps/web/src/lib/dma-coquille/ ./coquille/src/lib/dma-coquille/');
    expect(dockerfile).toMatch(/RUN bun \.\/coquille\/scripts\/build-dma-coquille\.ts \/app\/dist-coquille/);
    expect(dockerfile).toMatch(/COPY --from=builder --chown=gateway:nodejs \/app\/dist-coquille \.\/assets\/dma-coquille/);
    expect(fs.existsSync(path.join(REPO, 'services/gateway/assets/dma-coquille'))).toBe(false);
  });
});

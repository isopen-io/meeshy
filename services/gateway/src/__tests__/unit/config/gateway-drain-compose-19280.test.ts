/**
 * #19280 — la vidange de l'arrêt ne sert à rien si Docker ne marque pas la
 * passerelle `unhealthy` avant la fermeture : l'attente (`GATEWAY_DRAIN_MS`)
 * doit couvrir les échecs du contrôle, et `stop_grace_period` l'attente + la
 * fermeture. Lit les FICHIERS, sans parseur YAML.
 *
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');

const serviceBlock = (file: string, name: string): string => {
  const source = fs.readFileSync(path.join(COMPOSE_DIR, file), 'utf8');
  const start = source.indexOf(`\n  ${name}:\n`);
  const rest = source.slice(start + 1);
  const end = rest.slice(name.length + 4).search(/\n {2}[A-Za-z_-]+:\n/);
  return end < 0 ? rest : rest.slice(0, end + name.length + 4);
};

const seconds = (block: string, key: string): number => {
  const match = block.match(new RegExp(`^\\s+${key}: (\\d+)s$`, 'm'));
  return match ? Number(match[1]) : Number.NaN;
};

describe.each([
  ['docker-compose.prod.yml', 'gateway'],
  ['docker-compose.staging.yml', 'gateway-staging'],
])('%s — %s : arrêt en deux temps (#19280)', (file, service) => {
  const block = serviceBlock(file, service);
  const drainMs = Number(block.match(/- GATEWAY_DRAIN_MS=(\d+)/)?.[1]);
  const detectionMs = (seconds(block, 'interval') * Number(block.match(/retries: (\d+)/)?.[1]) + seconds(block, 'timeout')) * 1000;

  it('déclare une vidange', () => {
    expect(drainMs).toBeGreaterThan(0);
  });

  it('laisse à Docker le temps de voir la passerelle unhealthy avant la fermeture', () => {
    expect(drainMs).toBeGreaterThanOrEqual(detectionMs);
  });

  it('accorde au conteneur la vidange plus la fermeture', () => {
    expect(seconds(block, 'stop_grace_period') * 1000).toBeGreaterThan(drainMs);
  });
});

/**
 * #10855 — le journal d'accès de Traefik et les journaux applicatifs couvrent
 * au moins 7 jours, sans secret.
 *
 * Traefik écrit son journal d'accès dans un FICHIER JSON que logrotate tourne
 * chaque jour (14 jours gardés, `infrastructure/config/logging/`) ; aucun
 * en-tête n'y entre sauf `User-Agent`. Les services applicatifs journalisent
 * dans journald, qui survit à la recréation du conteneur à chaque promotion.
 *
 * Lit le FICHIER du dépôt, sans parseur YAML — même patron que
 * `signed-file-addresses-out-of-access-logs.test.ts`.
 *
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

const INFRA = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure');
const read = (...parts: string[]) => fs.readFileSync(path.join(INFRA, ...parts), 'utf8');
const prod = read('docker', 'compose', 'docker-compose.prod.yml');
const staging = read('docker', 'compose', 'docker-compose.staging.yml');

const flags = [...prod.matchAll(/^\s*-\s*"(--accesslog[^"]*)"\s*$/gm)].map((m) => m[1] as string);

const serviceBlock = (source: string, service: string): string => {
  const start = source.indexOf(`\n  ${service}:\n`);
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z][a-z-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
};

describe('journal d’accès Traefik', () => {
  it('écrit en JSON dans le fichier monté que logrotate fait tourner', () => {
    expect(flags).toEqual(expect.arrayContaining([
      '--accesslog=true',
      '--accesslog.filepath=/var/log/traefik/access.log',
      '--accesslog.format=json',
    ]));
    expect(serviceBlock(prod, 'traefik')).toContain('- /var/log/meeshy/traefik:/var/log/traefik');
    expect(read('config', 'logging', 'logrotate-meeshy-traefik')).toMatch(/\/var\/log\/meeshy\/traefik\/access\.log \{[^}]*daily[^}]*rotate 14[^}]*compresscmd \/usr\/local\/sbin\/meeshy-accesslog-redact-gzip/s);
  });

  it('ne garde aucun en-tête sauf User-Agent', () => {
    expect(flags).toContain('--accesslog.fields.headers.defaultmode=drop');
    const kept = flags.filter((f) => /^--accesslog\.fields\.headers\.names\.[^=]+=(keep|redact)$/.test(f));
    expect(kept).toEqual(['--accesslog.fields.headers.names.User-Agent=keep']);
    for (const secret of ['Authorization', 'Cookie', 'X-Session-Token']) {
      expect(flags).toContain(`--accesslog.fields.headers.names.${secret}=drop`);
    }
  });
});

describe.each([
  { source: prod, services: ['gateway', 'translator', 'frontend', 'agent'] },
  { source: staging, services: ['gateway-staging', 'translator-staging', 'frontend-staging', 'agent-staging'] },
])('journaux applicatifs dans journald', ({ source, services }) => {
  it.each(services)('%s survit à sa recréation', (service) => {
    expect(serviceBlock(source, service)).toContain('logging: *journald-logging');
    expect(source).toMatch(/x-journald-logging: &journald-logging\n {2}driver: journald\n/);
  });
});

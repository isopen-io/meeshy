/**
 * LE STAGING A SON RELAIS TURN, ET IL RÉPOND SUR 443 (#11278).
 *
 * Un pare-feu d'entreprise ou d'hôtel qui ne laisse sortir que le web coupe
 * 3478 et 5349 : sans relais TLS sur 443, l'appel ne s'établit pas. Le staging
 * n'avait aucun coturn (`TURN_SERVERS` vide). Ce témoin garde ce qui le rend
 * possible SANS toucher à la production qui partage l'hôte (#9232) : aucun
 * port de la production réutilisé, aucun certificat de la production monté,
 * aucun secret dans le dépôt, et un routeur TCP qui ne capte que SON nom.
 *
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

const INFRA = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure');
const COMPOSE_DIR = path.join(INFRA, 'docker', 'compose');

function serviceBlock(compose: string, serviceName: string): string {
  const lines = fs.readFileSync(path.join(COMPOSE_DIR, compose), 'utf8').split('\n');
  const startIdx = lines.findIndex((line) => line === `  ${serviceName}:`);
  if (startIdx === -1) throw new Error(`service "${serviceName}" introuvable dans ${compose}`);
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((line) => /^ {2}\S/.test(line) || /^\S/.test(line));
  return (endIdx === -1 ? rest : rest.slice(0, endIdx)).filter((line) => !line.trim().startsWith('#')).join('\n');
}

type PortRange = { readonly from: number; readonly to: number; readonly protocol: string };

function publishedHostPorts(block: string): readonly PortRange[] {
  return [...block.matchAll(/^ {6}- "(\d+)(?:-(\d+))?:\d+(?:-\d+)?\/?(udp|tcp)?"$/gm)].map((match) => ({
    from: Number(match[1]),
    to: Number(match[2] ?? match[1]),
    protocol: match[3] ?? 'tcp',
  }));
}

function confValue(conf: string, key: string): string | undefined {
  return new RegExp(`^${key}=(.*)$`, 'm').exec(conf)?.[1]?.trim();
}

const PRODUCTION_COTURN_HOST_PORTS: readonly PortRange[] = [
  { from: 3478, to: 3479, protocol: 'udp' },
  { from: 3478, to: 3479, protocol: 'tcp' },
  { from: 5349, to: 5350, protocol: 'tcp' },
  { from: 5349, to: 5350, protocol: 'udp' },
  { from: 49152, to: 65535, protocol: 'udp' },
];

const overlaps = (a: PortRange, b: PortRange): boolean => a.protocol === b.protocol && a.from <= b.to && b.from <= a.to;

describe('le relais TURN de staging (#11278)', () => {
  const coturn = serviceBlock('docker-compose.staging.yml', 'coturn-staging');
  const conf = fs.readFileSync(path.join(INFRA, 'config', 'turnserver.staging.conf'), 'utf8');

  it('ne partage pas le réseau de l’hôte : les ports de la production lui restent', () => {
    expect(coturn).not.toMatch(/network_mode:\s*host/);
    const published = publishedHostPorts(coturn);
    expect(published.length).toBeGreaterThan(0);
    expect(published.filter((own) => PRODUCTION_COTURN_HOST_PORTS.some((prod) => overlaps(own, prod)))).toEqual([]);
  });

  it('publie exactement la plage de relais que sa configuration alloue', () => {
    const relay = publishedHostPorts(coturn).find((range) => range.to > range.from);
    expect(relay).toEqual({ from: Number(confValue(conf, 'min-port')), to: Number(confValue(conf, 'max-port')), protocol: 'udp' });
  });

  it('route le 443 par un routeur TCP qui ne capte que turn.staging, TLS terminé par Traefik, vers le TURN en clair', () => {
    expect(coturn).toContain('- "traefik.enable=true"');
    expect(coturn).toContain('- "traefik.docker.network=meeshy_meeshy-network"');
    expect(coturn).toContain('traefik.tcp.routers.turn-staging.rule=HostSNI(`turn.staging.${DOMAIN:-meeshy.me}`)');
    expect(coturn).toContain('traefik.tcp.routers.turn-staging.entrypoints=websecure');
    expect(coturn).toContain('traefik.tcp.routers.turn-staging.tls.certresolver=letsencrypt');
    expect(coturn).not.toMatch(/tls\.passthrough=true/);
    expect(coturn).toContain(`traefik.tcp.services.turn-staging.loadbalancer.server.port=${confValue(conf, 'listening-port')}`);
    expect(coturn).not.toMatch(/HostSNI\(`\*`\)/);
  });

  it('ne lit aucun certificat ni aucune clé : rien de la production ne lui est monté', () => {
    expect(coturn).not.toMatch(/dumped_certs|traefik_certs|\/letsencrypt|\.key\b|\.crt\b|\.pem\b/);
    expect(conf).toMatch(/^no-tls$/m);
    expect(confValue(conf, 'cert')).toBeUndefined();
    expect(confValue(conf, 'pkey')).toBeUndefined();
  });

  it('refuse de démarrer sans secret fort ni adresse publique, et ne porte aucun secret dans le dépôt', () => {
    expect(confValue(conf, 'static-auth-secret')).toBe('__TURN_SECRET__');
    expect(confValue(conf, 'external-ip')).toBe('__TURN_EXTERNAL_IP__');
    expect(coturn).toMatch(/if \[ -z "\$\$TURN_SECRET" \][^\n]*meeshy-turn-secret-CHANGE-IN-PRODUCTION[^\n]*\n\s+echo "\[FATAL\][^\n]*\n\s+exit 1/);
    expect(coturn).toMatch(/if \[ -z "\$\$TURN_EXTERNAL_IP" \]; then\n\s+echo "\[FATAL\][^\n]*\n\s+exit 1/);
    expect(coturn).toContain('- TURN_SECRET=${TURN_SECRET}');
  });

  it('garde les refus de pairs de la production (aucun relais vers un réseau interne)', () => {
    const prod = fs.readFileSync(path.join(INFRA, 'config', 'turnserver.prod.conf'), 'utf8');
    const denied = (source: string) => source.split('\n').filter((line) => line.startsWith('denied-peer-ip='));
    expect(denied(conf)).toEqual(denied(prod));
    expect(conf).toMatch(/^no-loopback-peers$/m);
    expect(conf).toMatch(/^use-auth-secret$/m);
  });
});

describe('la passerelle de staging annonce ce relais (#11278)', () => {
  const gateway = serviceBlock('docker-compose.staging.yml', 'gateway-staging');
  const coturn = serviceBlock('docker-compose.staging.yml', 'coturn-staging');

  it('annonce le TURN en clair sur le port que coturn-staging publie', () => {
    const plainPort = /- "(\d+):3478\/udp"/.exec(coturn)?.[1];
    expect(gateway).toContain(`- TURN_SERVERS=\${TURN_SERVERS:-turn.staging.\${DOMAIN:-meeshy.me}:${plainPort}}`);
  });

  it('annonce le TLS sur 443 et n’annonce pas un 5349 que le staging n’ouvre pas', () => {
    expect(gateway).toContain('- TURN_TLS_SERVERS=${TURN_TLS_SERVERS:-turn.staging.${DOMAIN:-meeshy.me}:443}');
    expect(gateway).toContain('- TURN_TLS_PORT=${TURN_TLS_PORT:-0}');
  });

  it('la production n’annonce aucun relais 443 tant que le porteur n’a pas donné son feu vert', () => {
    expect(serviceBlock('docker-compose.prod.yml', 'gateway')).not.toContain('TURN_TLS_SERVERS');
  });
});

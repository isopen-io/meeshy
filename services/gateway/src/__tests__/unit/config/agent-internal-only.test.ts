/**
 * Le service `agent` n'est joignable que par le réseau interne, en staging comme
 * en production (#10242).
 *
 * Staging publiait `agent-staging` par Traefik sur `agent.staging.${DOMAIN}`,
 * sans aucun middleware d'authentification : n'importe qui pouvait lire des
 * résumés de conversations, arrêter un agent, vider ses caches ou déclencher des
 * appels LLM payants. La production avait déjà `traefik.enable=false`.
 *
 * La passerelle joint l'agent par son NOM DE SERVICE sur le réseau privé de son
 * environnement (`agent-staging` sur `meeshy-staging-network`, `agent` sur le
 * réseau de production) : aucun routeur public n'est nécessaire.
 *
 * En production (#10289), l'agent partageait `meeshy-network` avec Traefik, la
 * webapp, static-files et certs-dumper : un de ces conteneurs compromis joignait
 * ses routes et son canal ZMQ. Il vit désormais sur `meeshy-agent-network`, que
 * seule la passerelle partage avec lui, et joint la base et Redis par `meeshy-data`
 * (#11451, garde : `prod-data-network-isolated.test.ts`).
 *
 * Ce témoin lit les FICHIERS du dépôt (même patron que
 * `staging-admin-surfaces-ssh-tunnel-only.test.ts`).
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');

function serviceBlock(source: string, serviceName: string, file: string): string {
  const lines = source.split('\n');
  const startIdx = lines.findIndex((l) => l === `  ${serviceName}:`);
  if (startIdx === -1) throw new Error(`service "${serviceName}" introuvable dans ${file}`);
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((l) => /^ {2}\S/.test(l) || /^\S/.test(l));
  return (endIdx === -1 ? rest : rest.slice(0, endIdx)).join('\n');
}

const CASES = [
  { file: 'docker-compose.staging.yml', service: 'agent-staging', privateNetwork: 'meeshy-staging-network' },
  { file: 'docker-compose.prod.yml', service: 'agent', privateNetwork: 'meeshy-agent-network' },
] as const;

describe("le service agent n'est jamais publié sur Internet (#10242)", () => {
  describe.each(CASES)('$file → $service', ({ file, service, privateNetwork }) => {
    const block = serviceBlock(fs.readFileSync(path.join(COMPOSE_DIR, file), 'utf8'), service, file);
    const labels = block.split('\n').filter((l) => /traefik\./.test(l) && !/^\s*#/.test(l));

    it('déclare traefik.enable=false', () => {
      expect(labels.some((l) => /traefik\.enable=false/.test(l))).toBe(true);
      expect(labels.some((l) => /traefik\.enable=true/.test(l))).toBe(false);
    });

    it('ne déclare aucun routeur ni service Traefik', () => {
      expect(labels.filter((l) => /traefik\.http\.(routers|services)\./.test(l))).toEqual([]);
    });

    it("ne publie aucun port sur l'hôte", () => {
      expect(/^\s{4}ports:/m.test(block)).toBe(false);
    });

    if (privateNetwork) {
      it(`reste sur le réseau privé ${privateNetwork}, que la passerelle partage`, () => {
        expect(block).toMatch(new RegExp(`-\\s+${privateNetwork}\\b`));
      });

      it("ne rejoint plus le réseau partagé avec la production (meeshy-network) : il ne servait qu'à Traefik", () => {
        // Forme liste (`- meeshy-network`) ET forme dictionnaire (`meeshy-network: {}`).
        expect(block).not.toMatch(/-\s+meeshy-network\b/);
        expect(block).not.toMatch(/^\s{6}meeshy-network:/m);
        expect(block).not.toMatch(/^\s{4}network_mode:/m);
      });
    }
  });
});

describe("en production, le réseau de l'agent n'est partagé qu'avec la passerelle (#10289, #11451)", () => {
  const file = 'docker-compose.prod.yml';
  const source = fs.readFileSync(path.join(COMPOSE_DIR, file), 'utf8');
  const PRIVATE = 'meeshy-agent-network';
  // #11451 : la base et Redis l'ont quitté pour meeshy-data, réseau interne.
  const ALLOWED = new Set(['agent', 'gateway']);

  function servicesOn(network: string): string[] {
    const servicesSection = source.split('\n');
    const start = servicesSection.findIndex((l) => l === 'services:');
    const names = servicesSection
      .slice(start + 1)
      .filter((l) => /^ {2}[a-z0-9-]+:\s*$/.test(l))
      .map((l) => l.trim().replace(/:$/, ''));
    return names.filter((name) => {
      let block: string;
      try {
        block = serviceBlock(source, name, file);
      } catch {
        return false;
      }
      return new RegExp(`-\\s+${network}\\b|^\\s{6}${network}:`, 'm').test(block);
    });
  }

  it('déclare le réseau privé au niveau racine, en bridge (sortie vers le fournisseur LLM)', () => {
    const networks = source.slice(source.lastIndexOf('\nnetworks:'));
    expect(networks).toMatch(new RegExp(`\\n {2}${PRIVATE}:\\n {4}driver: bridge`));
  });

  it("n'y place que l'agent et la passerelle", () => {
    const members = servicesOn(PRIVATE);
    expect(members.sort()).toEqual([...ALLOWED].sort());
  });

  it("garde la passerelle sur meeshy-network (Traefik la route) et sur le réseau de l'agent", () => {
    const gateway = serviceBlock(source, 'gateway', file);
    expect(gateway).toMatch(/-\s+meeshy-network\b/);
    expect(gateway).toMatch(new RegExp(`-\\s+${PRIVATE}\\b`));
  });

  it("aucun service ne partage la pile réseau de l'agent (network_mode: service:agent / container:meeshy-agent)", () => {
    expect(source).not.toMatch(/network_mode:\s*["']?(service:agent|container:meeshy-agent)\b/);
  });

  it('ne laisse aucun service du réseau d\'entrée (traefik, frontend, static-files, certs-dumper) joindre l\'agent', () => {
    for (const edge of ['traefik', 'frontend', 'static-files', 'certs-dumper', 'nosqlclient', 'p3x-redis-ui', 'translator']) {
      expect(servicesOn(PRIVATE)).not.toContain(edge);
    }
  });
});

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
  { file: 'docker-compose.prod.yml', service: 'agent', privateNetwork: null },
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
        expect(block).not.toMatch(/-\s+meeshy-network\b/);
      });
    }
  });
});

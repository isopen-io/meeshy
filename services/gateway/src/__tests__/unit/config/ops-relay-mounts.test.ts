/**
 * LE RELAIS DES OPÉRATIONS SERVEUR NE DONNE À LA PASSERELLE AUCUN POUVOIR SUR
 * L'HÔTE (#10385, #10386).
 *
 * La passerelle — un service exposé à Internet — DÉPOSE des demandes dans un
 * dossier et LIT un état publié : jamais de socket Docker, jamais l'état en
 * écriture. Ce témoin garde, dans les composes de référence :
 *  - staging : `/ops-requests` monté, `/ops-state` monté en `:ro`, les variables
 *    d'environnement écrites sans guillemets ;
 *  - production : AUCUN montage ni variable d'opérations (feu vert du porteur
 *    requis, #9223) ;
 *  - partout : pas de `docker.sock` dans la passerelle.
 *
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');

function serviceBlock(compose: string, serviceName: string): string {
  const lines = fs.readFileSync(path.resolve(COMPOSE_DIR, compose), 'utf8').split('\n');
  const startIdx = lines.findIndex((l) => l === `  ${serviceName}:`);
  if (startIdx === -1) throw new Error(`service "${serviceName}" introuvable dans ${compose}`);
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((l) => /^ {2}\S/.test(l));
  return (endIdx === -1 ? rest : rest.slice(0, endIdx))
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
}

describe('le relais des opérations serveur (#10385, #10386)', () => {
  const staging = serviceBlock('docker-compose.staging.yml', 'gateway-staging');
  const production = serviceBlock('docker-compose.prod.yml', 'gateway');

  it('staging : la passerelle dépose ses demandes et lit l’état en lecture seule', () => {
    expect(staging).toContain('- /opt/meeshy/staging/ops/requests:/ops-requests\n');
    expect(staging).toContain('- /opt/meeshy/staging/ops/state:/ops-state:ro');
    expect(staging).not.toMatch(/:\/ops-requests:ro/);
  });

  it('staging : les variables sont écrites sans guillemets', () => {
    for (const line of [
      '- OPS_ENVIRONMENT=staging',
      '- OPS_SHARED_HOST=true',
      '- OPS_REQUESTS_DIR=/ops-requests',
      '- OPS_STATE_DIR=/ops-state',
    ]) {
      expect(staging).toContain(line);
    }
    expect(staging).not.toMatch(/OPS_[A-Z_]+="/);
  });

  it('production : aucun montage ni variable d’opérations', () => {
    expect(production).not.toMatch(/ops-requests|ops-state|OPS_REQUESTS_DIR|OPS_STATE_DIR/);
  });

  it.each([
    ['docker-compose.staging.yml', 'gateway-staging'],
    ['docker-compose.prod.yml', 'gateway'],
  ])('%s : la passerelle n’a jamais le socket Docker', (compose, service) => {
    expect(serviceBlock(compose, service)).not.toContain('docker.sock');
  });
});

/**
 * L'AUTOHEAL DE STAGING NE TOUCHE QU'AU STAGING, ET LA SONDE DE L'INTERFACE REDIS
 * RÉPOND (#10425).
 *
 * Staging et production partagent le démon Docker de `root@meeshy.me` (#9232).
 * `willfarrell/autoheal` redémarre tout conteneur `unhealthy` qui porte SON
 * étiquette, quel que soit le projet compose : deux autoheal qui lisent la même
 * étiquette `autoheal=true` redémarreraient chacun les conteneurs de l'autre
 * environnement. Le staging lit donc une étiquette qui lui est propre.
 *
 * La sonde de `p3x-redis-ui` appelait `netstat`, absent de l'image : le conteneur
 * restait `unhealthy` depuis des jours. Elle n'appelle plus que `node`, présent.
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

const watchedLabel = (block: string): string | null => /AUTOHEAL_CONTAINER_LABEL=(\S+)/.exec(block)?.[1] ?? null;

describe("l'autoheal de staging (#10425)", () => {
  const stagingAutoheal = serviceBlock('docker-compose.staging.yml', 'autoheal-staging');
  const productionAutoheal = serviceBlock('docker-compose.prod.yml', 'autoheal');

  it("lit une étiquette différente de celle de la production : il ne redémarre jamais un conteneur de production", () => {
    expect(watchedLabel(stagingAutoheal)).not.toBeNull();
    expect(watchedLabel(stagingAutoheal)).not.toBe(watchedLabel(productionAutoheal));
    expect(watchedLabel(stagingAutoheal)).not.toBe('all');
  });

  it("les conteneurs de staging qu'il garde portent SON étiquette, jamais celle de la production", () => {
    const translator = serviceBlock('docker-compose.staging.yml', 'translator-staging');
    expect(translator).toContain(`- "${watchedLabel(stagingAutoheal)}=true"`);
    expect(translator).not.toContain(`- "${watchedLabel(productionAutoheal)}=true"`);
  });
});

describe("la sonde de l'interface Redis de staging (#10425)", () => {
  const redisUi = serviceBlock('docker-compose.staging.yml', 'p3x-redis-ui-staging');

  it("n'appelle pas netstat, absent de l'image", () => {
    expect(redisUi).not.toContain('netstat');
  });

  it('ouvre une connexion TCP sur le port 7843 avec node, présent dans l’image', () => {
    expect(redisUi).toMatch(/test: \["CMD", "node", "-e", ".*connect\(7843.*"\]/);
  });
});

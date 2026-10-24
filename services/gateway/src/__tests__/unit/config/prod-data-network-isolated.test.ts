/**
 * Aucun conteneur du staging ne partage un réseau avec la base, Redis, le translator
 * ou l'agent de la production (#11451, #9232 : « ni base, ni Redis, ni réseau »).
 *
 * Staging et production tournent sur le même hôte, et le Traefik de la production
 * route les deux. Jusqu'ici, la passerelle, la webapp, static-files, coturn et le
 * translator du staging rejoignaient `meeshy_meeshy-network`, le réseau de la
 * production — celui où vivait aussi `database`. Un conteneur de staging compromis,
 * ou un `DATABASE_URL` erroné, joignait la base de production.
 *
 * La topologie tenue par ce témoin :
 * - `meeshy-staging-edge` (externe) : Traefik et les SEULS services routés du staging ;
 * - `meeshy-network` : Traefik et les services exposés de la production, aucune donnée ;
 * - `meeshy-data` (`internal: true`) : base, Redis, translator, passerelle, agent et
 *   les deux UIs d'administration — ni Traefik, ni rien du staging.
 *
 * Il lit les FICHIERS du dépôt (même patron que
 * `staging-admin-surfaces-ssh-tunnel-only.test.ts`). Le compose déployé peut en
 * différer (#9662) : la vérification sur l'hôte se consigne dans l'issue.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');

// Projets compose de l'hôte : le nom réel d'un réseau non nommé est `<projet>_<clé>`.
const PROD = { file: 'docker-compose.prod.yml', project: 'meeshy' } as const;
const STAGING = { file: 'docker-compose.staging.yml', project: 'staging' } as const;

const PROD_DATA_SERVICES = ['database', 'redis', 'translator', 'agent'] as const;

type Service = { name: string; body: string };
type Network = { key: string; realName: string; internal: boolean; external: boolean };

function read(file: string): string {
  return fs.readFileSync(path.join(COMPOSE_DIR, file), 'utf8');
}

function services(source: string): Service[] {
  const lines = source.split('\n');
  const start = lines.indexOf('services:');
  const out: Service[] = [];
  for (let i = start + 1; i < lines.length && !/^\S/.test(lines[i]); i++) {
    const m = /^ {2}([a-z0-9-]+):\s*$/.exec(lines[i]);
    if (!m) continue;
    let j = i + 1;
    while (j < lines.length && !/^ {2}\S/.test(lines[j]) && !/^\S/.test(lines[j])) j++;
    out.push({ name: m[1], body: lines.slice(i + 1, j).join('\n') });
  }
  return out;
}

/** Forme liste (`- meeshy-data`) et forme dictionnaire (`meeshy-staging-edge: {}`). */
function networksOf(body: string): string[] {
  const m = /^ {4}networks:\n((?: {6}.*\n?|\s*#.*\n?)+)/m.exec(body);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.replace(/\s+#.*$/, '').replace(/^- /, '').replace(/:.*$/, ''));
}

function rootNetworks(source: string, project: string): Network[] {
  const section = source.slice(source.lastIndexOf('\nnetworks:') + 1).split('\n').slice(1);
  const out: Network[] = [];
  for (let i = 0; i < section.length && !/^\S/.test(section[i]); i++) {
    const m = /^ {2}([a-z0-9-]+):\s*$/.exec(section[i]);
    if (!m) continue;
    let j = i + 1;
    while (j < section.length && !/^ {2}\S/.test(section[j]) && !/^\S/.test(section[j])) j++;
    const body = section.slice(i + 1, j).join('\n');
    const name = /^ {4}name:\s*(\S+)/m.exec(body)?.[1];
    out.push({
      key: m[1],
      realName: name ?? `${project}_${m[1]}`,
      internal: /^ {4}internal:\s*true\b/m.test(body),
      external: /^ {4}external:\s*true\b/m.test(body),
    });
  }
  return out;
}

function realNetworksOf(service: Service, networks: Network[]): string[] {
  return networksOf(service.body).map((key) => {
    const declared = networks.find((n) => n.key === key);
    if (!declared) throw new Error(`réseau "${key}" de ${service.name} non déclaré à la racine`);
    return declared.realName;
  });
}

function membersOf(all: Service[], key: string): string[] {
  return all.filter((s) => networksOf(s.body).includes(key)).map((s) => s.name).sort();
}

describe("le staging ne partage aucun réseau avec les données de la production (#11451)", () => {
  const prodSource = read(PROD.file);
  const stagingSource = read(STAGING.file);
  const prod = services(prodSource);
  const staging = services(stagingSource);
  const prodNetworks = rootNetworks(prodSource, PROD.project);
  const stagingNetworks = rootNetworks(stagingSource, STAGING.project);

  it('lit bien les services et les réseaux des deux fichiers', () => {
    expect(prod.map((s) => s.name)).toEqual(expect.arrayContaining([...PROD_DATA_SERVICES, 'traefik', 'gateway']));
    expect(staging.map((s) => s.name)).toEqual(expect.arrayContaining(['gateway-staging', 'translator-staging']));
    expect(prodNetworks.map((n) => n.key)).toEqual(expect.arrayContaining(['meeshy-network', 'meeshy-data']));
  });

  it('aucun service du staging ne partage un réseau (nom réel) avec la base, Redis, le translator ou l’agent de la production', () => {
    const prodDataNetworks = new Set(
      prod.filter((s) => (PROD_DATA_SERVICES as readonly string[]).includes(s.name)).flatMap((s) => realNetworksOf(s, prodNetworks))
    );
    const partages = staging.flatMap((s) =>
      realNetworksOf(s, stagingNetworks)
        .filter((n) => prodDataNetworks.has(n))
        .map((n) => `${s.name} → ${n}`)
    );
    expect(partages).toEqual([]);
  });

  it('le staging ne rejoint plus meeshy_meeshy-network, sous aucune clé', () => {
    expect(stagingNetworks.map((n) => n.realName)).not.toContain('meeshy_meeshy-network');
  });

  it('le seul réseau externe du staging est meeshy-staging-edge, et seuls les services routés du staging y sont', () => {
    expect(stagingNetworks.filter((n) => n.external).map((n) => n.realName)).toEqual(['meeshy-staging-edge']);
    const routes = staging.filter((s) => /traefik\.enable=true/.test(s.body)).map((s) => s.name).sort();
    expect(membersOf(staging, 'meeshy-staging-edge')).toEqual(routes);
    for (const s of ['database-staging', 'redis-staging', 'translator-staging', 'agent-staging']) {
      expect(membersOf(staging, 'meeshy-staging-edge')).not.toContain(s);
    }
  });

  it('les services routés du staging sont joints par Traefik sur meeshy-staging-edge', () => {
    const fautifs = staging
      .filter((s) => /traefik\.enable=true/.test(s.body))
      .filter((s) => !s.body.includes('"traefik.docker.network=meeshy-staging-edge"'))
      .map((s) => s.name);
    expect(fautifs).toEqual([]);
  });

  describe('en production', () => {
    it('meeshy-staging-edge est le même réseau des deux côtés, et seul Traefik y est', () => {
      const edge = prodNetworks.find((n) => n.key === 'meeshy-staging-edge');
      expect(edge).toEqual({ key: 'meeshy-staging-edge', realName: 'meeshy-staging-edge', internal: false, external: true });
      expect(membersOf(prod, 'meeshy-staging-edge')).toEqual(['traefik']);
    });

    it('Traefik ne joint que des réseaux d’entrée', () => {
      expect(networksOf(prod.find((s) => s.name === 'traefik')!.body).sort()).toEqual(['meeshy-network', 'meeshy-staging-edge']);
    });

    it.each(PROD_DATA_SERVICES)('%s ne rejoint ni meeshy-network ni meeshy-staging-edge', (name) => {
      const nets = networksOf(prod.find((s) => s.name === name)!.body);
      expect(nets).toContain('meeshy-data');
      expect(nets).not.toContain('meeshy-network');
      expect(nets).not.toContain('meeshy-staging-edge');
    });

    it('meeshy-data est interne', () => {
      expect(prodNetworks.find((n) => n.key === 'meeshy-data')?.internal).toBe(true);
    });

    it('ne place sur meeshy-data que les services de données, la passerelle, l’agent et les UIs d’administration', () => {
      expect(membersOf(prod, 'meeshy-data')).toEqual(
        ['agent', 'database', 'gateway', 'nosqlclient', 'p3x-redis-ui', 'redis', 'translator'].sort()
      );
    });

    it('la base et Redis ne sont QUE sur meeshy-data : aucune sortie, aucune entrée', () => {
      for (const name of ['database', 'redis']) {
        expect({ name, nets: networksOf(prod.find((s) => s.name === name)!.body) }).toEqual({ name, nets: ['meeshy-data'] });
      }
    });

    it('un service qui publie un port rejoint au moins un réseau non interne (Docker ne publie rien d’un réseau interne)', () => {
      const internes = new Set(prodNetworks.filter((n) => n.internal).map((n) => n.key));
      const fautifs = prod
        .filter((s) => /^ {4}ports:/m.test(s.body))
        .filter((s) => !/^ {4}network_mode:/m.test(s.body))
        .filter((s) => networksOf(s.body).every((n) => internes.has(n)))
        .map((s) => s.name);
      expect(fautifs).toEqual([]);
    });
  });
});

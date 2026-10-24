/**
 * Aucun conteneur du staging ne partage un réseau avec la production, hors du seul
 * réseau d'entrée `meeshy-staging-edge` (#11451, #9232 : « ni base, ni Redis, ni réseau »).
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
 * Le témoin lit les FICHIERS du dépôt sans parseur YAML (la passerelle n'en dépend
 * pas), et il est donc FERMÉ PAR DÉFAUT : toute écriture des réseaux qu'il ne
 * comprend pas (liste en flux, commentaire derrière `networks:`, ancre, `extends`,
 * `external: True`, nom interpolé…) le fait échouer au lieu d'être ignorée. Les
 * contournements relevés par l'audit adversarial de la PR sont rejoués plus bas :
 * chacun doit le faire tomber.
 *
 * Le compose déployé peut différer du dépôt (#9662) : la vérification sur l'hôte
 * se consigne dans l'issue.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');

// Projets compose de l'hôte : le nom réel d'un réseau sans `name:` est `<projet>_<clé>`.
// La production le fixe par `name: meeshy` ; le staging tient le sien de son dossier
// (/opt/meeshy/staging, mesuré : `staging_default`).
const STAGING_PROJECT = 'staging';
const STAGING_EDGE = 'meeshy-staging-edge';
const PROD_DATA_SERVICES = ['database', 'redis', 'translator', 'agent'] as const;

class FormeInconnue extends Error {}

type Attachment = { networks: string[]; networkMode: string | null };
type NetworkDecl = { realName: string; internal: boolean; external: boolean };
type Compose = { project: string; services: Map<string, Attachment>; networks: Map<string, NetworkDecl> };

const TOP_LEVEL_KEYS = new Set(['name', 'services', 'networks', 'volumes', 'secrets', 'configs']);
// Les seules clés lues dans la déclaration d'un réseau : toute autre est une forme inconnue.
const NETWORK_DECL_KEYS = new Set(['driver', 'name', 'external', 'internal', 'driver_opts', 'ipam', 'labels', 'attachable', 'enable_ipv6']);
// Une clé simple, sans guillemets, échappement, clé explicite (`? `) ni espace avant les deux-points.
const PLAIN_KEY = /^([a-z_][a-z0-9_-]*):(\s.*)?$/;

function stripComment(text: string): string {
  return text.replace(/\s+#.*$/, '').trim();
}

/**
 * Un scalaire simple, guillemets ôtés. Interpolation, ancre, alias, étiquette (`!!str`),
 * scalaire en bloc (`>-`, `|`), directive ou échappement : forme inconnue.
 */
function scalar(raw: string, where: string): string {
  const value = stripComment(raw);
  if (/^[!>|%@`]/.test(value)) throw new FormeInconnue(`${where} : « ${raw.trim()} »`);
  const unquoted = /^"(.*)"$/.exec(value)?.[1] ?? /^'(.*)'$/.exec(value)?.[1] ?? value;
  if (!unquoted || /[$&*{}[\]\\]/.test(unquoted)) throw new FormeInconnue(`${where} : « ${raw.trim()} »`);
  return unquoted;
}

function bool(raw: string, where: string): boolean {
  const value = stripComment(raw);
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new FormeInconnue(`${where} : booléen « ${raw.trim()} » (seuls true et false sont lus)`);
}

const isBlankOrComment = (l: string): boolean => /^\s*(#.*)?$/.test(l);
const indent = (l: string): number => /^ */.exec(l)![0].length;

/**
 * Le corps d'un service ou d'un réseau : ses clés sont TOUTES à l'indentation `level`,
 * simples, et (si `allowed` est donné) dans la liste blanche. Un corps indenté autrement,
 * une clé explicite, échappée ou fusionnée (`<<`) n'est pas lu : il fait tomber le témoin.
 */
function assertBody(body: string[], level: number, where: string, allowed?: Set<string>): void {
  const content = body.filter((l) => !isBlankOrComment(l));
  if (content.length && indent(content[0]) !== level) throw new FormeInconnue(`${where} : corps indenté à ${indent(content[0])}, pas ${level}`);
  for (const line of content) {
    if (/^\s*(- )?(<<|\?)(\s|:|$)/.test(line)) throw new FormeInconnue(`${where} : « ${line.trim()} » (fusion ou clé explicite)`);
    if (indent(line) !== level) continue;
    const key = PLAIN_KEY.exec(line.slice(level))?.[1];
    if (!key) throw new FormeInconnue(`${where} : clé illisible « ${line.trim()} »`);
    if (allowed && !allowed.has(key)) throw new FormeInconnue(`${where} : clé « ${key} » non lue par le témoin`);
  }
}

/** Les lignes qui suivent `start` et sont plus indentées que `level` (lignes vides et commentaires compris). */
function childLines(lines: string[], start: number, level: number): string[] {
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (!isBlankOrComment(lines[i]) && indent(lines[i]) <= level) break;
    out.push(lines[i]);
  }
  return out;
}

function parseServiceNetworks(name: string, body: string[]): Attachment {
  let networks: string[] | null = null;
  let networkMode: string | null = null;
  assertBody(body, 4, name);
  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    if (isBlankOrComment(line) || indent(line) !== 4) continue;
    const key = PLAIN_KEY.exec(line.slice(4))![1];
    if (key === 'extends') throw new FormeInconnue(`${name} : « ${key} » (les réseaux viendraient d'ailleurs)`);
    if (!/network/.test(key)) continue;
    if (key === 'network_mode') {
      networkMode = scalar(line.replace(/^ {4}network_mode:/, ''), `${name}.network_mode`);
      continue;
    }
    if (key !== 'networks' || !/^ {4}networks:\s*$/.test(line)) {
      throw new FormeInconnue(`${name} : « ${line.trim()} » (seul « networks: » seul sur sa ligne est lu)`);
    }
    networks = [];
    for (const child of childLines(body, i, 4)) {
      if (isBlankOrComment(child) || indent(child) > 6) continue; // réglages du rattachement (aliases, gw_priority…)
      const listed = /^ {6}- (.+)$/.exec(child);
      const keyed = /^ {6}([^\s:#][^:]*):\s*(\{\s*\}|null)?\s*(#.*)?$/.exec(child);
      if (listed) networks.push(scalar(listed[1], `${name}.networks`));
      else if (keyed) networks.push(scalar(keyed[1], `${name}.networks`));
      else throw new FormeInconnue(`${name}.networks : « ${child.trim()} »`);
    }
  }
  return { networks: networks ?? [], networkMode };
}

function parseCompose(source: string, fallbackProject: string): Compose {
  const lines = source.split('\n');
  let project = fallbackProject;
  const services = new Map<string, Attachment>();
  const networks = new Map<string, NetworkDecl>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isBlankOrComment(line) || indent(line) !== 0) continue;
    const key = PLAIN_KEY.exec(line)?.[1];
    if (!key) throw new FormeInconnue(`clé racine illisible : « ${line} »`);
    if (key.startsWith('x-')) continue;
    if (!TOP_LEVEL_KEYS.has(key)) throw new FormeInconnue(`clé racine « ${key} » non lue par le témoin`);
    if (key === 'name') {
      project = scalar(line.replace(/^name:/, ''), 'name');
      continue;
    }
    if (key !== 'services' && key !== 'networks') continue;
    if (!new RegExp(`^${key}:\\s*$`).test(line)) throw new FormeInconnue(`« ${line} »`);
    const section = childLines(lines, i, 0);
    for (let j = 0; j < section.length; j++) {
      const entry = section[j];
      if (isBlankOrComment(entry) || indent(entry) !== 2) {
        if (!isBlankOrComment(entry) && indent(entry) < 2) throw new FormeInconnue(`« ${entry} »`);
        continue;
      }
      const header = /^ {2}(.+?):\s*(#.*)?$/.exec(entry);
      if (!header) throw new FormeInconnue(`${key} : « ${entry.trim()} »`);
      const name = scalar(header[1], key);
      const body = childLines(section, j, 2);
      if (key === 'services') {
        services.set(name, parseServiceNetworks(name, body));
        continue;
      }
      assertBody(body, 4, `networks.${name}`, NETWORK_DECL_KEYS);
      const field = (f: string): string | undefined => body.find((l) => new RegExp(`^ {4}${f}:`).test(l))?.replace(new RegExp(`^ {4}${f}:`), '');
      const realName = field('name');
      const external = field('external');
      const internal = field('internal');
      networks.set(name, {
        realName: realName === undefined ? `${project}_${name}` : scalar(realName, `networks.${name}.name`),
        external: external === undefined ? false : bool(external, `networks.${name}.external`),
        internal: internal === undefined ? false : bool(internal, `networks.${name}.internal`),
      });
    }
  }
  return { project, services, networks };
}

/** Noms RÉELS des réseaux d'un service ; sans `networks` ni `network_mode`, le réseau `default` du projet. */
function realNetworksOf(service: Attachment, compose: Compose, where: string): string[] {
  if (service.networkMode) return [];
  const keys = service.networks.length ? service.networks : ['default'];
  return keys.map((key) => {
    const declared = compose.networks.get(key);
    if (declared) return declared.realName;
    if (key === 'default') return `${compose.project}_default`;
    throw new FormeInconnue(`${where} : réseau « ${key} » non déclaré à la racine`);
  });
}

/**
 * Les violations de l'isolement : un service du staging sur un réseau (nom réel) de
 * la production autre que meeshy-staging-edge, ou partageant une pile réseau qui
 * n'est pas la sienne.
 */
/**
 * La fusion de Compose (`-f staging -f surcouche`) : un service redéclaré garde l'union
 * de ses réseaux et le `network_mode` posé par l'un ou l'autre fichier. Un réseau déclaré
 * dans deux fichiers verrait ses champs fusionnés : le témoin refuse de le lire.
 */
function mergeStaging(files: Compose[]): Compose {
  const merged: Compose = { project: STAGING_PROJECT, services: new Map(), networks: new Map() };
  for (const file of files) {
    file.networks.forEach((decl, key) => {
      if (merged.networks.has(key)) throw new FormeInconnue(`réseau « ${key} » déclaré dans deux fichiers du staging`);
      merged.networks.set(key, decl);
    });
    file.services.forEach((service, name) => {
      const before = merged.services.get(name);
      merged.services.set(name, {
        networks: [...new Set([...(before?.networks ?? []), ...service.networks])],
        networkMode: service.networkMode ?? before?.networkMode ?? null,
      });
    });
  }
  return merged;
}

function isolationViolations(prod: Compose, stagingFiles: Compose[]): string[] {
  const prodNetworks = new Set([...prod.networks.values()].map((n) => n.realName));
  for (const service of prod.services.values()) {
    for (const n of realNetworksOf(service, prod, 'production')) prodNetworks.add(n);
  }
  prodNetworks.delete(STAGING_EDGE);

  const merged = mergeStaging(stagingFiles);
  // Chaque fichier seul ET leur fusion : une surcouche qui redéclare un service ne
  // masque jamais les rattachements que le fichier principal lui donne.
  const attachments = [...stagingFiles.flatMap((f) => [...f.services]), ...merged.services];
  const out: string[] = [];
  for (const [name, service] of attachments) {
    const mode = service.networkMode;
    if (mode !== null) {
      const sibling = /^service:(.+)$/.exec(mode)?.[1];
      const allowed = mode === 'none' || mode === 'bridge' || (sibling !== undefined && merged.services.has(sibling));
      if (!allowed) out.push(`${name} → network_mode ${mode}`);
    }
    for (const real of realNetworksOf(service, merged, name)) {
      if (prodNetworks.has(real)) out.push(`${name} → ${real}`);
    }
  }
  return out;
}

function read(file: string): string {
  return fs.readFileSync(path.join(COMPOSE_DIR, file), 'utf8');
}

function membersOf(compose: Compose, key: string): string[] {
  return [...compose.services].filter(([, s]) => s.networks.includes(key)).map(([n]) => n).sort();
}

describe("le staging ne partage aucun réseau avec la production, hors meeshy-staging-edge (#11451)", () => {
  const prodSource = read('docker-compose.prod.yml');
  const stagingSource = read('docker-compose.staging.yml');
  const prod = parseCompose(prodSource, 'meeshy');
  const staging = parseCompose(stagingSource, STAGING_PROJECT);
  // Toutes les surcouches du staging (`docker-compose.staging.<nom>.yml`), présentes et futures.
  const overlayFiles = fs.readdirSync(COMPOSE_DIR).filter((f) => /^docker-compose\.staging\.[a-z0-9-]+\.yml$/.test(f)).sort();
  const overlays = overlayFiles.map((f) => parseCompose(read(f), STAGING_PROJECT));
  const mediaS3 = overlays[overlayFiles.indexOf('docker-compose.staging.media-s3.yml')];

  it('lit bien les services et les réseaux des fichiers', () => {
    expect(prod.project).toBe('meeshy');
    expect([...prod.services.keys()]).toEqual(expect.arrayContaining([...PROD_DATA_SERVICES, 'traefik', 'gateway']));
    expect([...staging.services.keys()]).toEqual(expect.arrayContaining(['gateway-staging', 'translator-staging']));
    expect(overlayFiles).toContain('docker-compose.staging.media-s3.yml');
    expect([...mediaS3.services.keys()]).toEqual(expect.arrayContaining(['media-s3-staging']));
    expect([...prod.networks.keys()]).toEqual(expect.arrayContaining(['meeshy-network', 'meeshy-data', STAGING_EDGE]));
  });

  it('aucun service du staging (surcouches comprises) ne rejoint un réseau de la production autre que meeshy-staging-edge', () => {
    expect(isolationViolations(prod, [staging, ...overlays])).toEqual([]);
  });

  it('le seul réseau externe du staging est meeshy-staging-edge, et seuls les services routés du staging y sont', () => {
    // Surcouche S3 comprise : elle pourrait déclarer son propre réseau externe.
    expect([...mergeStaging([staging, ...overlays]).networks.values()].filter((n) => n.external).map((n) => n.realName)).toEqual([STAGING_EDGE]);
    const routes = [...staging.services.keys()].filter((name) => /traefik\.enable=true/.test(serviceText(stagingSource, name))).sort();
    expect(membersOf(staging, STAGING_EDGE)).toEqual(routes);
    for (const s of ['database-staging', 'redis-staging', 'translator-staging', 'agent-staging']) {
      expect(membersOf(staging, STAGING_EDGE)).not.toContain(s);
    }
  });

  it('les services routés du staging sont joints par Traefik sur meeshy-staging-edge', () => {
    const fautifs = [...staging.services.keys()]
      .map((name) => ({ name, text: serviceText(stagingSource, name) }))
      .filter(({ text }) => /traefik\.enable=true/.test(text) && !text.includes(`"traefik.docker.network=${STAGING_EDGE}"`))
      .map(({ name }) => name);
    expect(fautifs).toEqual([]);
  });

  describe('en production', () => {
    it('meeshy-staging-edge est le même réseau des deux côtés, et seul Traefik y est', () => {
      expect(prod.networks.get(STAGING_EDGE)).toEqual({ realName: STAGING_EDGE, internal: false, external: true });
      expect(membersOf(prod, STAGING_EDGE)).toEqual(['traefik']);
    });

    it('Traefik ne joint que des réseaux d’entrée', () => {
      expect([...prod.services.get('traefik')!.networks].sort()).toEqual(['meeshy-network', STAGING_EDGE]);
    });

    it.each(PROD_DATA_SERVICES)('%s est sur meeshy-data, ni sur meeshy-network ni sur meeshy-staging-edge', (name) => {
      const nets = prod.services.get(name)!.networks;
      expect(nets).toContain('meeshy-data');
      expect(nets).not.toContain('meeshy-network');
      expect(nets).not.toContain(STAGING_EDGE);
    });

    it('meeshy-data est interne', () => {
      expect(prod.networks.get('meeshy-data')?.internal).toBe(true);
    });

    it('ne place sur meeshy-data que les services de données, la passerelle, l’agent et les UIs d’administration', () => {
      expect(membersOf(prod, 'meeshy-data')).toEqual(['agent', 'database', 'gateway', 'nosqlclient', 'p3x-redis-ui', 'redis', 'translator']);
    });

    it('la base et Redis ne sont QUE sur meeshy-data : aucune sortie, aucune entrée', () => {
      for (const name of ['database', 'redis']) {
        expect({ name, nets: prod.services.get(name)!.networks }).toEqual({ name, nets: ['meeshy-data'] });
      }
    });

    it('un service qui publie un port rejoint au moins un réseau non interne (Docker ne publie rien d’un réseau interne)', () => {
      const internes = new Set([...prod.networks].filter(([, n]) => n.internal).map(([k]) => k));
      const fautifs = [...prod.services]
        .filter(([name, s]) => /^ {4}ports:/m.test(serviceText(prodSource, name)) && s.networkMode === null)
        .filter(([, s]) => s.networks.every((n) => internes.has(n)))
        .map(([name]) => name);
      expect(fautifs).toEqual([]);
    });
  });
});

function serviceText(source: string, name: string): string {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => l === `  ${name}:`);
  if (start === -1) throw new Error(`service "${name}" introuvable`);
  return childLines(lines, start, 2).join('\n');
}

/**
 * Les contournements relevés par l'audit adversarial de la PR #12705 : chacun met
 * un service du staging sur les données de la production. Le témoin doit tomber —
 * par une violation, ou par une forme qu'il refuse de lire.
 */
describe('le témoin tombe sur chaque contournement connu (audit de #12705)', () => {
  const prod = parseCompose(read('docker-compose.prod.yml'), 'meeshy');

  const staging = (services: string, networks = ''): string =>
    [
      'services:',
      '  gateway-staging:',
      '    image: isopen/meeshy-gateway:staging',
      services,
      'networks:',
      '  meeshy-staging-network:',
      '    driver: bridge',
      '    name: meeshy-staging-network',
      networks,
    ].join('\n');

  const verdict = (text: string, overlay?: string): string => {
    try {
      const files = [text, ...(overlay === undefined ? [] : [overlay])].map((t) => parseCompose(t, STAGING_PROJECT));
      const v = isolationViolations(prod, files);
      return v.length ? `violation: ${v.join(', ')}` : 'accepté';
    } catch (e) {
      if (e instanceof FormeInconnue) return `forme refusée: ${e.message}`;
      throw e;
    }
  };

  it('la forme dictionnaire est LUE (elle ne tombe pas seulement faute d’être comprise)', () => {
    const parsed = parseCompose(staging('    networks:\n      prod-data:\n        aliases:\n          - x', '  prod-data:\n    name: meeshy_meeshy-data'), STAGING_PROJECT);
    expect(parsed.services.get('gateway-staging')).toEqual({ networks: ['prod-data'], networkMode: null });
    expect(parsed.networks.get('prod-data')?.realName).toBe('meeshy_meeshy-data');
  });

  it('témoin positif : un staging propre est accepté', () => {
    expect(verdict(staging('    networks:\n      - meeshy-staging-network'))).toBe('accepté');
  });

  it.each([
    ['jonction franche', staging('    networks:\n      - prod-data', '  prod-data:\n    name: meeshy_meeshy-data')],
    ['M1 nom entre guillemets', staging('    networks:\n      - prod-data', '  prod-data:\n    name: "meeshy_meeshy-data"')],
    ['M2 commentaire derrière networks:', staging('    networks: # staging\n      - prod-data', '  prod-data:\n    name: meeshy_meeshy-data')],
    ['M3 liste en flux', staging('    networks: [meeshy-staging-network, prod-data]', '  prod-data:\n    name: meeshy_meeshy-data')],
    ['M4 ligne vide dans la liste', staging('    networks:\n      - meeshy-staging-network\n\n      - prod-data', '  prod-data:\n    name: meeshy_meeshy-data')],
    ['M5 network_mode container:', staging('    network_mode: "container:meeshy-database"')],
    ['M5 bis network_mode host', staging('    network_mode: host')],
    ['M6 réseau des UIs d’administration', staging('    networks:\n      - prod-admin', '  prod-admin:\n    name: meeshy_meeshy-admin-ui')],
    ['M6 bis réseau implicite de la production', staging('    networks:\n      - prod-default', '  prod-default:\n    name: meeshy_default')],
    ['M7 service au nom souligné', staging('    networks:\n      - meeshy-staging-network\n  debug_shell:\n    image: alpine\n    networks:\n      - prod-data', '  prod-data:\n    name: meeshy_meeshy-data')],
    ['M9 external: True', staging('    networks:\n      - prod-data', '  prod-data:\n    external: True\n    name: "meeshy_meeshy-data"')],
    ['forme dictionnaire', staging('    networks:\n      prod-data:\n        aliases:\n          - x', '  prod-data:\n    name: meeshy_meeshy-data')],
    ['nom interpolé', staging('    networks:\n      - prod-data', '  prod-data:\n    name: ${PROD_NET:-meeshy_meeshy-data}')],
    ['ancre de fusion', staging('    <<: *prod-attachment')],
    ['extends', staging('    extends:\n      file: docker-compose.prod.yml\n      service: gateway')],
    ['include racine', 'include:\n  - docker-compose.prod.yml\n' + staging('    networks:\n      - meeshy-staging-network')],
    ['M10 corps de service indenté à 8', staging('    networks:\n      - meeshy-staging-network\n  debug:\n        image: alpine\n        networks:\n          - prod-data', '  prod-data:\n    name: meeshy_meeshy-data')],
    ['M11 déclaration de réseau indentée à 6', staging('    networks:\n      - prod-data', '  prod-data:\n      external: true\n      name: meeshy_meeshy-data')],
    ['M12 clé explicite', staging('    ? networks\n    : - prod-data', '  prod-data:\n    name: meeshy_meeshy-data')],
    ['M13 clé échappée', staging('    "netw\\x6frks":\n      - prod-data', '  prod-data:\n    name: meeshy_meeshy-data')],
    ['M14 fusion dans la déclaration d’un réseau', staging('    networks:\n      - prod-data', '  prod-data:\n    <<: *pn')],
    ['M15 espace avant les deux-points', staging('    networks:\n      - prod-data', '  prod-data:\n    name : meeshy_meeshy-data')],
    ['M16 network_mode échappé', staging('    "\\x6eetwork_mode": "container:meeshy-database"')],
    ['nom échappé', staging('    networks:\n      - prod-data', '  prod-data:\n    name: "meeshy_meeshy-\\x64ata"')],
    ['C étiquette !!str', staging('    networks:\n      - prod-data', '  prod-data:\n    name: !!str meeshy_meeshy-data')],
    ['A scalaire en bloc', staging('    networks:\n      - prod-data', '  prod-data:\n    name: >-\n      meeshy_meeshy-data')],
  ])('%s', (_cas, text) => {
    expect(verdict(text)).not.toBe('accepté');
  });

  // Surcouche : `-f docker-compose.staging.yml -f docker-compose.staging.media-s3.yml`.
  const overlay = (body: string): string => `services:\n${body}\n`;
  it.each([
    ['D surcouche qui redéclare un service muni de network_mode', staging('    network_mode: "container:meeshy-database"'), overlay('  gateway-staging:\n    labels:\n      - "x=y"')],
    ['E surcouche qui redéclare un service joint aux données', staging('    networks:\n      - prod-data', '  prod-data:\n    name: meeshy_meeshy-data'), overlay('  gateway-staging:\n    networks:\n      - meeshy-staging-network')],
    ['B étiquette dans la surcouche', staging('    networks:\n      - meeshy-staging-network'), 'services:\n  extra:\n    image: alpine\n    networks:\n      - prod-data\nnetworks:\n  prod-data:\n    external: true\n    name: !!str meeshy_meeshy-data\n'],
    ['surcouche qui joint directement un réseau de la production', staging('    networks:\n      - meeshy-staging-network'), 'services:\n  extra:\n    image: alpine\n    networks:\n      - prod-data\nnetworks:\n  prod-data:\n    external: true\n    name: meeshy_meeshy-data\n'],
  ])('%s', (_cas, main, extra) => {
    expect(verdict(main, extra)).not.toBe('accepté');
  });

  it('témoin positif : la surcouche réelle, ajoutée à un staging propre, est acceptée', () => {
    expect(verdict(staging('    networks:\n      - meeshy-staging-network'), read('docker-compose.staging.media-s3.yml'))).toBe('accepté');
  });
});

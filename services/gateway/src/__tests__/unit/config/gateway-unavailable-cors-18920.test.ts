/**
 * #18920 — LES ERREURS 502/503 DE LA PASSERELLE PORTENT LES EN-TÊTES CORS DE L'API.
 *
 * Quand la passerelle redémarre, Traefik répond lui-même. Le conteneur absent,
 * démarrant ou malade, son routeur Docker DISPARAÎT (le fournisseur Docker écarte
 * un conteneur arrêté, `starting` ou `unhealthy`) : la requête ne trouvait plus
 * aucun routeur pour `gate.meeshy.me` et repartait sans en-tête CORS. Le
 * navigateur la rendait en erreur réseau OPAQUE (`fetch` qui lève), jamais en
 * erreur HTTP lisible — et c'est un déclencheur de la copie ancienne du service
 * worker web.
 *
 * Le correctif est un routeur de REPLI, dans le fournisseur fichier : même hôte,
 * priorité la plus basse, un service SANS serveur (503), et un intergiciel CORS
 * qui ne vit QUE sur lui. Tant que la passerelle sert, son routeur Docker gagne et
 * elle reste la SEULE à décider du CORS (`config/cors-origins.ts`) : un
 * intergiciel CORS de Traefik posé sur le routeur sain répondrait lui-même à
 * TOUS les prévols avec sa propre liste d'en-têtes — et refuserait ceux que la
 * passerelle accepte (`X-Session-Token`, `X-Device-Locale`, `If-None-Match`…).
 *
 * Lit les FICHIERS du dépôt, sans parseur YAML — même patron que
 * `signed-file-addresses-out-of-access-logs.test.ts`. La preuve d'exécution
 * (`curl -i -H 'Origin: https://meeshy.me'` sur le staging passerelle arrêtée)
 * reste à faire sur l'hôte : le dépôt ne déploie pas la configuration de Traefik.
 *
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

import { DEFAULT_ALLOWED_ORIGINS, NATIVE_SHELL_ORIGINS } from '../../../config/cors-origins';
import { CORS_METHODS } from '../../../config/cors-methods';

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');
const DYNAMIC = fs.readFileSync(path.join(COMPOSE_DIR, 'config', 'dynamic.yaml'), 'utf8');

/** Le bloc indenté sous `key:` à `indent` espaces — sans parseur, comme les voisins. */
const blockOf = (source: string, key: string, indent: number): string => {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line === `${' '.repeat(indent)}${key}:`);
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim() !== '' && !line.startsWith(' '.repeat(indent + 1)));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
};

const listUnder = (block: string, key: string): readonly string[] => {
  const lines = block.split('\n');
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => !/^\s*-\s/.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).map((line) => line.replace(/^\s*-\s*/, '').replace(/^"|"$/g, '').trim());
};

const scalar = (block: string, key: string): string | undefined =>
  block
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${key}:`))
    ?.slice(key.length + 1)
    .trim()
    .replace(/^"|"$/g, '');

const ROUTERS = blockOf(DYNAMIC, 'routers', 2);
const SERVICES = blockOf(DYNAMIC, 'services', 2);
const MIDDLEWARES = blockOf(DYNAMIC, 'middlewares', 2);

const stagingOrigins = (): readonly string[] => {
  const compose = fs.readFileSync(path.join(COMPOSE_DIR, 'docker-compose.staging.yml'), 'utf8');
  const declared = /CORS_ORIGINS=(.+)$/m.exec(compose)?.[1] ?? '';
  return declared.replace(/\$\{DOMAIN:-([^}]+)\}/g, '$1').split(',').map((origin) => origin.trim());
};

const PASSERELLES = [
  {
    environnement: 'production',
    host: 'gate.meeshy.me',
    router: 'gateway-unavailable',
    signedRouter: 'gateway-signed-files-unavailable',
    middleware: 'gateway-unavailable-cors-prod',
    compose: 'docker-compose.prod.yml',
    healthyRouters: ['gateway', 'gateway-signed-files'],
    healthySignedRouter: 'gateway-signed-files',
    acceptedByGateway: () => [...DEFAULT_ALLOWED_ORIGINS, ...NATIVE_SHELL_ORIGINS],
  },
  {
    environnement: 'staging',
    host: 'gate.staging.meeshy.me',
    router: 'gateway-staging-unavailable',
    signedRouter: 'gateway-staging-signed-files-unavailable',
    middleware: 'gateway-unavailable-cors-staging',
    compose: 'docker-compose.staging.yml',
    healthyRouters: ['gateway-staging', 'gateway-staging-signed-files'],
    healthySignedRouter: 'gateway-staging-signed-files',
    acceptedByGateway: () => [...stagingOrigins(), ...NATIVE_SHELL_ORIGINS],
  },
] as const;

describe.each(PASSERELLES)('$environnement — la passerelle absente répond une erreur LISIBLE (#18920)', (passerelle) => {
  const router = blockOf(ROUTERS, passerelle.router, 4);
  const middleware = blockOf(blockOf(MIDDLEWARES, passerelle.middleware, 4), 'headers', 6);

  it('un routeur de repli sert le même hôte que la passerelle, en HTTPS', () => {
    expect(scalar(router, 'rule')).toBe(`Host(\`${passerelle.host}\`)`);
    expect(listUnder(router, 'entryPoints')).toEqual(['websecure']);
    expect(scalar(blockOf(router, 'tls', 6), 'certResolver')).toBe('letsencrypt');
  });

  it('il ne gagne JAMAIS contre le routeur Docker de la passerelle : priorité 1, sous la longueur de sa règle', () => {
    const priority = Number(scalar(router, 'priority'));
    expect(priority).toBe(1);
    expect(priority).toBeLessThan(`Host(\`${passerelle.host}\`)`.length);
  });

  it('il mène à un service SANS serveur — un 503, jamais une passerelle démarrante ou malade', () => {
    expect(scalar(router, 'service')).toBe('gateway-unavailable');
    expect(scalar(blockOf(blockOf(SERVICES, 'gateway-unavailable', 4), 'loadBalancer', 6), 'servers')).toBe('[]');
  });

  it('son intergiciel CORS est le sien, et seuls ses routeurs de repli le portent', () => {
    expect(listUnder(router, 'middlewares')).toEqual([passerelle.middleware]);
  });

  it('il n’élargit rien : chaque origine admise est une origine que la passerelle admet déjà', () => {
    const origins = listUnder(middleware, 'accessControlAllowOriginList');
    expect(origins.length).toBeGreaterThan(0);
    expect(origins.filter((origin) => !passerelle.acceptedByGateway().includes(origin))).toEqual([]);
    expect(listUnder(middleware, 'accessControlAllowOriginListRegex')).toEqual([]);
  });

  it('son prévol laisse passer la requête réelle jusqu’au 503 : les verbes de la passerelle, tous en-têtes, `Authorization` nommé', () => {
    const methods = listUnder(middleware, 'accessControlAllowMethods');
    expect(CORS_METHODS.split(',').filter((method) => !methods.includes(method))).toEqual([]);
    expect(listUnder(middleware, 'accessControlAllowHeaders')).toEqual(expect.arrayContaining(['*', 'Authorization']));
    expect(scalar(middleware, 'accessControlAllowCredentials')).toBe('true');
    expect(scalar(middleware, 'accessControlMaxAge')).toBeUndefined();
  });

  /**
   * #9600 — le jeton d'une adresse signée vit dans son CHEMIN, et suffit à lire
   * les octets pendant sa vie. Passerelle saine, son routeur Docker propre coupe
   * le journal d'accès ; passerelle absente, ce routeur disparaît avec elle, et
   * le repli de l'hôte journalisait chaque adresse signée demandée pendant la
   * panne. Le repli signé reprend la règle du routeur sain, lue dans le compose.
   */
  it('les adresses SIGNÉES ont leur propre repli, hors du journal d’accès — celui de l’hôte, lui, journalise', () => {
    const signed = blockOf(ROUTERS, passerelle.signedRouter, 4);
    const compose = fs.readFileSync(path.join(COMPOSE_DIR, passerelle.compose), 'utf8');
    const healthyRule = new RegExp(`traefik\\.http\\.routers\\.${passerelle.healthySignedRouter}\\.rule=([^"\\n]+)`).exec(compose)?.[1] ?? '';
    const signedPrefix = /PathPrefix\(`[^`]+`\)/.exec(healthyRule)?.[0];

    expect(signedPrefix).toBe('PathPrefix(`/api/v1/attachments/signed/`)');
    expect(scalar(signed, 'rule')).toBe(`Host(\`${passerelle.host}\`) && ${signedPrefix}`);
    expect(scalar(blockOf(signed, 'observability', 6), 'accessLogs')).toBe('false');
    expect(scalar(blockOf(router, 'observability', 6), 'accessLogs')).toBeUndefined();
  });

  it('le repli signé passe devant celui de l’hôte, et jamais devant un routeur Docker de la passerelle', () => {
    const priority = Number(scalar(blockOf(ROUTERS, passerelle.signedRouter, 4), 'priority'));

    expect(priority).toBe(2);
    expect(priority).toBeGreaterThan(Number(scalar(router, 'priority')));
    expect(priority).toBeLessThan(`Host(\`${passerelle.host}\`)`.length);
  });

  it('le repli signé répond comme celui de l’hôte : HTTPS, le même service sans serveur, le même intergiciel CORS', () => {
    const signed = blockOf(ROUTERS, passerelle.signedRouter, 4);

    expect(listUnder(signed, 'entryPoints')).toEqual(['websecure']);
    expect(scalar(blockOf(signed, 'tls', 6), 'certResolver')).toBe('letsencrypt');
    expect(scalar(signed, 'service')).toBe('gateway-unavailable');
    expect(listUnder(signed, 'middlewares')).toEqual([passerelle.middleware]);
  });

  it('la passerelle saine reste SEULE juge du CORS : aucun de ses routeurs Docker ne porte un intergiciel CORS de Traefik', () => {
    const compose = fs.readFileSync(path.join(COMPOSE_DIR, passerelle.compose), 'utf8');
    const middlewaresOf = (name: string): readonly string[] =>
      (new RegExp(`traefik\\.http\\.routers\\.${name}\\.middlewares=([^"\\n]+)`).exec(compose)?.[1] ?? '').split(',');
    for (const healthy of passerelle.healthyRouters) {
      expect(middlewaresOf(healthy).filter((name) => /cors/i.test(name))).toEqual([]);
    }
  });
});

describe('le fournisseur Docker garde son comportement : un conteneur absent, démarrant ou malade n’a pas de routeur (#18920)', () => {
  it('`allowEmptyServices` n’est pas posé — il garderait le routeur Docker, qui répondrait 503 SANS CORS à la place du repli', () => {
    const prod = fs.readFileSync(path.join(COMPOSE_DIR, 'docker-compose.prod.yml'), 'utf8');
    expect(prod).not.toMatch(/allowEmptyServices/);
  });
});

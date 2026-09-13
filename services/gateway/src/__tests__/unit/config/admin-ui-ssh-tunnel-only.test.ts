/**
 * NoSQLClient (Mongo UI) et P3X Redis UI ne sont plus routées par Traefik
 * en production — accès par tunnel SSH/VPN uniquement (#3640).
 *
 * `nosqlclient` et `p3x-redis-ui` étaient exposées sur `mongo.${DOMAIN}` /
 * `redis.${DOMAIN}` avec une simple auth basique Traefik devant une
 * interface d'administration de base de données. Ce témoin lit le FICHIER
 * du dépôt (pas de parseur YAML : la forme est stable, un parseur ajouterait
 * une dépendance pour lire un bloc) et garde deux choses pour chaque
 * service : aucun label `traefik.*`, et un port publié lié à `127.0.0.1`
 * seulement (jamais `0.0.0.0` ni une forme courte qui l'omettrait).
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..', '..', '..');
const PROD_COMPOSE = path.resolve(
  SRC,
  '..',
  '..',
  '..',
  'infrastructure',
  'docker',
  'compose',
  'docker-compose.prod.yml'
);

const ADMIN_UI_SERVICES = ['nosqlclient', 'p3x-redis-ui'] as const;

/**
 * Isole les lignes d'un service top-level (indenté à 2 espaces) jusqu'à la
 * prochaine clé au même niveau — c'est la seule frontière stable d'un
 * compose écrit à la main, sans dépendre d'un parseur YAML.
 */
function serviceBlock(source: string, serviceName: string): string {
  const lines = source.split('\n');
  const startIdx = lines.findIndex((l) => l === `  ${serviceName}:`);
  if (startIdx === -1) {
    throw new Error(`service "${serviceName}" introuvable dans ${path.basename(PROD_COMPOSE)}`);
  }
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((l) => /^ {2}\S/.test(l));
  return (endIdx === -1 ? rest : rest.slice(0, endIdx)).join('\n');
}

describe('les interfaces d\'administration Mongo/Redis ne sont plus routées publiquement (#3640)', () => {
  const source = fs.readFileSync(PROD_COMPOSE, 'utf8');

  it.each(ADMIN_UI_SERVICES)('%s ne porte aucun label Traefik', (service) => {
    const block = serviceBlock(source, service);
    expect({ service, portéLabels: /traefik\./.test(block) }).toEqual({
      service,
      portéLabels: false,
    });
  });

  it.each(ADMIN_UI_SERVICES)('%s publie son port lié à 127.0.0.1 uniquement', (service) => {
    const block = serviceBlock(source, service);
    expect({ service, lieALoopback: /-\s+"127\.0\.0\.1:\$\{[A-Z_]+:-\d+\}:\d+"/.test(block) }).toEqual(
      { service, lieALoopback: true }
    );
    // Jamais de forme courte ("8081:3000") qui publierait sur toutes les interfaces.
    expect({ service, formeCourteNonLoopback: /-\s+"\$\{[A-Z_]+:-\d+\}:\d+"/.test(block) }).toEqual(
      { service, formeCourteNonLoopback: false }
    );
  });

  it('le fichier ne déclare plus les hôtes publics mongo./redis. pour ces deux services', () => {
    for (const service of ADMIN_UI_SERVICES) {
      const block = serviceBlock(source, service);
      expect({ service, declareHostPublic: /Host\(`(mongo|redis)\.\$\{DOMAIN/.test(block) }).toEqual(
        { service, declareHostPublic: false }
      );
    }
  });
});

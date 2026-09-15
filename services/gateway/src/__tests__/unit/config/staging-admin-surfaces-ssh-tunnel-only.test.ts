/**
 * Staging suit le même traitement que la production pour les surfaces
 * d'administration base de données — #6254 (UIs Mongo/Redis routées par
 * Traefik) et #6255 (ports bruts Mongo/Redis publiés sur l'hôte).
 *
 * `nosqlclient-staging` / `p3x-redis-ui-staging` étaient routées par Traefik
 * sur `mongo.staging.${DOMAIN}` / `redis.staging.${DOMAIN}` avec une simple
 * auth basique devant une interface d'administration de base de données —
 * le défaut déjà corrigé en production par #3640. `database-staging` et
 * `redis-staging` publiaient en plus leurs ports BRUTS (27018, 6380) sur
 * toutes les interfaces, sans passer par aucune UI.
 *
 * Ce témoin lit le FICHIER du dépôt (pas de parseur YAML : la forme est
 * stable, un parseur ajouterait une dépendance pour lire un bloc) — même
 * patron que `admin-ui-ssh-tunnel-only.test.ts` (#3640), appliqué au compose
 * de staging.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..', '..', '..');
const STAGING_COMPOSE = path.resolve(
  SRC,
  '..',
  '..',
  '..',
  'infrastructure',
  'docker',
  'compose',
  'docker-compose.staging.yml'
);

const ADMIN_UI_SERVICES = ['nosqlclient-staging', 'p3x-redis-ui-staging'] as const;
const RAW_DB_SERVICES = ['database-staging', 'redis-staging'] as const;

/**
 * Isole les lignes d'un service top-level (indenté à 2 espaces) jusqu'à la
 * prochaine clé au même niveau — c'est la seule frontière stable d'un
 * compose écrit à la main, sans dépendre d'un parseur YAML.
 */
function serviceBlock(source: string, serviceName: string): string {
  const lines = source.split('\n');
  const startIdx = lines.findIndex((l) => l === `  ${serviceName}:`);
  if (startIdx === -1) {
    throw new Error(`service "${serviceName}" introuvable dans ${path.basename(STAGING_COMPOSE)}`);
  }
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((l) => /^ {2}\S/.test(l));
  return (endIdx === -1 ? rest : rest.slice(0, endIdx)).join('\n');
}

describe("les surfaces d'administration base de données du staging ne sont plus exposées publiquement (#6254, #6255)", () => {
  const source = fs.readFileSync(STAGING_COMPOSE, 'utf8');

  describe('UIs Mongo/Redis (#6254)', () => {
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
      // Jamais de forme courte ("8091:3000") qui publierait sur toutes les interfaces.
      expect({ service, formeCourteNonLoopback: /-\s+"\$\{[A-Z_]+:-\d+\}:\d+"/.test(block) }).toEqual(
        { service, formeCourteNonLoopback: false }
      );
    });

    it('le fichier ne déclare plus les hôtes publics mongo.staging./redis.staging. pour ces deux services', () => {
      for (const service of ADMIN_UI_SERVICES) {
        const block = serviceBlock(source, service);
        expect({ service, declareHostPublic: /Host\(`(mongo|redis)\.staging\.\$\{DOMAIN/.test(block) }).toEqual(
          { service, declareHostPublic: false }
        );
      }
    });
  });

  describe('ports bruts Mongo/Redis (#6255)', () => {
    it.each(RAW_DB_SERVICES)('%s publie son port lié à 127.0.0.1 uniquement', (service) => {
      const block = serviceBlock(source, service);
      expect({ service, lieALoopback: /-\s+"127\.0\.0\.1:\d+:\d+"/.test(block) }).toEqual({
        service,
        lieALoopback: true,
      });
      // Jamais de forme courte ("27018:27017") qui publierait sur toutes les interfaces.
      expect({ service, formeCourteNonLoopback: /-\s+"\d+:\d+"/.test(block) }).toEqual({
        service,
        formeCourteNonLoopback: false,
      });
    });
  });
});

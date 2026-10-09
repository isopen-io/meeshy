/**
 * LA PASSERELLE NE VOIT QUE LE VERDICT DE LA SAUVEGARDE, EN LECTURE SEULE (#9668).
 *
 * Le script de l'hôte publie `etat.json` dans un dossier À PART des sauvegardes
 * (`/opt/meeshy/backups/nightly-status`, jamais `/opt/meeshy/backups/nightly`),
 * précisément pour que la passerelle — un service exposé à Internet — n'ait
 * jamais accès à l'archive de la base, aux `.env` et aux secrets copiés.
 *
 * Ce témoin garde trois choses dans chaque compose de référence :
 *  - le dossier du verdict est monté sur `/backup-status`, en `:ro` ;
 *  - rien sous `/opt/meeshy/backups` n'est monté en dehors de lui ;
 *  - `BACKUP_STATUS_FILE` pointe ce montage, et l'interrupteur a sa valeur
 *    par défaut écrite (armé en production, désarmé en staging).
 *
 * Lit le FICHIER du dépôt, sans parseur YAML — même patron que
 * `sounds-volume-never-public.test.ts`.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');

const DEPLOIEMENTS = [
  { compose: 'docker-compose.prod.yml', service: 'gateway', armed: 'true' },
  { compose: 'docker-compose.staging.yml', service: 'gateway-staging', armed: 'false' },
] as const;

function serviceBlock(source: string, serviceName: string, compose: string): string {
  const lines = source.split('\n');
  const startIdx = lines.findIndex((l) => l === `  ${serviceName}:`);
  if (startIdx === -1) throw new Error(`service "${serviceName}" introuvable dans ${compose}`);
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((l) => /^ {2}\S/.test(l));
  return (endIdx === -1 ? rest : rest.slice(0, endIdx)).join('\n');
}

const mounts = (block: string): string[] =>
  block
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .map((line) => line.trim().replace(/^- /, ''))
    .filter((line) => /:\/[^ ]*(:ro|:rw)?$/.test(line) && !line.includes('='));

describe('le verdict de sauvegarde est le seul morceau des sauvegardes que voit la passerelle (#9668)', () => {
  describe.each(DEPLOIEMENTS)('$compose', ({ compose, service, armed }) => {
    const block = serviceBlock(fs.readFileSync(path.resolve(COMPOSE_DIR, compose), 'utf8'), service, compose)
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');

    it('monte le dossier du verdict sur /backup-status, en lecture seule', () => {
      const verdict = mounts(block).filter((mount) => mount.includes(':/backup-status'));
      expect(verdict).toHaveLength(1);
      expect(verdict[0]).toMatch(/:\/backup-status:ro$/);
    });

    it('ne monte aucun autre chemin sous /opt/meeshy/backups', () => {
      const backups = mounts(block).filter((mount) => mount.includes('/opt/meeshy/backups') || mount.includes('backups/nightly:'));
      expect(backups.every((mount) => mount.endsWith(':/backup-status:ro'))).toBe(true);
      expect(block).not.toMatch(/\/opt\/meeshy\/backups\/nightly(?!-status)/);
    });

    it(`lit etat.json depuis ce montage, interrupteur par défaut à ${armed}`, () => {
      expect(block).toContain('- BACKUP_STATUS_FILE=/backup-status/etat.json');
      expect(block).toContain(`- BACKUP_STATUS_ALERTS_ENABLED=\${BACKUP_STATUS_ALERTS_ENABLED:-${armed}}`);
    });
  });
});

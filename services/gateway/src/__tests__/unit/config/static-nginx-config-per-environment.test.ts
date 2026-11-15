/**
 * UNE CONFIG NGINX STATIQUE PAR ENVIRONNEMENT (#11419, #9232).
 *
 * `deploy-staging.sh` copiait `/opt/meeshy/docker/nginx/static-files.conf` —
 * le fichier de PRODUCTION sur l'hôte — dans le dossier de staging. Fermer
 * `/uploads` sur staging obligeait donc à modifier la production, ou bien la
 * prochaine exécution rouvrait staging en silence avec la config de
 * production (#11256). Staging et production partagent un hôte, jamais une
 * configuration : chacun installe la SIENNE, depuis le dépôt.
 *
 * Garde de SOURCE, même patron que `media-uploads-never-public.test.ts` :
 * lit les fichiers du dépôt, sans exécuter le script.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
const DEPLOY_STAGING = path.resolve(REPO, 'infrastructure', 'scripts', 'deploy-staging.sh');
const NGINX_DIR = path.resolve(REPO, 'infrastructure', 'docker', 'nginx');
const CONF_STAGING = 'infrastructure/docker/nginx/static-files.staging.conf';
const CONF_PROD = path.resolve(NGINX_DIR, 'static-files.conf');

/** Les lignes exécutées du script, commentaires retirés. */
function executedLines(source: string): readonly string[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

describe('deploy-staging.sh installe la config nginx de STAGING (#11419)', () => {
  const lignes = executedLines(fs.readFileSync(DEPLOY_STAGING, 'utf8'));

  it('ne lit JAMAIS un fichier du dossier de production de l’hôte pour la config nginx', () => {
    expect(lignes.filter((l) => l.includes('/opt/meeshy/docker/nginx'))).toEqual([]);
  });

  it('ne copie aucune config nginx d’un dossier /opt/meeshy hors du dossier de staging', () => {
    const copiesCroisees = lignes.filter(
      (l) => /\bcp\b/.test(l) && l.includes('nginx') && /\/opt\/meeshy\/(?!staging)/.test(l),
    );
    expect(copiesCroisees).toEqual([]);
  });

  it('pousse la config de staging du dépôt à la place que monte le compose de staging', () => {
    const envoi = lignes.join('\n');
    expect(envoi).toMatch(
      new RegExp(`scp\\s+${CONF_STAGING.replace(/\./g, '\\.')}\\s*\\\\?\\s*\\$REMOTE_HOST:\\$STAGING_DIR/config/nginx/static-files\\.conf`),
    );
  });

  it('le compose de staging monte bien ce chemin', () => {
    const compose = fs.readFileSync(
      path.resolve(REPO, 'infrastructure', 'docker', 'compose', 'docker-compose.staging.yml'),
      'utf8',
    );
    expect(compose).toContain('./config/nginx/static-files.conf:/etc/nginx/conf.d/default.conf:ro');
  });
});

describe('la config de staging est celle de STAGING (#11419)', () => {
  const conf = fs.readFileSync(path.resolve(REPO, CONF_STAGING), 'utf8');

  it('sert le domaine statique de staging', () => {
    expect(conf).toMatch(/server_name\s+static\.staging\.meeshy\.me\s*;/);
  });

  it('n’autorise pas l’origine de production', () => {
    expect(conf).not.toContain('"https://meeshy.me"');
  });

  it('diffère de la config de production', () => {
    expect(conf).not.toBe(fs.readFileSync(CONF_PROD, 'utf8'));
  });
});

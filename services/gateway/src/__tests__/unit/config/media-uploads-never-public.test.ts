/**
 * LES OCTETS D'UN MÉDIA DE MESSAGE NE SONT JOIGNABLES QUE PAR LA PASSERELLE (#11256).
 *
 * ## Ce que le montage ouvrait
 *
 * `static-files` (nginx) montait `gateway_uploads` en lecture seule sous
 * `/usr/share/nginx/html/uploads`, et `static-files.conf` servait `/` tel quel :
 * toute pièce jointe était donc joignable sur
 * `https://static.<domaine>/uploads/<année>/<mois>/<utilisateur>/<fichier>`,
 * SANS authentification, en cache `public, immutable` un an. Ce chemin
 * CONTOURNE tout ce que la passerelle garde sur `GET /attachments/file/…` :
 *
 *  - la VUE UNIQUE (le fichier reste lisible après la première vue) ;
 *  - l'ÉPHÉMÈRE (le message expire, pas l'adresse) ;
 *  - le LECTEUR-GATE (membre de la conversation, lien d'invitation, bloqué) ;
 *  - le type : nginx ne connaît que cinq types d'image et sert tout le reste en
 *    `application/octet-stream` — vocaux et documents compris.
 *
 * Il faut connaître le nom du fichier pour y arriver (clé datée + id
 * utilisateur + nom aléatoire) : c'est de l'obscurité, pas un contrôle d'accès.
 *
 * ## Ce que ce témoin fait
 *
 * C'est un PIÈGE ARMÉ, au sens du cycle 84 : la fermeture tient à l'ABSENCE
 * d'une ligne dans un compose et d'un bloc dans une conf nginx, que rien ne
 * nomme « confidentialité ». Même patron que
 * `sounds-volume-never-public.test.ts` (#7015) : lit les FICHIERS du dépôt,
 * sans parseur YAML.
 *
 * Pas de 302 signé en remplacement : nginx ne signe pas, et un `<img>` ne
 * porte pas de Bearer. Les octets passent par la passerelle (`fetch` + URL
 * d'objet, ou adresse signée), jamais par ce domaine.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';

const INFRA_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker');
const COMPOSE_DIR = path.resolve(INFRA_DIR, 'compose');

const DEPLOIEMENTS = [
  {
    compose: 'docker-compose.prod.yml',
    statique: 'static-files',
    volumeUploads: 'gateway_uploads',
    volumeLegacy: 'frontend_uploads',
  },
  {
    compose: 'docker-compose.staging.yml',
    statique: 'static-files-staging',
    volumeUploads: 'gateway_staging_uploads',
    volumeLegacy: 'frontend_staging_uploads',
  },
] as const;

const CONFS_NGINX = [
  path.resolve(INFRA_DIR, 'nginx', 'static-files.conf'),
  path.resolve(COMPOSE_DIR, 'config', 'nginx', 'static-files.conf'),
] as const;

function serviceBlock(source: string, serviceName: string, compose: string): string {
  const lines = source.split('\n');
  const startIdx = lines.findIndex((l) => l === `  ${serviceName}:`);
  if (startIdx === -1) throw new Error(`service "${serviceName}" introuvable dans ${compose}`);
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((l) => /^ {2}\S/.test(l));
  return (endIdx === -1 ? rest : rest.slice(0, endIdx)).join('\n');
}

/** Le corps d'un `location <selecteur> { … }` de premier niveau, accolades appariées. */
function locationBlock(conf: string, selecteur: string): string | null {
  const ouverture = new RegExp(`^\\s*location\\s+${selecteur.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*\\{`, 'm').exec(conf);
  if (ouverture === null) return null;
  let profondeur = 1;
  let i = ouverture.index + ouverture[0].length;
  const debut = i;
  while (i < conf.length && profondeur > 0) {
    if (conf[i] === '{') profondeur += 1;
    if (conf[i] === '}') profondeur -= 1;
    i += 1;
  }
  return conf.slice(debut, i - 1);
}

describe('les uploads de la passerelle ne rejoignent JAMAIS un magasin public (#11256)', () => {
  describe.each(DEPLOIEMENTS)('$compose', ({ compose, statique, volumeUploads, volumeLegacy }) => {
    const source = fs.readFileSync(path.resolve(COMPOSE_DIR, compose), 'utf8');
    const bloc = serviceBlock(source, statique, compose);

    it(`le volume "${volumeUploads}" existe et reste déclaré`, () => {
      expect(source).toContain(`  ${volumeUploads}:`);
    });

    it(`"${statique}" ne monte PAS "${volumeUploads}" — il servirait pièces jointes, vues uniques et vocaux sans authentification`, () => {
      expect(bloc).not.toContain(volumeUploads);
    });

    it(`"${statique}" ne monte rien sous /uploads`, () => {
      expect(bloc).not.toMatch(/html\/uploads/);
    });

    it(`"${statique}" garde le magasin legacy "${volumeLegacy}" sous /u, en lecture seule`, () => {
      expect(bloc).toContain(`${volumeLegacy}:/usr/share/nginx/html/u:ro`);
    });

    it('la passerelle, elle, le monte bien sur /app/uploads — la route authentifiée doit pouvoir les lire', () => {
      expect(source).toContain(`${volumeUploads}:/app/uploads`);
    });

    it(`AUCUN autre service ne monte "${volumeUploads}" — seule la passerelle sert ces octets`, () => {
      const montages = source
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith(`- ${volumeUploads}:`));
      expect(montages).toEqual([`- ${volumeUploads}:/app/uploads`]);
    });
  });

  describe.each(CONFS_NGINX.map((p) => [path.relative(INFRA_DIR, p), p] as const))('%s', (_nom, chemin) => {
    const conf = fs.readFileSync(chemin, 'utf8');

    it('ne déclare aucun `location` pour /uploads', () => {
      expect(conf).not.toMatch(/location\s+[~^=*\s]*\/uploads/);
    });

    it('`location /` ne sert RIEN — sans cela, tout dossier monté sous la racine redevient public', () => {
      const racine = locationBlock(conf, '/');
      expect(racine).not.toBeNull();
      expect(racine).toContain('return 404');
      expect(racine).not.toContain('try_files');
    });

    it('sert toujours le magasin legacy sous /u/', () => {
      expect(locationBlock(conf, '/u/')).not.toBeNull();
    });
  });
});

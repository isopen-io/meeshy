/**
 * LE SEAU DES MÉDIAS N'EST JOIGNABLE QUE PAR LA PASSERELLE (#11267).
 *
 * Il porte les mêmes octets que le volume des dépôts — pièces jointes, vues
 * uniques, vocaux — et la même règle que `media-uploads-never-public`
 * (#11256) s'y applique : un client ne lit ces octets QUE par la route de
 * fichiers, sous ses gardes.
 *
 * Le seau vit dans une SURCOUCHE (`docker-compose.staging.media-s3.yml`),
 * jamais dans le compose de staging : Compose évalue `${VAR:?}` sur tout le
 * fichier, profils inactifs compris (mesuré, Compose v5.6), donc des
 * identifiants OBLIGATOIRES dans le fichier principal casseraient le
 * déploiement de tout le staging. Dans la surcouche, `:?` refuse le démarrage
 * sans identifiants — MinIO prendrait sinon « minioadmin » (audit D3).
 *
 * Ni port, ni Traefik, ni réseau partagé avec la production (le réseau du
 * staging est un bridge ordinaire : ce sont les identifiants qui protègent), ni
 * politique anonyme ; la passerelle n'a qu'un compte de service limité au seau, jamais
 * l'administrateur ; les images s'épinglent par empreinte. La production n'a
 * pas de seau : sa migration attend le porteur (#9232).
 *
 * Même patron que `media-uploads-never-public.test.ts` : lit les FICHIERS du
 * dépôt, sans parseur YAML.
 *
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');
const read = (name: string) => fs.readFileSync(path.resolve(COMPOSE_DIR, name), 'utf8');

/** La configuration sans ses commentaires : une garde juge ce qui s'exécute. */
const withoutComments = (source: string) => source.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

function serviceBlock(source: string, serviceName: string): string {
  const lines = source.split('\n');
  const startIdx = lines.findIndex((l) => l === `  ${serviceName}:`);
  if (startIdx === -1) throw new Error(`service "${serviceName}" introuvable`);
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((l) => /^ {2}\S/.test(l) || /^\S/.test(l));
  return (endIdx === -1 ? rest : rest.slice(0, endIdx)).join('\n');
}

const STAGING = read('docker-compose.staging.yml');
const OVERLAY = read('docker-compose.staging.media-s3.yml');
const OVERLAY_CONFIG = withoutComments(OVERLAY);
const SEAU = serviceBlock(OVERLAY, 'media-s3-staging');
const INIT = serviceBlock(OVERLAY, 'media-s3-init-staging');

describe('le compose de staging ne porte pas le seau : un `:?` y casserait tout le staging', () => {
  it('aucun service S3 dans le fichier principal', () => {
    expect(withoutComments(STAGING)).not.toMatch(/^ {2}media-s3/m);
    expect(withoutComments(STAGING)).not.toMatch(/MINIO_ROOT/);
  });

  it('aucune variable OBLIGATOIRE du seau dans le fichier principal', () => {
    expect(withoutComments(STAGING)).not.toMatch(/\$\{MEDIA_S3_[A-Z_]*:\?/);
  });
});

describe('la surcouche du seau des médias reste privée (#11267)', () => {
  it.each([
    ['le seau', SEAU],
    ['son initialisation', INIT],
  ])('%s ne publie aucun port, n’est pas routé par Traefik et ne rejoint que le réseau du staging', (_name, bloc) => {
    expect(bloc).not.toMatch(/^\s{4}ports:/m);
    expect(bloc).not.toMatch(/traefik/i);
    expect(bloc).toMatch(/networks:\n\s+- meeshy-staging-network\n?/);
    expect(bloc).not.toMatch(/- meeshy-network\b/);
  });

  it('l’administrateur MinIO n’existe pas sans identifiants : `:?`, jamais de défaut', () => {
    expect(SEAU).toMatch(/MINIO_ROOT_USER=\$\{MEDIA_S3_ROOT_USER:\?[^}]+\}\n/);
    expect(SEAU).toMatch(/MINIO_ROOT_PASSWORD=\$\{MEDIA_S3_ROOT_PASSWORD:\?[^}]+\}\n/);
    expect(OVERLAY_CONFIG).not.toMatch(/minioadmin/i);
    expect(OVERLAY_CONFIG).not.toMatch(/\$\{MEDIA_S3_ROOT_[A-Z_]*:-/);
  });

  it('la console web de MinIO est éteinte', () => {
    expect(SEAU).toContain('MINIO_BROWSER=off');
  });

  it('les images s’épinglent par EMPREINTE, que l’opérateur doit fournir', () => {
    const images = OVERLAY_CONFIG.split('\n').filter((l) => /^\s+image:/.test(l));
    expect(images).toHaveLength(2);
    for (const line of images) expect(line).toMatch(/@\$\{MEDIA_S3_[A-Z_]*DIGEST:\?[^}]+\}$/);
    expect(OVERLAY_CONFIG).not.toMatch(/:latest\b/);
  });

  it('aucune politique anonyme : le seau est créé, puis un compte de service limité à LUI', () => {
    expect(OVERLAY_CONFIG).not.toMatch(/anonymous\s+set|set-json|public-read|"Principal"\s*:\s*"\*"/i);
    expect(INIT).toMatch(/mc mb --ignore-existing/);
    expect(INIT).toMatch(/mc admin user add/);
    expect(INIT).toMatch(/mc admin policy attach/);
    expect(INIT).toMatch(/arn:aws:s3:::\$\$\{MEDIA_S3_BUCKET\}\/\*/);
    expect(INIT).not.toMatch(/arn:aws:s3:::\*/);
  });

  it('le compte de service n’est pas l’administrateur', () => {
    expect(INIT).toMatch(/MEDIA_S3_ACCESS_KEY_ID=\$\{MEDIA_S3_ACCESS_KEY_ID:\?[^}]+\}/);
    expect(OVERLAY_CONFIG).not.toMatch(/MEDIA_S3_ACCESS_KEY_ID=\$\{MEDIA_S3_ROOT/);
  });

  it('le seau a son propre volume, que seul le seau monte', () => {
    const montages = OVERLAY.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- media_staging_bucket:'));
    expect(montages).toEqual(['- media_staging_bucket:/data']);
    expect(withoutComments(STAGING)).not.toContain('media_staging_bucket');
  });
});

describe('la passerelle de staging adresse le seau par le réseau du staging, avec son compte de service', () => {
  const passerelle = serviceBlock(STAGING, 'gateway-staging');

  it('point d’accès interne, identifiants du compte de service, éteint par défaut', () => {
    expect(passerelle).toContain('MEDIA_S3_ENDPOINT=http://media-s3-staging:9000');
    expect(passerelle).toContain('MEDIA_S3_ACCESS_KEY_ID=${MEDIA_S3_ACCESS_KEY_ID:-}');
    expect(passerelle).toContain('MEDIA_S3_SECRET_ACCESS_KEY=${MEDIA_S3_SECRET_ACCESS_KEY:-}');
    expect(passerelle).toContain('MEDIA_S3_MIRROR=${MEDIA_S3_MIRROR:-off}');
    expect(passerelle).not.toMatch(/MEDIA_S3_ROOT/);
  });
});

describe('la production n’a pas de seau tant que le porteur n’a pas donné son feu vert (#9232)', () => {
  const PROD = read('docker-compose.prod.yml');

  it('aucun service S3 ni miroir armé', () => {
    expect(withoutComments(PROD)).not.toMatch(/media-s3|minio/i);
    expect(PROD).not.toMatch(/MEDIA_S3_MIRROR(_FOLLOW)?=on/);
  });
});

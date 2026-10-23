/**
 * LE SEAU DES MÉDIAS N'EST JOIGNABLE QUE PAR LA PASSERELLE (#11267).
 *
 * Il porte les mêmes octets que le volume des dépôts — pièces jointes, vues
 * uniques, vocaux — et la même règle que `media-uploads-never-public`
 * (#11256) s'y applique : un client ne lit ces octets QUE par la route de
 * fichiers, sous ses gardes. Le seau ne publie donc aucun port, n'est pas
 * routé par Traefik, ne rejoint pas le réseau partagé avec la production, ne
 * reçoit aucune politique anonyme et ne prend jamais d'identifiant par défaut
 * (MinIO retomberait sur « minioadmin »).
 *
 * La production n'a pas de seau : sa migration attend le porteur (#9232).
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

function serviceBlock(source: string, serviceName: string): string {
  const lines = source.split('\n');
  const startIdx = lines.findIndex((l) => l === `  ${serviceName}:`);
  if (startIdx === -1) throw new Error(`service "${serviceName}" introuvable`);
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((l) => /^ {2}\S/.test(l));
  return (endIdx === -1 ? rest : rest.slice(0, endIdx)).join('\n');
}

/** La configuration sans ses commentaires : une garde juge ce qui s'exécute. */
const withoutComments = (source: string) => source.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

const STAGING = read('docker-compose.staging.yml');
const STAGING_CONFIG = withoutComments(STAGING);
const SEAU = serviceBlock(STAGING, 'media-s3-staging');
const INIT = serviceBlock(STAGING, 'media-s3-init-staging');

describe('le seau des médias de staging reste privé (#11267)', () => {
  it.each([
    ['le seau', SEAU],
    ['son initialisation', INIT],
  ])('%s ne publie aucun port, n’est pas routé par Traefik et ne rejoint que le réseau interne', (_name, bloc) => {
    expect(bloc).not.toMatch(/^\s{4}ports:/m);
    expect(bloc).not.toMatch(/traefik/i);
    expect(bloc).toMatch(/networks:\n\s+- meeshy-staging-network\n?$/);
    expect(bloc).not.toContain('meeshy-network\n');
  });

  it('ne démarre que sous le profil explicite `media-s3`', () => {
    expect(SEAU).toContain('profiles: ["media-s3"]');
    expect(INIT).toContain('profiles: ["media-s3"]');
  });

  it('ses identifiants viennent de l’hôte, sans AUCUNE valeur par défaut', () => {
    expect(SEAU).toContain('MINIO_ROOT_USER=${MEDIA_S3_ACCESS_KEY_ID}\n');
    expect(SEAU).toContain('MINIO_ROOT_PASSWORD=${MEDIA_S3_SECRET_ACCESS_KEY}\n');
    expect(STAGING_CONFIG).not.toMatch(/minioadmin/i);
  });

  it('la console web de MinIO est éteinte', () => {
    expect(SEAU).toContain('MINIO_BROWSER=off');
  });

  it('aucune politique anonyme n’est posée : l’initialisation ne fait que créer le seau', () => {
    expect(STAGING_CONFIG).not.toMatch(/anonymous\s+set|policy\s+set|set-json|public-read/i);
    expect(INIT).toMatch(/command: \["mb", "--ignore-existing", /);
  });

  it('la passerelle l’adresse par le réseau interne, sans identifiant écrit en dur', () => {
    const passerelle = serviceBlock(STAGING, 'gateway-staging');
    expect(passerelle).toContain('MEDIA_S3_ENDPOINT=http://media-s3-staging:9000');
    expect(passerelle).toContain('MEDIA_S3_ACCESS_KEY_ID=${MEDIA_S3_ACCESS_KEY_ID:-}');
    expect(passerelle).toContain('MEDIA_S3_SECRET_ACCESS_KEY=${MEDIA_S3_SECRET_ACCESS_KEY:-}');
  });

  it('le seau a son propre volume, que seul le seau monte', () => {
    const montages = STAGING.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- media_staging_bucket:'));
    expect(montages).toEqual(['- media_staging_bucket:/data']);
  });
});

describe('la production n’a pas de seau tant que le porteur n’a pas donné son feu vert (#9232)', () => {
  const PROD = read('docker-compose.prod.yml');

  it('aucun service S3 ni miroir armé', () => {
    expect(withoutComments(PROD)).not.toMatch(/media-s3|minio/i);
    expect(PROD).not.toMatch(/MEDIA_S3_MIRROR(_FOLLOW)?=on/);
  });
});

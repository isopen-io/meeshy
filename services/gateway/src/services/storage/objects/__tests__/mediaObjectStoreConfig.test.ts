/**
 * #11267 — la configuration du stockage des médias se lit dans l'environnement,
 * et ÉCHOUE FERMÉ vers le disque : un miroir à moitié configuré n'existe pas.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { mediaS3ConfigFromEnv } from '../mediaObjectStoreConfig';

const COMPLETE = {
  MEDIA_S3_MIRROR: 'on',
  MEDIA_S3_ENDPOINT: 'http://minio-staging:9000',
  MEDIA_S3_BUCKET: 'meeshy-media-staging',
  MEDIA_S3_ACCESS_KEY_ID: 'gateway',
  MEDIA_S3_SECRET_ACCESS_KEY: 'secret-de-test-assez-long',
};

describe('mediaS3ConfigFromEnv', () => {
  it('rien sans MEDIA_S3_MIRROR=on : le disque seul, comme aujourd’hui', () => {
    expect(mediaS3ConfigFromEnv({})).toEqual({ kind: 'local-only' });
    expect(mediaS3ConfigFromEnv({ ...COMPLETE, MEDIA_S3_MIRROR: 'off' })).toEqual({ kind: 'local-only' });
  });

  it('une configuration complète désigne un seau privé, en chemin (MinIO)', () => {
    expect(mediaS3ConfigFromEnv(COMPLETE)).toEqual({
      kind: 'mirror',
      endpoint: 'http://minio-staging:9000',
      bucket: 'meeshy-media-staging',
      region: 'us-east-1',
      accessKeyId: 'gateway',
      secretAccessKey: 'secret-de-test-assez-long',
      forcePathStyle: true,
    });
  });

  it.each(['MEDIA_S3_ENDPOINT', 'MEDIA_S3_BUCKET', 'MEDIA_S3_ACCESS_KEY_ID', 'MEDIA_S3_SECRET_ACCESS_KEY'])(
    'sans %s, le miroir n’existe pas, et la raison le nomme',
    (missing) => {
      const env: Record<string, string> = { ...COMPLETE };
      delete env[missing];
      expect(mediaS3ConfigFromEnv(env)).toEqual({ kind: 'misconfigured', missing: [missing] });
    },
  );

  it('un point d’accès qui n’est pas une URL http(s) est refusé', () => {
    expect(mediaS3ConfigFromEnv({ ...COMPLETE, MEDIA_S3_ENDPOINT: 'minio:9000' })).toEqual({ kind: 'misconfigured', missing: ['MEDIA_S3_ENDPOINT'] });
  });
});

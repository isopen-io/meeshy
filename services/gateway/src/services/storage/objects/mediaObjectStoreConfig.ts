/**
 * La configuration du stockage des médias (#11267), lue dans l'environnement.
 *
 * `MEDIA_S3_MIRROR=on` ouvre l'écriture en double et la lecture de repli dans
 * un seau S3 ; sans lui, le disque seul sert, comme avant ce lot. Un miroir à
 * moitié configuré n'existe PAS : il retombe sur le disque et nomme ce qui
 * manque (jamais le secret lui-même).
 */
export type MediaS3Config =
  | { readonly kind: 'local-only' }
  | { readonly kind: 'misconfigured'; readonly missing: readonly string[] }
  | {
      readonly kind: 'mirror';
      readonly endpoint: string;
      readonly bucket: string;
      readonly region: string;
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
      readonly forcePathStyle: boolean;
    };

const REQUIRED = ['MEDIA_S3_ENDPOINT', 'MEDIA_S3_BUCKET', 'MEDIA_S3_ACCESS_KEY_ID', 'MEDIA_S3_SECRET_ACCESS_KEY'] as const;

export function mediaS3ConfigFromEnv(env: Readonly<Record<string, string | undefined>>): MediaS3Config {
  if ((env.MEDIA_S3_MIRROR ?? '').trim().toLowerCase() !== 'on') return { kind: 'local-only' };
  const value = (name: string) => (env[name] ?? '').trim();
  const missing = REQUIRED.filter((name) => value(name) === '' || (name === 'MEDIA_S3_ENDPOINT' && !/^https?:\/\/[^\s/]+/.test(value(name))));
  if (missing.length > 0) return { kind: 'misconfigured', missing };
  return {
    kind: 'mirror',
    endpoint: value('MEDIA_S3_ENDPOINT'),
    bucket: value('MEDIA_S3_BUCKET'),
    region: value('MEDIA_S3_REGION') || 'us-east-1',
    accessKeyId: value('MEDIA_S3_ACCESS_KEY_ID'),
    secretAccessKey: value('MEDIA_S3_SECRET_ACCESS_KEY'),
    forcePathStyle: value('MEDIA_S3_FORCE_PATH_STYLE').toLowerCase() !== 'false',
  };
}

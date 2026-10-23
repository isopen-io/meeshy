import { S3Client } from '@aws-sdk/client-s3';
import { enhancedLogger } from '../../../utils/logger-enhanced';
import { LocalObjectStore } from './LocalObjectStore';
import type { MediaObjectStore } from './MediaObjectStore';
import { MirroredObjectStore } from './MirroredObjectStore';
import { S3ObjectStore } from './S3ObjectStore';
import { mediaS3ConfigFromEnv, type MediaS3Config } from './mediaObjectStoreConfig';

const logger = enhancedLogger.child({ module: 'mediaObjectStore' });

export type MediaObjectStores = {
  /** Ce que les écrivains et la route de fichiers emploient : le disque, ou le disque doublé du seau. */
  readonly store: MediaObjectStore;
  readonly local: LocalObjectStore;
  /** Le seau seul, `null` sans miroir configuré. */
  readonly mirror: S3ObjectStore | null;
  readonly config: MediaS3Config;
};

export function s3ObjectStoreFrom(config: Extract<MediaS3Config, { kind: 'mirror' }>): S3ObjectStore {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return new S3ObjectStore({ client, bucket: config.bucket });
}

/** Le stockage des médias que l'environnement désigne ; un miroir mal configuré retombe sur le disque, en le disant. */
export function mediaObjectStoresFromEnv(env: Readonly<Record<string, string | undefined>>, uploadRoot: string): MediaObjectStores {
  const local = new LocalObjectStore(uploadRoot);
  const config = mediaS3ConfigFromEnv(env);
  if (config.kind === 'misconfigured') logger.warn('media S3 mirror misconfigured, local disk only', { missing: config.missing });
  if (config.kind !== 'mirror') return { store: local, local, mirror: null, config };
  const mirror = s3ObjectStoreFrom(config);
  return { store: new MirroredObjectStore({ primary: local, mirror }), local, mirror, config };
}

let processStores: MediaObjectStores | undefined;

/** L'instance du processus, lue une fois : la route de fichiers et, demain, le worker média (#11264). */
export function processMediaObjectStores(): MediaObjectStores {
  processStores ??= mediaObjectStoresFromEnv(process.env, process.env.UPLOAD_PATH || 'uploads/attachments');
  return processStores;
}

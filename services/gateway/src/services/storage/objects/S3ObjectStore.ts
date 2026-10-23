import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { assertSafeStorageKey, isSafeStorageKey, type ByteRange, type MediaObjectStore, type ObjectBody, type StoredObjectHead } from './MediaObjectStore';

/** Ce que ce magasin demande d'un client S3 : `send`. Le vrai `S3Client` le satisfait, un double aussi. */
export type S3Like = { send(command: unknown): Promise<unknown> };

type HeadOutput = { ContentLength?: number; ETag?: string; LastModified?: Date; ContentType?: string };
type GetOutput = { Body?: unknown };

const isNotFound = (error: unknown): boolean => {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return candidate?.$metadata?.httpStatusCode === 404 || candidate?.name === 'NotFound' || candidate?.name === 'NoSuchKey';
};

/**
 * Un seau S3 vu comme un stockage d'objets (#11267) — MinIO en staging, R2 ou
 * S3 plus tard (même API). Aucune ACL n'est posée : le seau reste PRIVÉ, et les
 * clients ne lisent ses octets que par la passerelle.
 */
export class S3ObjectStore implements MediaObjectStore {
  private readonly client: S3Like;
  private readonly bucket: string;

  constructor(options: { readonly client: S3Like; readonly bucket: string }) {
    this.client = options.client;
    this.bucket = options.bucket;
  }

  async head(key: string): Promise<StoredObjectHead | null> {
    if (!isSafeStorageKey(key)) return null;
    try {
      const output = (await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))) as HeadOutput;
      return {
        size: output.ContentLength ?? 0,
        etag: output.ETag ?? '""',
        lastModified: output.LastModified ?? null,
        contentType: output.ContentType ?? null,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async read(key: string, range?: ByteRange): Promise<Readable | null> {
    if (!isSafeStorageKey(key)) return null;
    try {
      const output = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, ...(range === undefined ? {} : { Range: `bytes=${range.start}-${range.end}` }) }),
      )) as GetOutput;
      return output.Body instanceof Readable ? output.Body : null;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async write(key: string, object: ObjectBody): Promise<void> {
    assertSafeStorageKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: object.body,
        ContentLength: object.size,
        ...(object.contentType === undefined ? {} : { ContentType: object.contentType }),
      }),
    );
  }

  async remove(key: string): Promise<void> {
    if (!isSafeStorageKey(key)) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

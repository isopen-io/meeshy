/**
 * LE STOCKAGE DES OCTETS D'UN MÉDIA, PAR CLÉ (#11267).
 *
 * Une clé de stockage est le chemin RELATIF qu'une ligne porte déjà
 * (`MessageAttachment.fileUrl` sous sa forme de clé, `storageKeyFromMediaUrl`) :
 * elle ne change pas quand les octets changent de support. Trois supports :
 * - `LocalObjectStore` — le volume des dépôts d'aujourd'hui (`UPLOAD_PATH`) ;
 * - `S3ObjectStore` — un seau S3 (MinIO en staging, R2 ou S3 plus tard) ;
 * - `MirroredObjectStore` — les deux : écriture en double, lecture sur le disque
 *   puis dans le seau.
 *
 * Les envois comme le worker média (#11264) écrivent par cette interface ; la
 * lecture des clients passe TOUJOURS par la passerelle (ses gardes de lecteur),
 * jamais par une adresse du seau. Aucune implémentation ne pose d'ACL publique.
 */
import type { Readable } from 'node:stream';

export type StoredObjectHead = {
  readonly size: number;
  /** Validateur FORT des octets servis (ETag HTTP). */
  readonly etag: string;
  readonly lastModified: Date | null;
  readonly contentType: string | null;
};

export type ByteRange = { readonly start: number; readonly end: number };

export type ObjectBody = {
  readonly body: Buffer | Readable;
  /** La taille exacte : S3 l'exige pour un flux. */
  readonly size: number;
  readonly contentType?: string;
};

export interface MediaObjectStore {
  /** `null` si la clé n'existe pas (ou n'est pas une clé sûre). */
  head(key: string): Promise<StoredObjectHead | null>;
  /** Le flux des octets (bornes INCLUSES pour une plage), `null` si la clé n'existe pas. */
  read(key: string, range?: ByteRange): Promise<Readable | null>;
  /** Écrit ou remplace ; lève sur une clé non sûre ou une panne du support. */
  write(key: string, object: ObjectBody): Promise<void>;
  /** Idempotent : effacer une clé absente ne lève pas. */
  remove(key: string): Promise<void>;
}

/**
 * Une clé sûre : relative, en `/`, sans segment vide, `.`/`..`, ni segment caché
 * (`.tus-resumable/` porte les envois EN COURS, jamais un média), ni schéma.
 */
export function isSafeStorageKey(key: string): boolean {
  if (key.length === 0 || key.length > 1024 || key.startsWith('/') || key.includes('\\') || key.includes('://')) return false;
  return key.split('/').every((segment) => segment.length > 0 && !segment.startsWith('.'));
}

export function assertSafeStorageKey(key: string): void {
  if (!isSafeStorageKey(key)) throw new Error('unsafe storage key');
}

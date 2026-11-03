/**
 * **LE REGISTRE DE CE QUI EST DÉJÀ DANS LA GALERIE** (#14641) — une empreinte
 * SHA-256 des octets d'un média → « déjà enregistré ». Le saver de la coque le
 * consulte avant d'écrire : des octets déjà présents ne sont jamais réécrits,
 * quel que soit leur nom ou la porte qui les envoie (visionneuse, menu d'une
 * pièce, réception automatique, capture d'appel, export).
 *
 * Le registre est celui de l'APPAREIL (la galerie l'est aussi) : deux comptes
 * sur un même téléphone partagent la même galerie, donc le même registre.
 * Il vit dans IndexedDB, qui survit au redémarrage de la coque.
 *
 * **Meilleur effort, jamais un échec.** IndexedDB absente, refusée ou pleine :
 * `has` rend `false`, `mark` ne fait rien — l'enregistrement se fait comme
 * avant ce lot, sans déduplication.
 */
export type GallerySavedRegistry = {
  readonly has: (digest: string) => Promise<boolean>;
  readonly mark: (digest: string) => Promise<void>;
};

export const GALLERY_SAVED_DB_NAME = 'meeshy-gallery';
export const GALLERY_SAVED_DB_VERSION = 1;
export const GALLERY_SAVED_STORE_NAME = 'saved';

/**
 * Au-delà, les octets ne sont pas relus en entier (`crypto.subtle` n'a pas de
 * hachage en flux : une vidéo de plusieurs centaines de mégaoctets serait
 * copiée en mémoire pour une clé) : l'empreinte porte alors la taille, le
 * début et la fin du fichier, préfixée autrement pour ne jamais croiser une
 * empreinte entière.
 */
export const GALLERY_DIGEST_FULL_MAX_BYTES = 32 * 1024 * 1024;
export const GALLERY_DIGEST_SAMPLE_BYTES = 4 * 1024 * 1024;

export type GalleryDigestLimits = { readonly fullMaxBytes?: number; readonly sampleBytes?: number };

const hex = (buffer: ArrayBuffer): string => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

async function sampledBytes(blob: Blob, sampleBytes: number): Promise<ArrayBuffer> {
  const size = new TextEncoder().encode(`${blob.size}:`);
  const head = new Uint8Array(await blob.slice(0, sampleBytes).arrayBuffer());
  const tail = new Uint8Array(await blob.slice(blob.size - sampleBytes).arrayBuffer());
  const joined = new Uint8Array(size.length + head.length + tail.length);
  joined.set(size, 0);
  joined.set(head, size.length);
  joined.set(tail, size.length + head.length);
  return joined.buffer;
}

export async function galleryDigest(blob: Blob, limits: GalleryDigestLimits = {}): Promise<string> {
  const { fullMaxBytes = GALLERY_DIGEST_FULL_MAX_BYTES, sampleBytes = GALLERY_DIGEST_SAMPLE_BYTES } = limits;
  if (blob.size <= fullMaxBytes) return `sha256:${hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))}`;
  return `sha256-sampled:${hex(await crypto.subtle.digest('SHA-256', await sampledBytes(blob, sampleBytes)))}`;
}

export const NULL_GALLERY_SAVED_REGISTRY: GallerySavedRegistry = { has: async () => false, mark: async () => undefined };

export function memoryGallerySavedRegistry(): GallerySavedRegistry {
  const digests = new Set<string>();
  return {
    has: async (digest) => digests.has(digest),
    mark: async (digest) => {
      digests.add(digest);
    },
  };
}

function transact<T>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest,
  read: (request: IDBRequest) => T,
  fallback: T,
): Promise<T> {
  return new Promise((resolve) => {
    try {
      const open = factory.open(GALLERY_SAVED_DB_NAME, GALLERY_SAVED_DB_VERSION);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(GALLERY_SAVED_STORE_NAME)) open.result.createObjectStore(GALLERY_SAVED_STORE_NAME);
      };
      open.onerror = () => resolve(fallback);
      open.onsuccess = () => {
        const db = open.result;
        try {
          const transaction = db.transaction(GALLERY_SAVED_STORE_NAME, mode);
          const request = work(transaction.objectStore(GALLERY_SAVED_STORE_NAME));
          const settle = () => {
            db.close();
            resolve(fallback);
          };
          transaction.oncomplete = () => {
            db.close();
            resolve(read(request));
          };
          transaction.onerror = settle;
          transaction.onabort = settle;
        } catch {
          db.close();
          resolve(fallback);
        }
      };
    } catch {
      resolve(fallback);
    }
  });
}

export function idbGallerySavedRegistry(
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
): GallerySavedRegistry {
  if (factory === undefined) return NULL_GALLERY_SAVED_REGISTRY;
  return {
    has: (digest) => transact(factory, 'readonly', (store) => store.get(digest), (request) => request.result !== undefined, false),
    mark: (digest) => transact(factory, 'readwrite', (store) => store.put(Date.now(), digest), () => undefined, undefined),
  };
}

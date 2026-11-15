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
 * `lookup` rend `null`, `mark` et `forget` ne font rien — l'enregistrement se
 * fait comme avant ce lot, sans déduplication.
 *
 * **Une entrée retient OÙ le média a été écrit** (#14654) : le chemin que la
 * galerie a rendu, pour que le saver vérifie, avant de refuser, que le fichier
 * est toujours là — l'utilisateur a pu le supprimer de sa galerie. Une entrée
 * écrite avant ce lot (un horodatage seul) n'a pas de chemin : `path` y est
 * `null`, et elle reste « déjà enregistré » (règle écrite dans le saver).
 */
export type GallerySavedEntry = { readonly path: string | null };

export type GallerySavedRegistry = {
  readonly lookup: (digest: string) => Promise<GallerySavedEntry | null>;
  readonly mark: (digest: string, path: string | null) => Promise<void>;
  readonly forget: (digest: string) => Promise<void>;
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

export const NULL_GALLERY_SAVED_REGISTRY: GallerySavedRegistry = {
  lookup: async () => null,
  mark: async () => undefined,
  forget: async () => undefined,
};

export function memoryGallerySavedRegistry(): GallerySavedRegistry {
  const entries = new Map<string, GallerySavedEntry>();
  return {
    lookup: async (digest) => entries.get(digest) ?? null,
    mark: async (digest, path) => {
      entries.set(digest, { path });
    },
    forget: async (digest) => {
      entries.delete(digest);
    },
  };
}

type StoredEntry = { readonly savedAt: number; readonly path: string | null };

/** Une ligne lue : l'objet de ce lot, ou l'horodatage seul d'une version antérieure (#14641), sans chemin. */
function entryOf(stored: unknown): GallerySavedEntry | null {
  if (stored === undefined || stored === null) return null;
  const path = (stored as { readonly path?: unknown }).path;
  return { path: typeof path === 'string' && path !== '' ? path : null };
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
    lookup: (digest) => transact(factory, 'readonly', (store) => store.get(digest), (request) => entryOf(request.result), null),
    mark: (digest, path) => {
      const stored: StoredEntry = { savedAt: Date.now(), path };
      return transact(factory, 'readwrite', (store) => store.put(stored, digest), () => undefined, undefined);
    },
    forget: (digest) => transact(factory, 'readwrite', (store) => store.delete(digest), () => undefined, undefined),
  };
}

/**
 * **LE CHECKPOINT D'UN ENVOI TUS** (#11311, W5) — ce qui permet à un envoi
 * coupé de reprendre là où la passerelle l'a laissé, après un rechargement de
 * la page ou une mise en arrière-plan qui l'a tuée.
 *
 * Miroir de `TusUploadCheckpointStore` côté iOS (`TusUploadManager.swift:449-520`) :
 * une ligne par envoi, écrite après la création de la session puis après chaque
 * tranche acceptée, effacée à la fin. Le web ne hache pas les octets (un
 * fichier de plusieurs centaines de mégaoctets ne se relit pas pour une clé) :
 * l'EMPREINTE est celle que `tus-js-client` retient — nom, taille, date de
 * modification, type — plus ce qui change l'objet créé côté serveur (base de
 * l'API, contexte, aperçu flou). Un `File` relu depuis IndexedDB (la file
 * d'envoi) ou re-choisi dans le sélecteur garde ces quatre valeurs.
 *
 * **Meilleur effort, jamais un échec.** IndexedDB absente, refusée ou pleine :
 * `find` rend `null`, `save` et `remove` ne font rien, et l'envoi se déroule
 * comme avant ce lot. Une ligne illisible est ignorée, jamais rendue.
 */
export const TUS_CHECKPOINT_DB_NAME = 'meeshy-tus';
export const TUS_CHECKPOINT_DB_VERSION = 1;
export const TUS_CHECKPOINT_STORE_NAME = 'checkpoints';

/** Les sessions de la passerelle sont ramassées après 24 h : un checkpoint plus vieux que 22 h (2 h de marge,
 * comme iOS) pointe vers une adresse qui répondra 404 — on le lâche avant de le payer. */
export const TUS_CHECKPOINT_MAX_AGE_MS = 22 * 60 * 60 * 1000;

/** Le média qu'un envoi de fond a terminé pendant que la page était absente — l'accusé de la dernière tranche
 * (`tus-handler.ts:612-652`), rangé par le service worker (`public/sw-background-upload.js`). */
export type TusFinishedMedia = {
  readonly postMediaId: string;
  readonly fileUrl: string;
  readonly mimeType: string;
  readonly thumbHash?: string;
};

export type TusCheckpoint = {
  /** L'adresse de la session, telle que `Location` l'a donnée (résolue contre la base). */
  readonly location: string;
  /** Le dernier offset ACCEPTÉ par la passerelle — un repère : `HEAD` fait foi à la reprise. */
  readonly offset: number;
  readonly fileSize: number;
  readonly fingerprint: string;
  readonly savedAt: number;
  /** L'identifiant de l'envoi de fond (Background Fetch) qui porte le reste du fichier, tant qu'il tourne. */
  readonly background?: string | undefined;
  /** Posé par le worker quand l'envoi de fond a abouti : la page suivante rend ce média sans réseau. */
  readonly finished?: TusFinishedMedia | undefined;
};

export type TusCheckpointStore = {
  readonly find: (fingerprint: string) => Promise<TusCheckpoint | null>;
  readonly save: (checkpoint: TusCheckpoint) => Promise<void>;
  readonly remove: (fingerprint: string) => Promise<void>;
};

export function tusFingerprint(params: {
  readonly file: File;
  readonly base: string;
  readonly uploadContext: string;
  readonly thumbHash?: string;
}): string {
  const { file, base, uploadContext, thumbHash } = params;
  return JSON.stringify([base, uploadContext, thumbHash ?? '', file.name, file.size, file.lastModified, file.type]);
}

const isFinishedMedia = (value: unknown): value is TusFinishedMedia => {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row['postMediaId'] === 'string' &&
    row['postMediaId'] !== '' &&
    typeof row['fileUrl'] === 'string' &&
    typeof row['mimeType'] === 'string' &&
    (row['thumbHash'] === undefined || typeof row['thumbHash'] === 'string')
  );
};

const isCheckpoint = (value: unknown): value is TusCheckpoint => {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row['location'] === 'string' &&
    row['location'] !== '' &&
    typeof row['fingerprint'] === 'string' &&
    typeof row['offset'] === 'number' &&
    Number.isFinite(row['offset']) &&
    typeof row['fileSize'] === 'number' &&
    Number.isFinite(row['fileSize']) &&
    typeof row['savedAt'] === 'number' &&
    (row['background'] === undefined || typeof row['background'] === 'string') &&
    (row['finished'] === undefined || isFinishedMedia(row['finished']))
  );
};

function transact<T>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest,
  read: (request: IDBRequest) => T,
  fallback: T,
): Promise<T> {
  return new Promise((resolve) => {
    try {
      const open = factory.open(TUS_CHECKPOINT_DB_NAME, TUS_CHECKPOINT_DB_VERSION);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(TUS_CHECKPOINT_STORE_NAME)) open.result.createObjectStore(TUS_CHECKPOINT_STORE_NAME);
      };
      open.onerror = () => resolve(fallback);
      open.onsuccess = () => {
        const db = open.result;
        try {
          const transaction = db.transaction(TUS_CHECKPOINT_STORE_NAME, mode);
          const request = work(transaction.objectStore(TUS_CHECKPOINT_STORE_NAME));
          const settle = (value: T) => () => {
            db.close();
            resolve(value);
          };
          transaction.oncomplete = () => {
            db.close();
            resolve(read(request));
          };
          transaction.onerror = settle(fallback);
          transaction.onabort = settle(fallback);
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

export function idbTusCheckpointStore(factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB): TusCheckpointStore {
  if (factory === undefined) return noTusCheckpoints;
  return {
    find: (fingerprint) =>
      transact(
        factory,
        'readonly',
        (store) => store.get(fingerprint),
        (request): TusCheckpoint | null => (isCheckpoint(request.result) && request.result.fingerprint === fingerprint ? request.result : null),
        null,
      ),
    save: (checkpoint) =>
      transact(factory, 'readwrite', (store) => store.put({ ...checkpoint }, checkpoint.fingerprint), () => undefined, undefined),
    remove: (fingerprint) => transact(factory, 'readwrite', (store) => store.delete(fingerprint), () => undefined, undefined),
  };
}

const noTusCheckpoints: TusCheckpointStore = {
  find: async () => null,
  save: async () => undefined,
  remove: async () => undefined,
};

const leased = new Set<string>();

/**
 * **UNE SESSION TUS N'A QU'UN ENVOI À LA FOIS** — miroir de `TusUploadLeases`
 * (iOS). Le studio pré-monte un fond que la publication remonte ensuite : deux
 * envois des mêmes octets qui se partageraient une session écriraient chacun
 * leur offset sur la même ligne. Rend la libération, ou `null` quand un autre
 * envoi tient déjà l'empreinte — l'appelant envoie alors SANS checkpoint.
 */
export function claimTusLease(fingerprint: string): (() => void) | null {
  if (leased.has(fingerprint)) return null;
  leased.add(fingerprint);
  return () => void leased.delete(fingerprint);
}

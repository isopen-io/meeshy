import { photoTrackOf } from '@meeshy/shared/utils/game/photo-catch-up';

import type { PhotoEnv as DevelopEnv } from '@/lib/media/photo-develop';

import type { PhotoEmblem, PhotoMoment } from './moments';

/**
 * LE CARNET DE PROGRESSION (#9382, v2 #10161) — conception, partie VI : « le
 * carnet de progression garde ces photos et montre le chemin parcouru ». Il vit
 * sur l'appareil, en IndexedDB, dans UNE BASE PAR COMPTE (D-154,
 * `meeshy-game-notebook-<userId>`) : « la photo reste sur l'appareil tant qu'on
 * ne la partage pas ».
 *
 * Une entrée par MOMENT (son identité, `moments.ts`) : garder une photo prend
 * la place de l'attente du même moment, une reprise remplace la précédente.
 * Une entrée NEUVE garde l'image 9:16 composée, sa SOURCE (la photo réduite,
 * `photo-develop.ts`) et sa RECETTE (cadre, pose, message, recadrage…) : le
 * 1:1 se recompose au partage. Les anciennes entrées se relisent telles
 * qu'écrites (deux images, sans recette).
 *
 * « Plus tard » n'expire plus : une entrée en attente reste jusqu'à ce qu'on la
 * photographie ou la retire. Et « En attente » ne garde que les moments qui ne
 * se DÉDUISENT pas du jeu : une étape de piste reportée se rattrape
 * (`photo-catch-up.ts`), elle n'apparaît qu'une fois.
 *
 * Chaque accès au stockage est sous `try/catch` : un stockage refusé se lit
 * « carnet vide » à la lecture ; à l'écriture, « plus de place » (quota) se
 * distingue de « indisponible », pour que l'écran DESSINE l'échec de place.
 */

export type NotebookMode = 'selfie' | 'card' | 'gallery';

/** Le recadrage de la photo dans la fenêtre du cadre : décalage (fractions) et zoom. */
export type NotebookCrop = { readonly x: number; readonly y: number; readonly zoom: number };

/** LA RECETTE d'une photo (§ 5.13) : de quoi la recomposer. Chaque champ est facultatif. */
export type NotebookRecipe = {
  readonly frameId?: string;
  readonly pose?: string;
  readonly message?: string;
  readonly crop?: NotebookCrop;
  /** Selfie : oui ; galerie : non. */
  readonly mirror?: boolean;
  readonly showFlame?: boolean;
  readonly showLink?: boolean;
  /** La date de l'étape (ISO). */
  readonly momentAt?: string;
};

export type NotebookEntry = NotebookRecipe & {
  /** L'identité du moment : une entrée par moment. */
  readonly id: string;
  readonly momentId: string;
  readonly emblem: PhotoEmblem;
  readonly kicker: string;
  readonly title: string;
  readonly status: 'pending' | 'kept';
  readonly createdAt: string;
  /** Écrit par les versions d'avant #10161 ; plus jamais relu ni écrit. */
  readonly expiresAt?: string | null;
  readonly mode?: NotebookMode;
  readonly story?: Blob;
  /** Les anciennes entrées seulement : une entrée neuve recompose le 1:1. */
  readonly square?: Blob;
  /** La photo d'origine, réduite (1 440 px, JPEG q0,85) ; absente d'une carte seule et des anciennes entrées. */
  readonly source?: Blob;
};

export type NotebookBackend = {
  readonly put: (entry: NotebookEntry) => Promise<void>;
  readonly get: (id: string) => Promise<NotebookEntry | undefined>;
  readonly all: () => Promise<readonly NotebookEntry[]>;
  readonly remove: (id: string) => Promise<void>;
  /** Vrai quand la base a été RENDUE (suppression demandée) : il faut la rouvrir. */
  readonly released?: () => boolean;
};

export type KeptPhoto = {
  readonly story: Blob;
  readonly mode: NotebookMode;
  readonly source?: Blob | null;
  readonly recipe?: NotebookRecipe;
};

/** `no-space` : le quota est atteint, l'écran le dessine ; `unavailable` : le carnet ne s'ouvre pas. Dans les deux cas, AUCUNE entrée n'est créée. */
export type KeepOutcome = 'kept' | 'no-space' | 'unavailable';

/** L'ancien carnet partagé de l'appareil (D-154) : `quarantined` quand il ne peut être attribué à aucun compte. */
export type LegacyState = 'none' | 'quarantined';

export type Notebook = {
  readonly defer: (moment: PhotoMoment) => Promise<boolean>;
  readonly keep: (moment: PhotoMoment, photo: KeptPhoto) => Promise<KeepOutcome>;
  readonly list: () => Promise<readonly NotebookEntry[]>;
  readonly remove: (id: string) => Promise<boolean>;
  /** Absent : l'environnement ne connaît pas d'ancien carnet. */
  readonly legacy?: () => Promise<LegacyState>;
  readonly discardLegacy?: () => Promise<boolean>;
};

export type RetakeChoice = 'same-photo' | 'selfie' | 'card';

/** Ce qu'une entrée propose à la reprise : la même photo seulement si sa source est gardée. */
export const retakeChoices = (entry: NotebookEntry): readonly RetakeChoice[] =>
  entry.source === undefined ? ['selfie', 'card'] : ['same-photo', 'selfie', 'card'];

/** « En attente » : les moments NON déductibles ; une étape de piste ne paraît que dans « À rattraper ». */
export const pendingOf = (entries: readonly NotebookEntry[]): readonly NotebookEntry[] =>
  entries.filter((entry) => entry.status === 'pending' && photoTrackOf(entry.momentId) === null);

/** La place qu'occupe le carnet, en octets. */
export const notebookBytes = (entries: readonly NotebookEntry[]): number =>
  entries.reduce((total, entry) => total + (entry.story?.size ?? 0) + (entry.square?.size ?? 0) + (entry.source?.size ?? 0), 0);

/** La source gardée : bornée à 1 440 px de grand côté (§ 5.13). */
export const NOTEBOOK_SOURCE_EDGE = 1440;
export const NOTEBOOK_SOURCE_QUALITY = 0.85;

/**
 * La photo d'origine, réduite pour le carnet, par le développement UNIQUE des
 * photos (`photo-develop.ts`) — sans look : on recomposera depuis l'image prise,
 * jamais depuis une image déjà retouchée. Jamais en miroir : la recette dit
 * `mirror`. `null` : le navigateur ne sait pas, la photo se garde sans source.
 */
export async function developNotebookSource(
  photo: { readonly image: CanvasImageSource; readonly width: number; readonly height: number },
  env?: DevelopEnv,
): Promise<Blob | null> {
  try {
    /* Chargé au GESTE « Garder » : la table de préchargement de l'entrée n'en paie rien. */
    const { browserPhotoEnv, developPhoto } = await import('@/lib/media/photo-develop');
    return await developPhoto({ image: photo.image, size: { width: photo.width, height: photo.height } }, env ?? browserPhotoEnv, {
      maxEdge: NOTEBOOK_SOURCE_EDGE,
      quality: NOTEBOOK_SOURCE_QUALITY,
      look: null,
    });
  } catch {
    return null;
  }
}

/** La place, dite dans la langue du lecteur : Ko sous le mégaoctet, Mo au-delà (une décimale). */
export const notebookSizeLabel = (bytes: number, language: string): string => {
  const mega = bytes >= 1_000_000;
  return new Intl.NumberFormat(language, { style: 'unit', unit: mega ? 'megabyte' : 'kilobyte', unitDisplay: 'short', maximumFractionDigits: mega ? 1 : 0 }).format(
    mega ? bytes / 1_000_000 : Math.max(1, Math.round(bytes / 1000)),
  );
};

const QUOTA_ERRORS: readonly string[] = ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'];

const isQuotaError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string' && QUOTA_ERRORS.includes(error.name);

export function createNotebook(params: {
  readonly backend: NotebookBackend | null;
  readonly now: () => Date;
  /** `navigator.storage.persist()` : demandé UNE fois, au premier « Garder ». */
  readonly persist?: () => Promise<unknown>;
  readonly legacy?: () => Promise<LegacyState>;
  readonly discardLegacy?: () => Promise<boolean>;
}): Notebook {
  const { backend, now, persist } = params;
  let persistAsked = false;

  const attempt = async (work: (store: NotebookBackend) => Promise<void>): Promise<boolean> => {
    if (backend === null) return false;
    try {
      await work(backend);
      return true;
    } catch {
      return false;
    }
  };

  const askPersistence = (): void => {
    if (persistAsked || persist === undefined) return;
    persistAsked = true;
    void persist().catch(() => undefined);
  };

  return {
    defer: (moment) =>
      attempt(async (store) => {
        if (photoTrackOf(moment.id) !== null) return;
        if ((await store.get(moment.id)) !== undefined) return;
        await store.put({
          id: moment.id,
          momentId: moment.id,
          emblem: moment.emblem,
          kicker: moment.kicker,
          title: moment.title,
          status: 'pending',
          createdAt: now().toISOString(),
        });
      }),

    keep: async (moment, photo) => {
      if (backend === null) return 'unavailable';
      askPersistence();
      try {
        await backend.put({
          ...photo.recipe,
          id: moment.id,
          momentId: moment.id,
          emblem: moment.emblem,
          kicker: moment.kicker,
          title: moment.title,
          status: 'kept',
          createdAt: now().toISOString(),
          mode: photo.mode,
          story: photo.story,
          ...(photo.source == null ? {} : { source: photo.source }),
        });
        return 'kept';
      } catch (error) {
        return isQuotaError(error) ? 'no-space' : 'unavailable';
      }
    },

    list: async () => {
      if (backend === null) return [];
      try {
        const entries = await backend.all();
        return [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      } catch {
        return [];
      }
    },

    remove: (id) => attempt((store) => store.remove(id)),

    ...(params.legacy === undefined ? {} : { legacy: params.legacy }),
    ...(params.discardLegacy === undefined ? {} : { discardLegacy: params.discardLegacy }),
  };
}

/** L'ancienne base, partagée par tous les comptes de l'appareil (D-154). */
export const LEGACY_NOTEBOOK_DB = 'meeshy-game-notebook';

/** La base du carnet d'UN compte. */
export const notebookDbName = (userId: string): string => `${LEGACY_NOTEBOOK_DB}-${userId}`;

const STORE = 'entries';

const settle = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB'));
  });

/** Une écriture ne vaut qu'à la fin de SA transaction : c'est là qu'un quota dépassé se déclare. */
const committed = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB'));
  });

const write = async (db: IDBDatabase, work: (store: IDBObjectStore) => IDBRequest): Promise<void> => {
  const transaction = db.transaction(STORE, 'readwrite');
  const done = committed(transaction);
  await Promise.all([settle(work(transaction.objectStore(STORE))), done]);
};

/** Les connexions que CET onglet tient, par base : une suppression les rend d'abord. */
const liveConnections = new Map<string, Set<() => void>>();

/** Rend toutes les connexions de cet onglet à la base `name` (avant de la supprimer). */
export function releaseNotebookConnections(name: string): void {
  [...(liveConnections.get(name) ?? [])].forEach((release) => release());
  liveConnections.delete(name);
}

/** Le carnet d'un compte sur IndexedDB ; `null` quand la base ne s'ouvre pas (absente, refusée, mode privé). */
export async function openIndexedDbBackend(factory: IDBFactory | undefined, name: string): Promise<NotebookBackend | null> {
  if (factory === undefined) return null;
  try {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    const db = await settle(request);
    let released = false;
    const release = (): void => {
      released = true;
      db.close();
      liveConnections.get(name)?.delete(release);
    };
    /* Une suppression (cet onglet ou un autre) prévient d'abord : on rend la base, sinon elle attend à jamais. */
    db.onversionchange = release;
    liveConnections.set(name, (liveConnections.get(name) ?? new Set()).add(release));
    const read = (): IDBObjectStore => db.transaction(STORE, 'readonly').objectStore(STORE);
    return {
      put: (entry) => write(db, (store) => store.put(entry)),
      get: async (id) => (await settle(read().get(id))) as NotebookEntry | undefined,
      all: async () => (await settle(read().getAll())) as NotebookEntry[],
      remove: (id) => write(db, (store) => store.delete(id)),
      released: () => released,
    };
  } catch {
    return null;
  }
}

/**
 * LE CARNET DU LECTEUR COURANT (D-154) : chaque appel lit l'identité connectée
 * et s'adresse à SA base, ouverte une fois par compte. Sans lecteur, aucune base
 * ne s'ouvre : chaque appel lève, ce que le carnet absorbe.
 */
export function accountBackend(params: { readonly reader: () => string | null; readonly open: (userId: string) => Promise<NotebookBackend | null> }): NotebookBackend {
  const opened = new Map<string, Promise<NotebookBackend | null>>();
  const ready = async (retry = true): Promise<NotebookBackend> => {
    const userId = params.reader();
    if (userId === null) throw new Error('Aucun compte');
    const pending = opened.get(userId) ?? params.open(userId);
    opened.set(userId, pending);
    const backend = await pending;
    if (backend === null) throw new Error('Carnet indisponible');
    if (backend.released?.() !== true) return backend;
    /* Sa base a été rendue (compte retiré) : l'entrée part, la prochaine ouverture en crée une neuve. */
    if (opened.get(userId) === pending) opened.delete(userId);
    if (!retry) throw new Error('Carnet indisponible');
    return ready(false);
  };
  return {
    put: async (entry) => (await ready()).put(entry),
    get: async (id) => (await ready()).get(id),
    all: async () => (await ready()).all(),
    remove: async (id) => (await ready()).remove(id),
  };
}

/**
 * Un carnet dont la base ne s'ouvre qu'AU PREMIER GESTE : l'écran Progression
 * ne paie pas l'ouverture d'IndexedDB tant que personne ne photographie ni ne
 * consulte. Une base qui ne s'ouvre pas fait lever chaque appel, ce que le
 * carnet absorbe (« non gardé », « carnet vide »).
 */
export function lazyBackend(open: () => Promise<NotebookBackend | null>): NotebookBackend {
  let opened: Promise<NotebookBackend | null> | null = null;
  const ready = async (): Promise<NotebookBackend> => {
    opened ??= open();
    const backend = await opened;
    if (backend === null) throw new Error('Carnet indisponible');
    return backend;
  };
  return {
    put: async (entry) => (await ready()).put(entry),
    get: async (id) => (await ready()).get(id),
    all: async () => (await ready()).all(),
    remove: async (id) => (await ready()).remove(id),
  };
}

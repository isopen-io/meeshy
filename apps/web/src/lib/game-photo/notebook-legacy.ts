import { LEGACY_NOTEBOOK_DB, notebookDbName, releaseNotebookConnections, type LegacyState, type NotebookBackend, type NotebookEntry } from './notebook';

export { LEGACY_NOTEBOOK_DB };

/**
 * L'ANCIEN CARNET PARTAGÉ (D-154, #10161, `apps/web/decisions.md`) — avant le
 * cloisonnement par compte, l'appareil gardait UNE base, sans identité de
 * compte. L'adopter « par le compte connecté à la première ouverture »
 * livrerait, sur un appareil partagé, les selfies d'un compte à un autre.
 *
 * Elle n'est donc ADOPTÉE que si l'appareil n'a connu qu'UN compte (le coffre
 * des jetons, l'étagère des caches et les clés rangées sous une identité n'en
 * nomment aucun autre). Sinon, et dans le doute, elle part en QUARANTAINE :
 * sa version monte et un magasin `quarantine` la marque — aucune version de
 * l'application ne la relit plus (les anciennes l'ouvraient en version 1 et
 * échouent), la marque est DÉFINITIVE, et le carnet propose de la supprimer.
 */

export type LegacyProbe = 'absent' | 'present' | 'quarantined';

export type LegacyNotebookStore = {
  readonly probe: () => Promise<LegacyProbe>;
  readonly readAll: () => Promise<readonly NotebookEntry[]>;
  readonly quarantine: () => Promise<void>;
  readonly discard: () => Promise<void>;
};

export type KeyedStorage = {
  readonly keys: () => readonly string[];
  readonly getItem: (key: string) => string | null;
};

/** Le coffre des jetons (`accounts.ts`, D-142) ; un témoin le relie au vrai coffre. */
const ACCOUNT_VAULT_KEY = 'meeshy.accounts';

/** Une identité qui ne correspond à aucun compte : posée quand un indice est illisible. */
const UNKNOWN_ACCOUNT = '\u0000unknown';

/** Une clé rangée sous une identité de compte : `…u_<id>` suivi d'un point ou de la fin. */
const SCOPED_KEY = /(?:^|\.)u_([^.]+)(?:\.|$)/;

/** Les clés EXACTES qui portent une identité nue (`purgeAccountLocalData`). */
const BARE_PREFIXES: readonly string[] = ['meeshy.draft.story.', 'meeshy.studio.audience.'];

function vaultAccounts(raw: string | null): readonly string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const accounts = typeof parsed === 'object' && parsed !== null && 'accounts' in parsed ? parsed.accounts : null;
    if (!Array.isArray(accounts)) return [UNKNOWN_ACCOUNT];
    return accounts.map((account: unknown) => {
      const user = typeof account === 'object' && account !== null && 'user' in account ? account.user : null;
      const id = typeof user === 'object' && user !== null && 'id' in user ? user.id : null;
      return typeof id === 'string' && id !== '' ? id : UNKNOWN_ACCOUNT;
    });
  } catch {
    return [UNKNOWN_ACCOUNT];
  }
}

function hintOf(key: string): string | null {
  const scoped = SCOPED_KEY.exec(key)?.[1];
  if (scoped !== undefined && scoped !== '') return scoped;
  const prefix = BARE_PREFIXES.find((candidate) => key.startsWith(candidate));
  const bare = prefix === undefined ? '' : key.slice(prefix.length);
  return bare === '' ? null : bare;
}

/** Les comptes qu'a connus l'appareil : le compte connecté, le coffre, et toute clé rangée sous une identité. */
export function knownAccountsOf(storage: KeyedStorage, current: string): ReadonlySet<string> {
  try {
    const hints = storage.keys().flatMap((key) => {
      const hint = hintOf(key);
      return hint === null ? [] : [hint];
    });
    return new Set([current, ...vaultAccounts(storage.getItem(ACCOUNT_VAULT_KEY)), ...hints]);
  } catch {
    return new Set([current, UNKNOWN_ACCOUNT]);
  }
}

async function adopt(legacy: LegacyNotebookStore, target: NotebookBackend): Promise<void> {
  const entries = await legacy.readAll();
  for (const entry of entries) {
    if ((await target.get(entry.id)) === undefined) await target.put(entry);
  }
  await legacy.discard();
}

/**
 * Règle le sort de l'ancien carnet pour le compte qui ouvre le sien : adoption
 * si `known` ne contient QUE lui, quarantaine sinon. Une adoption qui échoue
 * laisse l'ancienne base intacte (elle se retentera) ; rien ne lève.
 */
export async function settleLegacyNotebook(params: {
  readonly legacy: LegacyNotebookStore;
  readonly userId: string;
  readonly known: ReadonlySet<string>;
  readonly target: NotebookBackend;
}): Promise<LegacyState> {
  const { legacy, userId, known, target } = params;
  try {
    const probe = await legacy.probe();
    if (probe === 'absent') return 'none';
    if (probe === 'quarantined') return 'quarantined';
    const alone = known.size === 1 && known.has(userId);
    if (!alone) {
      await legacy.quarantine().catch(() => undefined);
      return 'quarantined';
    }
    await adopt(legacy, target);
    return 'none';
  } catch {
    return 'none';
  }
}

const STORE = 'entries';
const QUARANTINE_STORE = 'quarantine';

const settle = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB'));
  });

/**
 * Supprime une base sans jamais pendre : une connexion d'un autre onglet qui
 * n'écoute pas `versionchange` la tient — la suppression reste alors en file
 * et aboutira quand il la rendra (`blocked`), le geste rend la main.
 */
const deleteDatabase = (factory: IDBFactory, name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('IndexedDB'));
  });

/** Ouvre la base EXISTANTE sans jamais la créer : une base absente abandonne sa propre création. */
function openExisting(factory: IDBFactory): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = factory.open(LEGACY_NOTEBOOK_DB);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) request.transaction?.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => (request.error?.name === 'AbortError' ? resolve(null) : reject(request.error ?? new Error('IndexedDB')));
  });
}

/** L'ancien carnet sur IndexedDB. */
export function indexedDbLegacyStore(factory: IDBFactory): LegacyNotebookStore {
  return {
    probe: async () => {
      const db = await openExisting(factory);
      if (db === null) return 'absent';
      const state: LegacyProbe = db.objectStoreNames.contains(QUARANTINE_STORE) ? 'quarantined' : 'present';
      db.close();
      return state;
    },
    readAll: async () => {
      const db = await openExisting(factory);
      if (db === null || !db.objectStoreNames.contains(STORE)) {
        db?.close();
        return [];
      }
      try {
        return (await settle(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())) as NotebookEntry[];
      } finally {
        db.close();
      }
    },
    quarantine: async () => {
      const db = await openExisting(factory);
      if (db === null) return;
      const next = db.version + 1;
      db.close();
      await new Promise<void>((resolve, reject) => {
        const request = factory.open(LEGACY_NOTEBOOK_DB, next);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(QUARANTINE_STORE)) request.result.createObjectStore(QUARANTINE_STORE);
        };
        /* Un onglet d'une ancienne version tient la base : la marque se posera quand il la rendra. */
        request.onblocked = () => resolve();
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error ?? new Error('IndexedDB'));
      });
    },
    discard: async () => {
      await deleteDatabase(factory, LEGACY_NOTEBOOK_DB);
    },
  };
}

/**
 * « Retirer ce compte » : sa base du carnet part avec lui. Et si l'ancienne base
 * partagée attend encore son sort, elle part en QUARANTAINE : elle était peut-être
 * la sienne, et le compte qui reste seul ne doit pas l'adopter. Best-effort, silencieux.
 */
export async function forgetAccountNotebook(factory: IDBFactory | undefined, userId: string): Promise<void> {
  if (factory === undefined) return;
  try {
    releaseNotebookConnections(notebookDbName(userId));
    await deleteDatabase(factory, notebookDbName(userId));
  } catch {
    /* rien à effacer */
  }
  try {
    const legacy = indexedDbLegacyStore(factory);
    if ((await legacy.probe()) === 'present') await legacy.quarantine();
  } catch {
    /* rien à marquer */
  }
}


/**
 * LE BALAYAGE DU DÉMARRAGE (audit #10237) — un retrait qui n'a pas abouti (onglet
 * fermé avant la fin, base tenue par un autre onglet) laisse le carnet d'un
 * compte qui n'est plus au coffre. Au démarrage, hors première peinture, ses
 * bases partent. Ne part QUE la base d'un compte que l'appareil ne connaît plus
 * (`knownAccountsOf` : coffre, compte connecté, clés rangées sous son identité) ;
 * un coffre illisible n'efface rien, un navigateur sans `databases()` non plus.
 */
export async function sweepOrphanNotebooks(params: { readonly factory: IDBFactory | undefined; readonly storage: KeyedStorage; readonly current: string | null }): Promise<void> {
  const { factory, storage, current } = params;
  if (factory === undefined || typeof factory.databases !== 'function') return;
  const known = knownAccountsOf(storage, current ?? '');
  if (known.has(UNKNOWN_ACCOUNT)) return;
  try {
    const prefix = notebookDbName('');
    const orphans = (await factory.databases()).flatMap(({ name }) => {
      if (name === undefined || !name.startsWith(prefix)) return [];
      const owner = name.slice(prefix.length);
      return owner === '' || known.has(owner) ? [] : [owner];
    });
    await Promise.all(orphans.map((owner) => forgetAccountNotebook(factory, owner)));
  } catch {
    /* rien à balayer */
  }
}

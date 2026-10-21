import { describe, expect, test } from 'bun:test';

import { startMoment, flameMoment } from './moments';
import { accountBackend, createNotebook, notebookDbName, openIndexedDbBackend, type NotebookEntry } from './notebook';
import { forgetAccountNotebook, LEGACY_NOTEBOOK_DB, sweepOrphanNotebooks, type KeyedStorage } from './notebook-legacy';

/**
 * **LE CARNET D'UN COMPTE OUVERT DANS L'ONGLET S'EFFACE QUAND MÊME** (audit
 * #10237) — IndexedDB ne supprime une base qu'une fois TOUTES ses connexions
 * fermées : il les prévient (`versionchange`), et tant que l'une reste
 * ouverte la suppression reçoit `blocked` et attend. Le carnet gardait sa
 * connexion sans écouter : la suppression ne finissait jamais, et la promesse
 * qui l'attendait non plus.
 *
 * Ce témoin modélise le standard : connexions vivantes, `versionchange`,
 * `blocked`, transactions refusées sur une connexion fermée, et
 * `databases()` quand le navigateur l'expose.
 */

const image = (name: string) => new Blob([name], { type: 'image/png' });
const T0 = '2026-10-13T10:00:00.000Z';

type Connection = {
  onversionchange: (() => void) | null;
  closed: boolean;
  close(): void;
};

function specIndexedDb(options: { readonly databases?: boolean } = {}) {
  const bases = new Map<string, Map<string, NotebookEntry>>();
  const live = new Map<string, Set<Connection>>();
  const later = (run: () => void) => setTimeout(run, 0);
  const request = <T>(run: () => T) => {
    const req: { result: T | undefined; error: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null } = { result: undefined, error: null, onsuccess: null, onerror: null };
    later(() => {
      req.result = run();
      req.onsuccess?.();
    });
    return req;
  };
  const connect = (name: string): Connection & Record<string, unknown> => {
    const conn = {
      onversionchange: null as (() => void) | null,
      closed: false,
      objectStoreNames: { contains: () => bases.has(name) },
      createObjectStore: () => undefined,
      close() {
        conn.closed = true;
        live.get(name)?.delete(conn);
      },
      transaction: () => {
        if (conn.closed) throw new DOMException('The database connection is closing.', 'InvalidStateError');
        const rows = bases.get(name) ?? new Map<string, NotebookEntry>();
        const tx: { oncomplete: (() => void) | null; onabort: (() => void) | null; onerror: (() => void) | null; error: null; objectStore: () => unknown } = {
          oncomplete: null,
          onabort: null,
          onerror: null,
          error: null,
          objectStore: () => ({
            put: (value: NotebookEntry) => request(() => (rows.set(value.id, value), later(() => tx.oncomplete?.()), value.id)),
            get: (key: string) => request(() => rows.get(key)),
            getAll: () => request(() => [...rows.values()]),
            delete: (key: string) => request(() => (rows.delete(key), later(() => tx.oncomplete?.()), undefined)),
          }),
        };
        return tx;
      },
    };
    live.set(name, (live.get(name) ?? new Set()).add(conn));
    return conn;
  };
  const factory: Record<string, unknown> = {
    open: (name: string) => {
      const req: {
        result: unknown;
        error: unknown;
        transaction: { abort: () => void } | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onupgradeneeded: ((event: { oldVersion: number }) => void) | null;
      } = { result: undefined, error: null, transaction: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      later(() => {
        const fresh = !bases.has(name);
        const conn = connect(name);
        req.result = conn;
        if (fresh) {
          let aborted = false;
          req.transaction = { abort: () => void (aborted = true) };
          req.onupgradeneeded?.({ oldVersion: 0 });
          if (aborted) {
            conn.close();
            req.error = new DOMException('abort', 'AbortError');
            req.onerror?.();
            return;
          }
          bases.set(name, new Map());
        }
        req.onsuccess?.();
      });
      return req;
    },
    deleteDatabase: (name: string) => {
      const req: { result: undefined; error: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null; onblocked: (() => void) | null } = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      const finish = () => {
        bases.delete(name);
        req.onsuccess?.();
      };
      later(() => {
        [...(live.get(name) ?? [])].forEach((conn) => conn.onversionchange?.());
        if ((live.get(name)?.size ?? 0) === 0) {
          finish();
          return;
        }
        req.onblocked?.();
        const wait = setInterval(() => {
          if ((live.get(name)?.size ?? 0) > 0) return;
          clearInterval(wait);
          finish();
        }, 1);
      });
      return req;
    },
  };
  if (options.databases === true) factory.databases = async () => [...bases.keys()].map((name) => ({ name, version: 1 }));
  /** Un onglet d'une version qui n'écoute pas `versionchange` : sa connexion reste jusqu'à ce qu'il se ferme. */
  const deafTab = (name: string): Connection => {
    if (!bases.has(name)) bases.set(name, new Map());
    return connect(name);
  };
  return { factory: factory as unknown as IDBFactory, bases, deafTab };
}

const settled = async (until: () => boolean, budget = 200) => {
  for (let tick = 0; tick < budget && !until(); tick += 1) await new Promise((resolve) => setTimeout(resolve, 1));
};

const storageOf = (items: Record<string, string>): KeyedStorage => ({
  keys: () => Object.keys(items),
  getItem: (key) => items[key] ?? null,
});

const vaultOf = (...ids: readonly string[]) => JSON.stringify({ accounts: ids.map((id) => ({ user: { id, username: id, displayName: id }, lastActiveAt: 1 })) });

describe('supprimer le carnet d’un compte ouvert dans l’onglet', () => {
  test('le carnet OUVERT du compte retiré est effacé', async () => {
    const { factory, bases } = specIndexedDb();
    const backend = await openIndexedDbBackend(factory, notebookDbName('u-ada'));
    expect(backend).not.toBeNull();
    let done = false;
    void forgetAccountNotebook(factory, 'u-ada').then(() => (done = true));
    await settled(() => done && !bases.has(notebookDbName('u-ada')));
    expect(bases.has(notebookDbName('u-ada'))).toBe(false);
    expect(done).toBe(true);
  });

  test('un autre onglet qui tient la base sans l’écouter ne fait pas pendre le retrait ; la base part quand il se ferme', async () => {
    const { factory, bases, deafTab } = specIndexedDb();
    const tab = deafTab(notebookDbName('u-ada'));
    let done = false;
    void forgetAccountNotebook(factory, 'u-ada').then(() => (done = true));
    await settled(() => done);
    expect(done).toBe(true);
    expect(bases.has(notebookDbName('u-ada'))).toBe(true);
    tab.close();
    await settled(() => !bases.has(notebookDbName('u-ada')));
    expect(bases.has(notebookDbName('u-ada'))).toBe(false);
  });

  test('le compte retiré qui revient dans le même onglet retrouve un carnet qui garde — neuf', async () => {
    const { factory, bases } = specIndexedDb();
    const notebook = createNotebook({
      backend: accountBackend({ reader: () => 'u-ada', open: (userId) => openIndexedDbBackend(factory, notebookDbName(userId)) }),
      now: () => new Date(T0),
    });
    expect(await notebook.keep(startMoment(), { story: image('s'), mode: 'selfie' })).toBe('kept');
    await forgetAccountNotebook(factory, 'u-ada');
    await settled(() => !bases.has(notebookDbName('u-ada')));
    expect(await notebook.keep(flameMoment(7), { story: image('s'), mode: 'card' })).toBe('kept');
    expect((await notebook.list()).map((entry) => entry.id)).toEqual(['flame:7']);
  });
});

describe('au démarrage, les carnets des comptes qui ne sont plus au coffre partent', () => {
  test('seul le carnet d’un compte absent du coffre part ; l’ancienne base partagée et les autres bases restent', async () => {
    const { factory, bases, deafTab } = specIndexedDb({ databases: true });
    [notebookDbName('u-ada'), notebookDbName('u-bob'), LEGACY_NOTEBOOK_DB, 'meeshy-other'].forEach((name) => deafTab(name).close());
    await sweepOrphanNotebooks({ factory, storage: storageOf({ 'meeshy.accounts': vaultOf('u-bob') }), current: null });
    await settled(() => !bases.has(notebookDbName('u-ada')));
    expect([...bases.keys()].sort()).toEqual([LEGACY_NOTEBOOK_DB, 'meeshy-other', notebookDbName('u-bob')].sort());
  });

  test('le compte connecté garde son carnet même s’il manque au coffre', async () => {
    const { factory, bases, deafTab } = specIndexedDb({ databases: true });
    deafTab(notebookDbName('u-ada')).close();
    await sweepOrphanNotebooks({ factory, storage: storageOf({}), current: 'u-ada' });
    await settled(() => false, 5);
    expect(bases.has(notebookDbName('u-ada'))).toBe(true);
  });

  test('un coffre illisible n’efface rien', async () => {
    const { factory, bases, deafTab } = specIndexedDb({ databases: true });
    deafTab(notebookDbName('u-ada')).close();
    await sweepOrphanNotebooks({ factory, storage: storageOf({ 'meeshy.accounts': '{oops' }), current: null });
    await settled(() => false, 5);
    expect(bases.has(notebookDbName('u-ada'))).toBe(true);
  });

  test('sans `databases()` (ou sans IndexedDB), rien ne part et rien ne lève', async () => {
    const { factory, bases, deafTab } = specIndexedDb();
    deafTab(notebookDbName('u-ada')).close();
    await sweepOrphanNotebooks({ factory, storage: storageOf({}), current: null });
    await sweepOrphanNotebooks({ factory: undefined, storage: storageOf({}), current: null });
    expect(bases.has(notebookDbName('u-ada'))).toBe(true);
  });
});

import { describe, expect, test } from 'bun:test';

import { createNotebook, openIndexedDbBackend, type NotebookBackend, type NotebookEntry } from './notebook';
import { flameMoment, rankMoment, startMoment } from './moments';

/**
 * LE CARNET DE PROGRESSION (#9382) — conception, partie VI : « le carnet de
 * progression garde ces photos et montre le chemin parcouru ». Local à
 * l'appareil (IndexedDB), sans synchronisation tant qu'on ne l'active pas :
 * « la photo reste sur l'appareil ». « Plus tard » laisse le moment en attente
 * sept jours dans le carnet.
 *
 * Chaque accès au stockage est sous `try/catch` : un stockage refusé (mode
 * privé, quota) se lit « carnet vide » et « non gardé », jamais une exception.
 */

const memoryBackend = (): NotebookBackend & { readonly rows: Map<string, NotebookEntry> } => {
  const rows = new Map<string, NotebookEntry>();
  return {
    rows,
    put: async (entry) => void rows.set(entry.id, entry),
    get: async (id) => rows.get(id),
    all: async () => [...rows.values()],
    remove: async (id) => void rows.delete(id),
  };
};

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-05T10:00:00.000Z');
const image = (name: string) => new Blob([name], { type: 'image/png' });

const bench = (nowMs = T0) => {
  const backend = memoryBackend();
  let clock = nowMs;
  const notebook = createNotebook({ backend, now: () => new Date(clock) });
  return { backend, notebook, advance: (ms: number) => void (clock += ms) };
};

describe('« plus tard » : sept jours en attente', () => {
  test('le moment attend, avec son échéance à sept jours', async () => {
    const { notebook } = bench();
    expect(await notebook.defer(rankMoment({ rank: 'voix', division: 2 }))).toBe(true);
    const [entry] = await notebook.list();
    expect(entry?.status).toBe('pending');
    expect(entry?.expiresAt).toBe(new Date(T0 + 7 * DAY).toISOString());
    expect(entry?.title).toBe('Voix II');
  });

  test('il se retrouve tant que les sept jours ne sont pas écoulés', async () => {
    const { notebook, advance } = bench();
    await notebook.defer(startMoment());
    advance(6 * DAY);
    expect(await notebook.list()).toHaveLength(1);
  });

  test('il disparaît après sept jours, et le carnet le purge', async () => {
    const { notebook, advance, backend } = bench();
    await notebook.defer(startMoment());
    advance(7 * DAY + 1);
    expect(await notebook.list()).toEqual([]);
    expect(backend.rows.size).toBe(0);
  });

  test('différer deux fois le même moment ne repousse pas son échéance', async () => {
    const { notebook, advance } = bench();
    await notebook.defer(startMoment());
    advance(3 * DAY);
    await notebook.defer(startMoment());
    const [entry] = await notebook.list();
    expect(entry?.expiresAt).toBe(new Date(T0 + 7 * DAY).toISOString());
  });

  test('un moment déjà gardé ne redevient pas « en attente »', async () => {
    const { notebook } = bench();
    await notebook.keep(startMoment(), { story: image('s'), square: image('q'), mode: 'selfie' });
    await notebook.defer(startMoment());
    const [entry] = await notebook.list();
    expect(entry?.status).toBe('kept');
  });
});

describe('garder une photo', () => {
  test('les deux formats, le mode et la date de prise', async () => {
    const { notebook } = bench();
    expect(await notebook.keep(flameMoment(7), { story: image('s'), square: image('q'), mode: 'card' })).toBe(true);
    const [entry] = await notebook.list();
    expect(entry).toMatchObject({ status: 'kept', mode: 'card', momentId: 'flame:7', createdAt: new Date(T0).toISOString(), expiresAt: null });
    expect(entry?.story?.size).toBe(1);
    expect(entry?.square?.size).toBe(1);
  });

  test('garder une photo prend la place de l’attente du même moment', async () => {
    const { notebook } = bench();
    await notebook.defer(startMoment());
    await notebook.keep(startMoment(), { story: image('s'), square: image('q'), mode: 'selfie' });
    const all = await notebook.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe('kept');
  });

  test('une photo gardée ne s’efface JAMAIS toute seule', async () => {
    const { notebook, advance } = bench();
    await notebook.keep(startMoment(), { story: image('s'), square: image('q'), mode: 'selfie' });
    advance(400 * DAY);
    expect(await notebook.list()).toHaveLength(1);
  });

  test('le plus récent d’abord', async () => {
    const { notebook, advance } = bench();
    await notebook.keep(startMoment(), { story: image('s'), square: image('q'), mode: 'card' });
    advance(DAY);
    await notebook.keep(flameMoment(7), { story: image('s'), square: image('q'), mode: 'card' });
    expect((await notebook.list()).map((e) => e.momentId)).toEqual(['flame:7', 'start']);
  });

  test('retirer une entrée', async () => {
    const { notebook } = bench();
    await notebook.keep(startMoment(), { story: image('s'), square: image('q'), mode: 'card' });
    expect(await notebook.remove('start')).toBe(true);
    expect(await notebook.list()).toEqual([]);
  });
});

describe('un stockage qui refuse ne casse rien', () => {
  const broken: NotebookBackend = {
    put: async () => {
      throw new Error('quota');
    },
    get: async () => {
      throw new Error('fermé');
    },
    all: async () => {
      throw new Error('fermé');
    },
    remove: async () => {
      throw new Error('fermé');
    },
  };
  const notebook = createNotebook({ backend: broken, now: () => new Date(T0) });

  test('« non gardé » plutôt qu’une exception', async () => {
    expect(await notebook.keep(startMoment(), { story: image('s'), square: image('q'), mode: 'card' })).toBe(false);
    expect(await notebook.defer(startMoment())).toBe(false);
    expect(await notebook.remove('x')).toBe(false);
  });

  test('un carnet vide à la lecture', async () => {
    expect(await notebook.list()).toEqual([]);
  });

  test('sans stockage du tout (navigateur sans IndexedDB), le carnet est un carnet vide', async () => {
    const none = createNotebook({ backend: null, now: () => new Date(T0) });
    expect(await none.list()).toEqual([]);
    expect(await none.keep(startMoment(), { story: image('s'), square: image('q'), mode: 'card' })).toBe(false);
  });
});

describe('le stockage IndexedDB', () => {
  /** Un `IDBFactory` minimal : un magasin à clé `id`, put / get / getAll / delete. */
  function fakeFactory() {
    const rows = new Map<string, unknown>();
    const requestOf = (produce: () => unknown) => {
      const request: { result?: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null; error: unknown } = {
        onsuccess: null,
        onerror: null,
        error: null,
      };
      queueMicrotask(() => {
        request.result = produce();
        request.onsuccess?.();
      });
      return request;
    };
    const store = {
      put: (value: { id: string }) => requestOf(() => (rows.set(value.id, value), value.id)),
      get: (key: string) => requestOf(() => rows.get(key)),
      getAll: () => requestOf(() => [...rows.values()]),
      delete: (key: string) => requestOf(() => (rows.delete(key), undefined)),
    };
    const created: { name: string; options: unknown }[] = [];
    const db = {
      objectStoreNames: { contains: (name: string) => created.some((c) => c.name === name) },
      createObjectStore: (name: string, options: unknown) => (created.push({ name, options }), store),
      transaction: () => ({ objectStore: () => store }),
      close: () => undefined,
    };
    const factory = {
      open: () => {
        const request: { result: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null; onupgradeneeded: ((e: { target: unknown }) => void) | null; error: unknown } = {
          result: db,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
          error: null,
        };
        queueMicrotask(() => {
          request.onupgradeneeded?.({ target: request });
          request.onsuccess?.();
        });
        return request;
      },
    };
    return { factory: factory as unknown as IDBFactory, rows, created };
  }

  test('crée UN magasin « entries » à clé « id » à la première ouverture', async () => {
    const { factory, created } = fakeFactory();
    await openIndexedDbBackend(factory);
    expect(created).toEqual([{ name: 'entries', options: { keyPath: 'id' } }]);
  });

  test('le carnet marche de bout en bout dessus', async () => {
    const { factory } = fakeFactory();
    const backend = await openIndexedDbBackend(factory);
    const notebook = createNotebook({ backend, now: () => new Date(T0) });
    await notebook.keep(startMoment(), { story: image('s'), square: image('q'), mode: 'selfie' });
    await notebook.defer(flameMoment(30));
    expect((await notebook.list()).map((e) => e.id).sort()).toEqual(['flame:30', 'start']);
    await notebook.remove('start');
    expect((await notebook.list()).map((e) => e.id)).toEqual(['flame:30']);
  });

  test('sans IndexedDB : pas de stockage, pas d’exception', async () => {
    expect(await openIndexedDbBackend(undefined)).toBeNull();
  });

  test('une ouverture qui échoue : pas de stockage', async () => {
    const failing = {
      open: () => {
        const request: { onerror: (() => void) | null; onsuccess: null; onupgradeneeded: null; error: unknown } = { onerror: null, onsuccess: null, onupgradeneeded: null, error: new Error('refus') };
        queueMicrotask(() => request.onerror?.());
        return request;
      },
    } as unknown as IDBFactory;
    expect(await openIndexedDbBackend(failing)).toBeNull();
  });

  test('un open qui lève de façon synchrone : pas de stockage', async () => {
    const throwing = {
      open: () => {
        throw new Error('SecurityError');
      },
    } as unknown as IDBFactory;
    expect(await openIndexedDbBackend(throwing)).toBeNull();
  });
});

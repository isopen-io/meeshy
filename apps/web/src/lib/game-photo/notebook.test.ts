import { describe, expect, test } from 'bun:test';

import { notebookSizeLabel, accountBackend, createNotebook, developNotebookSource, NOTEBOOK_SOURCE_EDGE, lazyBackend, notebookBytes, notebookDbName, openIndexedDbBackend, pendingOf, retakeChoices, type NotebookBackend, type NotebookEntry } from './notebook';
import { achievementMoment, flameMoment, rankMoment, startMoment } from './moments';

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

describe('« plus tard » : en attente, sans échéance (#10161)', () => {
  test('un succès reporté attend, sans date d’expiration', async () => {
    const { notebook, backend } = bench();
    expect(await notebook.defer(achievementMoment('achievement.first_voice'))).toBe(true);
    const [entry] = await notebook.list();
    expect(entry?.status).toBe('pending');
    expect(entry?.expiresAt ?? null).toBeNull();
    expect(backend.rows.get('achievement:achievement.first_voice')?.expiresAt ?? null).toBeNull();
  });

  test('une entrée en attente ne disparaît plus, même écrite avec une échéance passée par une ancienne version', async () => {
    const { notebook, backend, advance } = bench();
    const old = achievementMoment('achievement.first_voice');
    await backend.put({ id: old.id, momentId: old.id, emblem: old.emblem, kicker: old.kicker, title: old.title, status: 'pending', createdAt: new Date(T0).toISOString(), expiresAt: new Date(T0 + 7 * DAY).toISOString() });
    advance(400 * DAY);
    expect((await notebook.list()).map((e) => e.id)).toEqual([old.id]);
    expect(backend.rows.size).toBe(1);
  });

  test('une étape de piste reportée ne s’écrit pas « en attente » : elle se rattrape (« À rattraper »)', async () => {
    const { notebook, backend } = bench();
    expect(await notebook.defer(rankMoment({ rank: 'voix', division: 2 }))).toBe(true);
    expect(await notebook.defer(flameMoment(7))).toBe(true);
    expect(backend.rows.size).toBe(0);
  });

  test('« En attente » ne montre que les moments non déductibles, même une ancienne étape de piste gardée en attente', () => {
    const step = flameMoment(7);
    const trophy = achievementMoment('achievement.first_voice');
    const entries: NotebookEntry[] = [
      { id: step.id, momentId: step.id, emblem: step.emblem, kicker: step.kicker, title: step.title, status: 'pending', createdAt: new Date(T0).toISOString(), expiresAt: null },
      { id: trophy.id, momentId: trophy.id, emblem: trophy.emblem, kicker: trophy.kicker, title: trophy.title, status: 'pending', createdAt: new Date(T0).toISOString() },
    ];
    expect(pendingOf(entries).map((e) => e.id)).toEqual([trophy.id]);
  });

  test('un moment déjà gardé ne redevient pas « en attente »', async () => {
    const { notebook } = bench();
    const trophy = achievementMoment('achievement.first_voice');
    await notebook.keep(trophy, { story: image('s'), mode: 'selfie' });
    await notebook.defer(trophy);
    const [entry] = await notebook.list();
    expect(entry?.status).toBe('kept');
  });
});

describe('garder une photo : la recette (#10161)', () => {
  test('une entrée NEUVE ne garde que le 9:16 et sa source, avec sa recette', async () => {
    const { notebook } = bench();
    const outcome = await notebook.keep(flameMoment(7), {
      story: image('s'),
      mode: 'selfie',
      source: image('src'),
      recipe: { frameId: 'savane.lion', pose: 'crest', message: 'Enfin', crop: { x: 0.1, y: -0.2, zoom: 1.4 }, mirror: true, showFlame: true, showLink: false, momentAt: '2026-10-01T00:00:00.000Z' },
    });
    expect(outcome).toBe('kept');
    const [entry] = await notebook.list();
    expect(entry).toMatchObject({ status: 'kept', mode: 'selfie', momentId: 'flame:7', createdAt: new Date(T0).toISOString(), frameId: 'savane.lion', pose: 'crest', message: 'Enfin', crop: { x: 0.1, y: -0.2, zoom: 1.4 }, mirror: true, showFlame: true, showLink: false, momentAt: '2026-10-01T00:00:00.000Z' });
    expect(entry?.story?.size).toBe(1);
    expect(entry?.source?.size).toBe(3);
    expect(entry?.square).toBeUndefined();
    expect('expiresAt' in (entry ?? {})).toBe(false);
  });

  test('une carte seule n’a pas de source', async () => {
    const { notebook } = bench();
    await notebook.keep(startMoment(), { story: image('s'), mode: 'card' });
    const [entry] = await notebook.list();
    expect(entry?.source).toBeUndefined();
    expect(retakeChoices(entry!)).toEqual(['selfie', 'card']);
  });

  test('une entrée avec source propose de reprendre la même photo', async () => {
    const { notebook } = bench();
    await notebook.keep(startMoment(), { story: image('s'), mode: 'gallery', source: image('src') });
    const [entry] = await notebook.list();
    expect(retakeChoices(entry!)).toEqual(['same-photo', 'selfie', 'card']);
  });

  test('une ANCIENNE entrée (deux images, sans recette) se relit et ne propose que nouveau selfie ou carte', async () => {
    const { notebook, backend } = bench();
    const old = startMoment();
    await backend.put({ id: old.id, momentId: old.id, emblem: old.emblem, kicker: old.kicker, title: old.title, status: 'kept', createdAt: new Date(T0).toISOString(), expiresAt: null, mode: 'selfie', story: image('s'), square: image('q') });
    const [entry] = await notebook.list();
    expect(entry?.square?.size).toBe(1);
    expect(entry?.frameId).toBeUndefined();
    expect(retakeChoices(entry!)).toEqual(['selfie', 'card']);
  });

  test('la place qu’occupe le carnet : la somme de ses images', async () => {
    const { notebook, backend } = bench();
    const old = startMoment();
    await backend.put({ id: old.id, momentId: old.id, emblem: old.emblem, kicker: old.kicker, title: old.title, status: 'kept', createdAt: new Date(T0).toISOString(), expiresAt: null, mode: 'selfie', story: image('ss'), square: image('qqq') });
    await notebook.keep(flameMoment(7), { story: image('s'), mode: 'selfie', source: image('srcc') });
    expect(notebookBytes(await notebook.list())).toBe(2 + 3 + 1 + 4);
  });

  test('la place se dit en Ko puis en Mo, dans la langue du lecteur', () => {
    expect(notebookSizeLabel(420_000, 'fr')).toMatch(/^420\sko$/);
    expect(notebookSizeLabel(3_240_000, 'en')).toMatch(/^3\.2\sMB$/);
  });

  test('« Garder » demande au navigateur un stockage PERSISTANT, une fois, au premier geste', async () => {
    let asked = 0;
    const backend = memoryBackend();
    const notebook = createNotebook({ backend, now: () => new Date(T0), persist: async () => ((asked += 1), true) });
    await notebook.defer(achievementMoment('achievement.first_voice'));
    await notebook.list();
    expect(asked).toBe(0);
    await notebook.keep(startMoment(), { story: image('s'), mode: 'card' });
    await notebook.keep(flameMoment(7), { story: image('s'), mode: 'card' });
    expect(asked).toBe(1);
  });

  test('un refus du stockage persistant ne refuse pas la photo', async () => {
    const notebook = createNotebook({ backend: memoryBackend(), now: () => new Date(T0), persist: async () => Promise.reject(new Error('refus')) });
    expect(await notebook.keep(startMoment(), { story: image('s'), mode: 'card' })).toBe('kept');
  });

  test('quota dépassé ⇒ « plus de place », et AUCUNE entrée n’est créée', async () => {
    const backend = memoryBackend();
    const full: NotebookBackend = {
      ...backend,
      put: async () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    const notebook = createNotebook({ backend: full, now: () => new Date(T0) });
    expect(await notebook.keep(startMoment(), { story: image('s'), mode: 'card' })).toBe('no-space');
    expect(backend.rows.size).toBe(0);
  });
});

describe('la source gardée (#10161)', () => {
  test('passe par le développement unique des photos, bornée à 1 440 px, JPEG q0,85', async () => {
    const painted: unknown[] = [];
    const encoded: unknown[] = [];
    const blob = await developNotebookSource(
      { image: {} as CanvasImageSource, width: 1920, height: 2560 },
      {
        surface: (size) => ({
          paint: (_image, _crop, target) => void painted.push(target),
          pixels: () => new Uint8ClampedArray(size.width * size.height * 4),
          put: () => undefined,
          encode: async (mime, quality) => (encoded.push({ mime, quality }), new Blob(['j'], { type: mime })),
        }),
      },
    );
    expect(NOTEBOOK_SOURCE_EDGE).toBe(1440);
    expect(painted).toEqual([{ width: 1080, height: 1440 }]);
    expect(encoded).toEqual([{ mime: 'image/jpeg', quality: 0.85 }]);
    expect(blob?.type).toBe('image/jpeg');
  });

  test('un navigateur sans canevas : pas de source, la photo se garde sans elle', async () => {
    expect(await developNotebookSource({ image: {} as CanvasImageSource, width: 10, height: 10 }, { surface: () => null })).toBeNull();
  });
});

describe('garder une photo', () => {
  test('garder une photo prend la place de l’attente du même moment', async () => {
    const { notebook } = bench();
    const trophy = achievementMoment('achievement.first_voice');
    await notebook.defer(trophy);
    await notebook.keep(trophy, { story: image('s'), mode: 'selfie' });
    const all = await notebook.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe('kept');
  });

  test('une photo gardée ne s’efface JAMAIS toute seule', async () => {
    const { notebook, advance } = bench();
    await notebook.keep(startMoment(), { story: image('s'), mode: 'selfie' });
    advance(400 * DAY);
    expect(await notebook.list()).toHaveLength(1);
  });

  test('le plus récent d’abord', async () => {
    const { notebook, advance } = bench();
    await notebook.keep(startMoment(), { story: image('s'), mode: 'card' });
    advance(DAY);
    await notebook.keep(flameMoment(7), { story: image('s'), mode: 'card' });
    expect((await notebook.list()).map((e) => e.momentId)).toEqual(['flame:7', 'start']);
  });

  test('retirer une entrée', async () => {
    const { notebook } = bench();
    await notebook.keep(startMoment(), { story: image('s'), mode: 'card' });
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
    expect(await notebook.keep(startMoment(), { story: image('s'), mode: 'card' })).toBe('unavailable');
    expect(await notebook.defer(achievementMoment('achievement.first_voice'))).toBe(false);
    expect(await notebook.remove('x')).toBe(false);
  });

  test('un carnet vide à la lecture', async () => {
    expect(await notebook.list()).toEqual([]);
  });

  test('sans stockage du tout (navigateur sans IndexedDB), le carnet est un carnet vide', async () => {
    const none = createNotebook({ backend: null, now: () => new Date(T0) });
    expect(await none.list()).toEqual([]);
    expect(await none.keep(startMoment(), { story: image('s'), mode: 'card' })).toBe('unavailable');
  });
});

describe('le stockage IndexedDB', () => {
  /** Un `IDBFactory` minimal : des bases nommées, un magasin à clé `id`, une écriture qui ne vaut qu'à la fin de sa transaction. */
  function fakeFactory(options: { readonly failCommit?: string } = {}) {
    const bases = new Map<string, Map<string, unknown>>();
    const opened: string[] = [];
    const created: { name: string; options: unknown }[] = [];
    const requestOf = (produce: () => unknown) => {
      const request: { result?: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null; error: unknown } = { onsuccess: null, onerror: null, error: null };
      queueMicrotask(() => {
        request.result = produce();
        request.onsuccess?.();
      });
      return request;
    };
    const factory = {
      open: (name: string) => {
        opened.push(name);
        const rows = bases.get(name) ?? new Map<string, unknown>();
        bases.set(name, rows);
        const stores: string[] = [];
        const transaction = () => {
          const tx: { oncomplete: (() => void) | null; onabort: (() => void) | null; onerror: (() => void) | null; error: unknown; objectStore: () => unknown } = {
            oncomplete: null,
            onabort: null,
            onerror: null,
            error: null,
            objectStore: () => store,
          };
          const finish = () =>
            setTimeout(() => {
              if (options.failCommit !== undefined) {
                tx.error = new DOMException('quota', options.failCommit);
                tx.onabort?.();
              } else tx.oncomplete?.();
            }, 0);
          const store = {
            put: (value: { id: string }) => (finish(), requestOf(() => (options.failCommit === undefined ? rows.set(value.id, value) : undefined, value.id))),
            get: (key: string) => requestOf(() => rows.get(key)),
            getAll: () => requestOf(() => [...rows.values()]),
            delete: (key: string) => (finish(), requestOf(() => (rows.delete(key), undefined))),
          };
          return tx;
        };
        const db = {
          objectStoreNames: { contains: (store: string) => stores.includes(store) },
          createObjectStore: (store: string, opts: unknown) => (stores.push(store), created.push({ name: store, options: opts }), undefined),
          transaction,
          close: () => undefined,
        };
        const request: { result: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null; onupgradeneeded: (() => void) | null; error: unknown } = {
          result: db,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
          error: null,
        };
        queueMicrotask(() => {
          request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      },
    };
    return { factory: factory as unknown as IDBFactory, bases, created, opened };
  }

  test('crée UN magasin « entries » à clé « id » à la première ouverture', async () => {
    const { factory, created } = fakeFactory();
    await openIndexedDbBackend(factory, notebookDbName('u1'));
    expect(created).toEqual([{ name: 'entries', options: { keyPath: 'id' } }]);
  });

  test('la base d’un compte porte son identité dans son nom (D-154)', async () => {
    const { factory, opened } = fakeFactory();
    await openIndexedDbBackend(factory, notebookDbName('65f0c0ffee0000000000abcd'));
    expect(opened).toEqual(['meeshy-game-notebook-65f0c0ffee0000000000abcd']);
  });

  test('le carnet marche de bout en bout dessus', async () => {
    const { factory } = fakeFactory();
    const backend = await openIndexedDbBackend(factory, notebookDbName('u1'));
    const notebook = createNotebook({ backend, now: () => new Date(T0) });
    await notebook.keep(startMoment(), { story: image('s'), mode: 'selfie' });
    await notebook.defer(achievementMoment('achievement.first_voice'));
    expect((await notebook.list()).map((e) => e.id).sort()).toEqual(['achievement:achievement.first_voice', 'start']);
    await notebook.remove('start');
    expect((await notebook.list()).map((e) => e.id)).toEqual(['achievement:achievement.first_voice']);
  });

  test('un quota refusé AU COMMIT de la transaction ⇒ « plus de place », pas « gardée »', async () => {
    const { factory } = fakeFactory({ failCommit: 'QuotaExceededError' });
    const backend = await openIndexedDbBackend(factory, notebookDbName('u1'));
    const notebook = createNotebook({ backend, now: () => new Date(T0) });
    expect(await notebook.keep(startMoment(), { story: image('s'), mode: 'selfie' })).toBe('no-space');
  });

  test('sans IndexedDB : pas de stockage, pas d’exception', async () => {
    expect(await openIndexedDbBackend(undefined, notebookDbName('u1'))).toBeNull();
  });

  test('une ouverture qui échoue : pas de stockage', async () => {
    const failing = {
      open: () => {
        const request: { onerror: (() => void) | null; onsuccess: null; onupgradeneeded: null; error: unknown } = { onerror: null, onsuccess: null, onupgradeneeded: null, error: new Error('refus') };
        queueMicrotask(() => request.onerror?.());
        return request;
      },
    } as unknown as IDBFactory;
    expect(await openIndexedDbBackend(failing, notebookDbName('u1'))).toBeNull();
  });

  test('un open qui lève de façon synchrone : pas de stockage', async () => {
    const throwing = {
      open: () => {
        throw new Error('SecurityError');
      },
    } as unknown as IDBFactory;
    expect(await openIndexedDbBackend(throwing, notebookDbName('u1'))).toBeNull();
  });
});

describe('le carnet à ouverture paresseuse', () => {
  test('la base ne s’ouvre pas tant que personne ne s’en sert, et une seule fois ensuite', async () => {
    let opened = 0;
    const lazy = lazyBackend(async () => {
      opened += 1;
      return memoryBackend();
    });
    expect(opened).toBe(0);
    const notebook = createNotebook({ backend: lazy, now: () => new Date(T0) });
    await notebook.defer(achievementMoment('achievement.first_voice'));
    await notebook.list();
    expect(opened).toBe(1);
  });

  test('une base qui ne s’ouvre pas : « non gardé » et « carnet vide », sans exception', async () => {
    const notebook = createNotebook({ backend: lazyBackend(async () => null), now: () => new Date(T0) });
    expect(await notebook.defer(achievementMoment('achievement.first_voice'))).toBe(false);
    expect(await notebook.list()).toEqual([]);
  });
});

describe('un carnet PAR COMPTE (D-154)', () => {
  const bases = () => {
    const opened = new Map<string, ReturnType<typeof memoryBackend>>();
    const open = async (userId: string) => {
      const known = opened.get(userId) ?? memoryBackend();
      opened.set(userId, known);
      return known;
    };
    return { opened, open };
  };

  test('chaque compte lit et écrit SA base ; changer de compte change de base', async () => {
    const { opened, open } = bases();
    let reader: string | null = 'alice';
    const notebook = createNotebook({ backend: accountBackend({ reader: () => reader, open }), now: () => new Date(T0) });
    await notebook.keep(startMoment(), { story: image('s'), mode: 'selfie' });
    reader = 'bob';
    expect(await notebook.list()).toEqual([]);
    await notebook.keep(flameMoment(7), { story: image('s'), mode: 'card' });
    expect([...(opened.get('alice')?.rows.keys() ?? [])]).toEqual(['start']);
    expect([...(opened.get('bob')?.rows.keys() ?? [])]).toEqual(['flame:7']);
    reader = 'alice';
    expect((await notebook.list()).map((e) => e.id)).toEqual(['start']);
  });

  test('sans lecteur connecté : aucune base n’est ouverte, le carnet est vide et rien ne se garde', async () => {
    const { opened, open } = bases();
    const notebook = createNotebook({ backend: accountBackend({ reader: () => null, open }), now: () => new Date(T0) });
    expect(await notebook.list()).toEqual([]);
    expect(await notebook.keep(startMoment(), { story: image('s'), mode: 'card' })).toBe('unavailable');
    expect(opened.size).toBe(0);
  });

  test('la base d’un compte ne s’ouvre qu’une fois', async () => {
    let count = 0;
    const notebook = createNotebook({
      backend: accountBackend({ reader: () => 'alice', open: async () => ((count += 1), memoryBackend()) }),
      now: () => new Date(T0),
    });
    await notebook.list();
    await notebook.keep(startMoment(), { story: image('s'), mode: 'card' });
    expect(count).toBe(1);
  });
});

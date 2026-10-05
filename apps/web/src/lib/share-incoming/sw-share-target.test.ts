import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { fakeIndexedDb, type FakeIndexedDb } from './idb-double';
import { SHARE_DB_NAME, SHARE_KEY, SHARE_STORE_NAME, takeWebShare } from './web-inbox';

/**
 * UNE IMAGE PARTAGÉE VERS LA PWA ARRIVE SUR LA FEUILLE D'ENVOI (#8884).
 *
 * Le système envoie le partage en `POST /share` (multipart). Le service worker
 * est le seul à pouvoir le recevoir : il range les fichiers dans IndexedDB
 * (bornés) et redirige vers `/share`, que la page lit puis purge. Le script est
 * CLASSIQUE (`importScripts`), sans module : le témoin l'évalue tel quel avec
 * un `self` de substitution.
 */
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public', 'sw-share-target.js');
const ORIGIN = 'https://meeshy.me';

type FetchEvent = {
  readonly request: { readonly method: string; readonly url: string; formData(): Promise<FormData> };
  respondWith(response: Promise<Response>): void;
};

function mount(store: FakeIndexedDb) {
  const listeners = new Map<string, (event: never) => void>();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: never) => void) => listeners.set(type, listener),
  };
  new Function('self', 'indexedDB', readFileSync(SCRIPT, 'utf8'))(self, store.factory);
  return listeners;
}

async function post(
  store: FakeIndexedDb,
  form: FormData,
  { method = 'POST', url = `${ORIGIN}/share` }: { readonly method?: string; readonly url?: string } = {},
): Promise<Response | null> {
  const listener = mount(store).get('fetch');
  let answer: Promise<Response> | null = null;
  const event: FetchEvent = {
    request: { method, url, formData: async () => form },
    respondWith: (response) => {
      answer = response;
    },
  };
  listener?.(event as never);
  return answer === null ? null : await answer;
}

const formOf = (entries: Record<string, string | File | readonly File[]>): FormData => {
  const form = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    if (Array.isArray(value)) value.forEach((file) => form.append(name, file));
    else form.append(name, value as string | File);
  }
  return form;
};

const stored = (store: FakeIndexedDb) => store.rowsOf(SHARE_DB_NAME, SHARE_STORE_NAME).get(SHARE_KEY) as
  | { receivedAt: number; files: File[]; text: string; title: string; url: string }
  | undefined;

describe('sw-share-target.js — la réception du partage système', () => {
  test('écoute les requêtes (fetch) et rien d’autre', () => {
    expect([...mount(fakeIndexedDb()).keys()]).toEqual(['fetch']);
  });

  test('un POST /share range fichiers et texte, puis redirige vers /share en 303', async () => {
    const store = fakeIndexedDb();
    const photo = new File(['abc'], 'plage.jpg', { type: 'image/jpeg' });
    const response = await post(store, formOf({ media: photo, title: 'Vacances', text: 'Regarde', url: 'https://exemple.org' }));

    expect(response?.status).toBe(303);
    expect(response?.headers.get('location')).toBe(`${ORIGIN}/share`);
    const record = stored(store);
    expect(record?.files.map((file) => file.name)).toEqual(['plage.jpg']);
    expect(record).toMatchObject({ title: 'Vacances', text: 'Regarde', url: 'https://exemple.org' });
    expect(typeof record?.receivedAt).toBe('number');
  });

  test('un partage de texte seul est rangé sans fichier', async () => {
    const store = fakeIndexedDb();
    await post(store, formOf({ text: 'Bonjour' }));
    expect(stored(store)).toMatchObject({ files: [], text: 'Bonjour', title: '', url: '' });
  });

  test('ne prend que les fichiers : une entrée texte déguisée en champ de fichier n’est pas un fichier', async () => {
    const store = fakeIndexedDb();
    await post(store, formOf({ media: 'pas-un-fichier' }));
    expect(stored(store)?.files).toEqual([]);
  });

  test('borne le nombre de fichiers à dix', async () => {
    const store = fakeIndexedDb();
    const files = Array.from({ length: 13 }, (_, i) => new File(['x'], `p${i}.png`, { type: 'image/png' }));
    await post(store, formOf({ media: files }));
    expect(stored(store)?.files.map((file) => file.name)).toEqual(files.slice(0, 10).map((file) => file.name));
  });

  test('borne le poids total : un fichier qui ferait dépasser est écarté, les suivants aussi', async () => {
    const store = fakeIndexedDb();
    const small = new File(['x'], 'petit.png', { type: 'image/png' });
    const huge = Object.defineProperty(new File(['x'], 'enorme.mp4', { type: 'video/mp4' }), 'size', { value: 101 * 1024 * 1024 });
    const after = new File(['x'], 'apres.png', { type: 'image/png' });
    const entries: [string, File][] = [small, huge, after].map((file) => ['media', file]);
    const form = { get: () => null, entries: () => entries[Symbol.iterator]() } as unknown as FormData;
    await post(store, form);
    expect(stored(store)?.files.map((file) => file.name)).toEqual(['petit.png']);
  });

  test('ne range que des images et des vidéos : un autre type n’occupe ni la place ni le budget', async () => {
    const store = fakeIndexedDb();
    const page = new File(['<script>'], 'page.html', { type: 'text/html' });
    const photo = new File(['x'], 'plage.jpg', { type: 'image/jpeg' });
    await post(store, formOf({ media: [page, photo] }));
    expect(stored(store)?.files.map((file) => file.name)).toEqual(['plage.jpg']);
  });

  test('borne le texte reçu comme la coque Android (20 000 caractères)', async () => {
    const store = fakeIndexedDb();
    await post(store, formOf({ text: 'x'.repeat(30_000), title: 't'.repeat(30_000), url: 'u'.repeat(30_000) }));
    const record = stored(store);
    expect([record?.text.length, record?.title.length, record?.url.length]).toEqual([20_000, 20_000, 20_000]);
  });

  test('un stockage qui refuse ne casse pas le retour : la page s’ouvre quand même', async () => {
    const store = fakeIndexedDb();
    store.failOpen();
    const response = await post(store, formOf({ text: 'Bonjour' }));
    expect(response?.status).toBe(303);
    expect(response?.headers.get('location')).toBe(`${ORIGIN}/share`);
  });

  test('ignore ce qui n’est pas un POST sur /share de cette origine', async () => {
    const store = fakeIndexedDb();
    expect(await post(store, formOf({ text: 'x' }), { method: 'GET' })).toBeNull();
    expect(await post(store, formOf({ text: 'x' }), { url: `${ORIGIN}/share/autre` })).toBeNull();
    expect(await post(store, formOf({ text: 'x' }), { url: `${ORIGIN}/api/v1/share` })).toBeNull();
    expect(await post(store, formOf({ text: 'x' }), { url: 'https://autre.example/share' })).toBeNull();
    expect(stored(store)).toBeUndefined();
  });

  test('JUMEAU GATÉ : ce que le worker écrit, la page le lit, puis le purge', async () => {
    const store = fakeIndexedDb();
    await post(store, formOf({ media: new File(['abc'], 'plage.jpg', { type: 'image/jpeg' }), text: 'Regarde' }));

    const first = await takeWebShare({ indexedDB: store.factory });
    expect(first?.files.map((file) => file.name)).toEqual(['plage.jpg']);
    expect(first?.text).toBe('Regarde');
    expect(stored(store)).toBeUndefined();
    expect(await takeWebShare({ indexedDB: store.factory })).toBeNull();
  });
});

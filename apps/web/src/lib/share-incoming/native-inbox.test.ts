import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import { listenNativeShares, parseNativeShare, PONT_PARTAGE, readNativeShare } from './native-inbox';

/**
 * LA COQUE ANDROID REÇOIT UN PARTAGE (#8884) — `MeeshyShareIntentPlugin.java`
 * copie les contenus de l'intent `SEND` / `SEND_MULTIPLE` en fichiers
 * temporaires de la coque, et les décrit. Ici, cette description devient un
 * `IncomingShare` : des `File` lus depuis l'adresse locale de la WebView, puis
 * les fichiers temporaires sont relâchés.
 */
type Call = { readonly method: string; readonly options: object };

function coqueWith(
  answers: { readonly consume?: unknown; readonly methods?: readonly string[]; readonly convertFileSrc?: (path: string) => string },
  calls: Call[] = [],
): CoqueNative & { convertFileSrc?: (path: string) => string } {
  return {
    PluginHeaders: [{ name: PONT_PARTAGE, methods: (answers.methods ?? ['consume', 'release']).map((name) => ({ name })) }],
    nativePromise: async (_plugin, method, options) => {
      calls.push({ method, options });
      return method === 'consume' ? answers.consume : undefined;
    },
    ...(answers.convertFileSrc === undefined ? {} : { convertFileSrc: answers.convertFileSrc }),
  };
}

const served = (files: Record<string, { readonly body: string; readonly type?: string; readonly status?: number }>) =>
  (async (input: RequestInfo | URL) => {
    const entry = files[String(input)];
    if (entry === undefined) return new Response('introuvable', { status: 404 });
    return new Response(entry.body, { status: entry.status ?? 200, headers: entry.type === undefined ? {} : { 'content-type': entry.type } });
  }) as typeof fetch;

describe('parseNativeShare — ce que le pont remet', () => {
  test('lit fichiers, texte et sujet', () => {
    expect(
      parseNativeShare({ files: [{ path: '/cache/a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', size: 3 }], text: 'Salut', subject: 'Titre' }),
    ).toEqual({ files: [{ path: '/cache/a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', size: 3 }], text: 'Salut', subject: 'Titre' });
  });

  test('un objet vide (rien à recevoir) est rien', () => {
    expect(parseNativeShare({})).toBeNull();
    expect(parseNativeShare(undefined)).toBeNull();
    expect(parseNativeShare('x')).toBeNull();
  });

  test('écarte les fichiers malformés et garde le reste', () => {
    expect(parseNativeShare({ files: [{ path: 3 }, null, { path: '/cache/a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }], text: 'x' })).toEqual({
      files: [{ path: '/cache/a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', size: 0 }],
      text: 'x',
      subject: '',
    });
  });
});

describe('readNativeShare — du pont natif à un IncomingShare', () => {
  test('lit chaque fichier depuis l’adresse locale de la WebView, puis relâche', async () => {
    const calls: Call[] = [];
    const coque = coqueWith(
      {
        consume: { files: [{ path: '/cache/a.jpg', name: 'plage.jpg', mimeType: 'image/jpeg', size: 3 }], text: 'Regarde', subject: 'Vacances' },
        convertFileSrc: (path) => `http://localhost/_capacitor_file_${path}`,
      },
      calls,
    );
    const share = await readNativeShare({ coque, fetchImpl: served({ 'http://localhost/_capacitor_file_/cache/a.jpg': { body: 'abc' } }) });

    expect(share?.files.map((file) => [file.name, file.type, file.size])).toEqual([['plage.jpg', 'image/jpeg', 3]]);
    expect(share).toMatchObject({ text: 'Regarde', title: 'Vacances', url: '' });
    expect(calls.map((call) => call.method)).toEqual(['consume', 'release']);
  });

  test('sans convertFileSrc, l’adresse locale se compose sur l’origine de la page', async () => {
    const coque = coqueWith({ consume: { files: [{ path: '/cache/a.mp4', name: 'a.mp4', mimeType: 'video/mp4', size: 1 }] } });
    const share = await readNativeShare({
      coque,
      origin: 'https://localhost',
      fetchImpl: served({ 'https://localhost/_capacitor_file_/cache/a.mp4': { body: 'v' } }),
    });
    expect(share?.files.map((file) => file.name)).toEqual(['a.mp4']);
  });

  test('un fichier illisible est écarté, les autres partent', async () => {
    const coque = coqueWith({
      consume: {
        files: [
          { path: '/cache/perdu.jpg', name: 'perdu.jpg', mimeType: 'image/jpeg', size: 1 },
          { path: '/cache/bon.jpg', name: 'bon.jpg', mimeType: 'image/jpeg', size: 1 },
        ],
      },
      convertFileSrc: (path) => `http://localhost${path}`,
    });
    const share = await readNativeShare({ coque, fetchImpl: served({ 'http://localhost/cache/bon.jpg': { body: 'x' } }) });
    expect(share?.files.map((file) => file.name)).toEqual(['bon.jpg']);
  });

  test('un réseau qui jette écarte le fichier au lieu de tout perdre', async () => {
    const coque = coqueWith({
      consume: { files: [{ path: '/cache/a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', size: 1 }], text: 'Garde-moi' },
      convertFileSrc: (path) => `http://localhost${path}`,
    });
    const share = await readNativeShare({
      coque,
      fetchImpl: (async () => {
        throw new Error('coupé');
      }) as unknown as typeof fetch,
    });
    expect(share).toMatchObject({ files: [], text: 'Garde-moi' });
  });

  test('rien reçu : null, et rien à relâcher', async () => {
    const calls: Call[] = [];
    expect(await readNativeShare({ coque: coqueWith({ consume: {} }, calls) })).toBeNull();
    expect(calls.map((call) => call.method)).toEqual(['consume']);
  });

  test('tous les fichiers illisibles et aucun texte : null, mais le temporaire est relâché', async () => {
    const calls: Call[] = [];
    const coque = coqueWith({ consume: { files: [{ path: '/cache/a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', size: 1 }] }, convertFileSrc: (p) => `http://x${p}` }, calls);
    expect(await readNativeShare({ coque, fetchImpl: served({}) })).toBeNull();
    expect(calls.map((call) => call.method)).toEqual(['consume', 'release']);
  });

  test('hors coque, ou coque sans le pont / sans `consume` : null, sans lever', async () => {
    expect(await readNativeShare({ coque: undefined })).toBeNull();
    expect(await readNativeShare({ coque: {} })).toBeNull();
    expect(await readNativeShare({ coque: coqueWith({ methods: ['release'] }) })).toBeNull();
  });

  test('un pont qui rejette : null', async () => {
    const coque: CoqueNative = {
      PluginHeaders: [{ name: PONT_PARTAGE, methods: [{ name: 'consume' }] }],
      nativePromise: async () => {
        throw new Error('pont indisponible');
      },
    };
    expect(await readNativeShare({ coque })).toBeNull();
  });
});

describe('listenNativeShares — le réveil du pont', () => {
  test('s’abonne à shareReceived quand la coque déclare le pont', () => {
    const subscribed: string[] = [];
    const coque: CoqueNative = {
      PluginHeaders: [{ name: PONT_PARTAGE }],
      addListener: (plugin, event) => {
        subscribed.push(`${plugin}:${event}`);
        return { remove: async () => undefined };
      },
    };
    expect(listenNativeShares(coque, () => undefined)).toBe(true);
    expect(subscribed).toEqual(['MeeshyShareIntent:shareReceived']);
  });

  test('fait remonter chaque réveil', () => {
    let wake: (data: unknown) => void = () => undefined;
    const coque: CoqueNative = {
      PluginHeaders: [{ name: PONT_PARTAGE }],
      addListener: (_plugin, _event, callback) => {
        wake = callback;
        return { remove: async () => undefined };
      },
    };
    let woken = 0;
    listenNativeShares(coque, () => (woken += 1));
    wake({});
    wake({});
    expect(woken).toBe(2);
  });

  test('hors coque ou sans le pont : false', () => {
    expect(listenNativeShares(undefined, () => undefined)).toBe(false);
    expect(listenNativeShares({ PluginHeaders: [], addListener: () => ({ remove: async () => undefined }) }, () => undefined)).toBe(false);
  });
});

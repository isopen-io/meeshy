import { describe, expect, test } from 'bun:test';

import {
  TUS_BACKGROUND_ID_PREFIX,
  TUS_BACKGROUND_MESSAGE,
  backgroundFetchIdOf,
  backgroundUploadPort,
  visibilityOf,
  type BackgroundContainer,
  type BackgroundRegistration,
} from './tus-background';

type Fetched = { readonly id: string; readonly request: Request; readonly options: Record<string, unknown> };

function fakeWorld(options: { readonly supported?: boolean; readonly duplicate?: boolean; readonly running?: Record<string, string> } = {}) {
  const fetched: Fetched[] = [];
  const listeners = new Set<(event: { readonly data: unknown }) => void>();
  const registration: BackgroundRegistration = {
    backgroundFetch:
      options.supported === false
        ? undefined
        : {
            fetch: async (id, request, init) => {
              if (options.duplicate === true) throw new TypeError('duplicate id');
              fetched.push({ id, request: request as Request, options: init });
              return {};
            },
            get: async (id) => (options.running !== undefined && id in options.running ? { result: options.running[id] ?? '' } : undefined),
          },
  };
  const container: BackgroundContainer = {
    getRegistration: async () => registration,
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
  };
  return { container, fetched, listeners, post: (data: unknown) => listeners.forEach((listener) => listener({ data })) };
}

const picture = new File([new Uint8Array([1, 2, 3, 4, 5, 6])], 'scene.png', { type: 'image/png' });
const startOf = (offset = 2) => ({
  fingerprint: 'fp-1',
  location: 'https://gate.meeshy.me/api/v1/uploads/up-1',
  offset,
  file: picture,
  headers: { Authorization: 'Bearer jwt', 'Tus-Resumable': '1.0.0', 'Content-Type': 'application/offset+octet-stream', 'Upload-Offset': String(offset) },
  title: 'Meeshy · scene.png',
});

describe('backgroundUploadPort — seulement où Background Fetch existe', () => {
  test('pas de service worker, pas d’inscription ou pas de Background Fetch (Safari, WebView) : aucun port', async () => {
    expect(await backgroundUploadPort(undefined)).toBeNull();
    expect(await backgroundUploadPort({ ...fakeWorld().container, getRegistration: async () => undefined })).toBeNull();
    expect(await backgroundUploadPort(fakeWorld({ supported: false }).container)).toBeNull();
    expect(await backgroundUploadPort({ ...fakeWorld().container, getRegistration: async () => Promise.reject(new Error('refusé')) })).toBeNull();
  });
});

describe('backgroundUploadPort.reaches — Background Fetch refuse toute requête qui exige un pré-vol CORS', () => {
  test('seule une session de l’origine de la page est confiée au navigateur', async () => {
    const port = await backgroundUploadPort(fakeWorld().container, 'https://meeshy.me');
    expect(port?.reaches('https://meeshy.me/api/v1/uploads/up-1')).toBe(true);
    expect(port?.reaches('https://gate.meeshy.me/api/v1/uploads/up-1')).toBe(false);
    expect(port?.reaches('http://meeshy.me/api/v1/uploads/up-1')).toBe(false);
    expect(port?.reaches('pas une adresse')).toBe(false);
  });

  test('origine de la page inconnue : aucune session n’est confiée au navigateur', async () => {
    const port = await backgroundUploadPort(fakeWorld().container);
    expect(port?.reaches('https://gate.meeshy.me/api/v1/uploads/up-1')).toBe(false);
  });
});

describe('backgroundUploadPort.start — le reste du fichier part dans le navigateur', () => {
  test('inscrit UN PATCH à l’offset donné, avec les octets de là et les en-têtes fournis', async () => {
    const world = fakeWorld();
    const port = await backgroundUploadPort(world.container);

    expect(await port?.start(startOf(2))).toBe(true);

    const [only] = world.fetched;
    expect(world.fetched).toHaveLength(1);
    expect(only?.id).toBe(`${TUS_BACKGROUND_ID_PREFIX}fp-1`);
    expect(only?.id).toBe(backgroundFetchIdOf('fp-1'));
    expect(only?.request.method).toBe('PATCH');
    expect(only?.request.url).toBe('https://gate.meeshy.me/api/v1/uploads/up-1');
    expect(only?.request.headers.get('Upload-Offset')).toBe('2');
    expect(only?.request.headers.get('Authorization')).toBe('Bearer jwt');
    expect([...new Uint8Array(await only!.request.arrayBuffer())]).toEqual([3, 4, 5, 6]);
    expect(only?.options.title).toBe('Meeshy · scene.png');
  });

  test('un refus du navigateur (identifiant déjà pris, quota) est une VALEUR, jamais une exception', async () => {
    const port = await backgroundUploadPort(fakeWorld({ duplicate: true }).container);
    expect(await port?.start(startOf())).toBe(false);
  });
});

describe('backgroundUploadPort.isRunning / settled', () => {
  test('isRunning : vrai tant que le navigateur n’a pas rendu de résultat', async () => {
    const id = backgroundFetchIdOf('fp-1');
    const port = await backgroundUploadPort(fakeWorld({ running: { [id]: '' } }).container);
    expect(await port?.isRunning('fp-1')).toBe(true);
    expect(await port?.isRunning('autre')).toBe(false);
    const done = await backgroundUploadPort(fakeWorld({ running: { [id]: 'success' } }).container);
    expect(await done?.isRunning('fp-1')).toBe(false);
  });

  test('settled attend le message du worker portant LA bonne empreinte', async () => {
    const id = backgroundFetchIdOf('fp-1');
    const world = fakeWorld({ running: { [id]: '' } });
    const port = await backgroundUploadPort(world.container);
    let settled = false;
    const waiting = port!.settled('fp-1').then(() => (settled = true));

    await Promise.resolve();
    await Promise.resolve();
    world.post({ type: TUS_BACKGROUND_MESSAGE, fingerprint: 'autre' });
    world.post({ type: 'ailleurs', fingerprint: 'fp-1' });
    await Promise.resolve();
    expect(settled).toBe(false);

    world.post({ type: TUS_BACKGROUND_MESSAGE, fingerprint: 'fp-1' });
    await waiting;
    expect(settled).toBe(true);
    expect(world.listeners.size).toBe(0);
  });

  test('settled rend la main tout de suite quand rien ne tourne, et sur annulation', async () => {
    const idle = await backgroundUploadPort(fakeWorld().container);
    await idle!.settled('fp-1');

    const id = backgroundFetchIdOf('fp-1');
    const world = fakeWorld({ running: { [id]: '' } });
    const port = await backgroundUploadPort(world.container);
    const controller = new AbortController();
    const waiting = port!.settled('fp-1', controller.signal);
    await Promise.resolve();
    controller.abort();
    await waiting;
    expect(world.listeners.size).toBe(0);
  });
});

describe('visibilityOf', () => {
  test('prévient quand la page passe à l’arrière-plan, et se désabonne', () => {
    const target = new EventTarget();
    const page = Object.assign(target, { visibilityState: 'visible' as DocumentVisibilityState }) as unknown as Document;
    let hidden = 0;
    const stop = visibilityOf(() => page).onHidden(() => (hidden += 1));

    target.dispatchEvent(new Event('visibilitychange'));
    expect(hidden).toBe(0);

    Object.defineProperty(page, 'visibilityState', { value: 'hidden', configurable: true });
    target.dispatchEvent(new Event('visibilitychange'));
    expect(hidden).toBe(1);

    stop();
    target.dispatchEvent(new Event('visibilitychange'));
    expect(hidden).toBe(1);
  });

  test('sans document (rendu serveur, worker) : rien à écouter, aucune exception', () => {
    expect(() => visibilityOf(() => undefined).onHidden(() => undefined)()).not.toThrow();
  });
});

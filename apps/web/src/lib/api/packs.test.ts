import { describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from './conversations';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { packQueryKeys } from './pack-query-keys';
import { createPackGestureGuard } from './packs';
import {
  decodeFramePackDetail,
  decodeFramePackSummary,
  loadFramePack,
  loadFramePackCatalogue,
  loadInstalledFramePacks,
  setFramePackInstalled,
} from './packs-glory-frame';
import { INSTALLED_PACKS_QUERY_KEY, PACK_CATALOGUE_QUERY_KEY, packQueryKey } from './sticker-packs';

const SHA = 'a'.repeat(64);
const ref = (ext: string) => ({ src: `${SHA.slice(0, 16)}.${ext}`, bytes: 12, sha256: SHA });

const frameSummary = (slug: string, overrides: Record<string, unknown> = {}) => ({
  slug,
  name: 'Savane',
  description: 'Des cadres',
  author: 'Meeshy',
  builtin: false,
  status: 'approved',
  itemCount: 4,
  coverUrl: `/api/v1/pack-assets/${SHA.slice(0, 16)}.webp`,
  installed: false,
  installCount: 0,
  domain: 'glory-frame',
  origin: 'official',
  version: 1,
  downloadBytes: { story: 40_000, square: null },
  removable: true,
  names: { en: { name: 'Savanna', description: 'Frames' } },
  preview: null,
  usage: { kind: 'rank', rank: 'ambassadeur' },
  ...overrides,
});

type Call = { readonly method: string; readonly path: string };

const depsAnswering = (answer: (request: HttpRequest) => ApiResult<unknown>): { deps: ConversationsDeps; calls: Call[] } => {
  const calls: Call[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push({ method: request.method, path: request.path });
      return answer(request) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, calls };
};

describe('les clés de cache des packs', () => {
  test('les stickers gardent leurs clés HISTORIQUES, les cadres vivent sous leur domaine', () => {
    expect(packQueryKeys('sticker').installed).toEqual(['me', 'sticker-packs', 'installed']);
    expect(packQueryKeys('sticker').catalogue).toEqual(['me', 'sticker-packs', 'catalogue']);
    expect(packQueryKeys('sticker').detail('x')).toEqual(['sticker-pack', 'x']);
    expect(INSTALLED_PACKS_QUERY_KEY).toEqual(['me', 'sticker-packs', 'installed']);
    expect(PACK_CATALOGUE_QUERY_KEY).toEqual(['me', 'sticker-packs', 'catalogue']);
    expect(packQueryKey('x')).toEqual(['sticker-pack', 'x']);
    expect(packQueryKeys('glory-frame').installed).toEqual(['me', 'packs', 'glory-frame', 'installed']);
  });
});

describe('le décodeur des packs de cadres', () => {
  test('le prix et la possession servis se lisent ; sans prix, rien n’est inventé', () => {
    expect(decodeFramePackSummary(frameSummary('a', { price: 25, owned: false }))).toMatchObject({ price: 25, owned: false });
    expect('price' in (decodeFramePackSummary(frameSummary('a')) ?? {})).toBe(false);
  });

  test('un résumé lisible se lit, son usage et ses noms par langue compris', () => {
    const pack = decodeFramePackSummary(frameSummary('exemple-savane'));
    expect(pack?.slug).toBe('exemple-savane');
    expect(pack?.usage).toEqual({ kind: 'rank', rank: 'ambassadeur' });
    expect(pack?.names.en?.name).toBe('Savanna');
  });

  test('un usage illisible ou LIBRE ne fabrique rien : il devient null, le pack reste', () => {
    expect(decodeFramePackSummary(frameSummary('a', { usage: { kind: 'free', surfaces: ['call'] } }))?.usage).toBe(null);
    expect(decodeFramePackSummary(frameSummary('a', { usage: { kind: 'nimporte' } }))?.usage).toBe(null);
  });

  test('un pack malformé tombe SEUL dans la liste', async () => {
    const { deps } = depsAnswering(() => ({ ok: true, data: [frameSummary('a'), { slug: 42 }, frameSummary('b')] }));
    const result = await loadFramePackCatalogue(deps);
    expect(result.ok && result.data.map((pack) => pack.slug)).toEqual(['a', 'b']);
  });

  test('le détail porte son contrat et ses chaînes adressés par contenu', () => {
    const detail = decodeFramePackDetail({ ...frameSummary('a'), contractSchema: 1, contract: ref('json'), strings: { fr: ref('json') }, collections: [] });
    expect(detail?.contract.src).toBe(`${SHA.slice(0, 16)}.json`);
    expect(detail?.strings.fr?.sha256).toBe(SHA);
    expect(decodeFramePackDetail({ ...frameSummary('a'), contract: { src: 'pas-adresse.json', bytes: 1, sha256: SHA } })).toBe(null);
  });
});

describe('le port des packs de cadres', () => {
  test('un ANCIEN serveur (404 sur /packs/…) rend une boutique VIDE, sans erreur', async () => {
    const { deps } = depsAnswering(() => ({ ok: false, status: 404, error: 'Not Found' }));
    expect(await loadFramePackCatalogue(deps)).toEqual({ ok: true, data: [] });
    expect(await loadInstalledFramePacks(deps)).toEqual({ ok: true, data: [] });
  });

  test('une autre panne reste une panne', async () => {
    const { deps } = depsAnswering(() => ({ ok: false, status: 500, error: 'Boom' }));
    expect((await loadFramePackCatalogue(deps)).ok).toBe(false);
  });

  test('installer et retirer visent la route du domaine', async () => {
    const { deps, calls } = depsAnswering((request) => ({ ok: true, data: frameSummary('a', { installed: request.method === 'PUT' }) }));
    const installed = await setFramePackInstalled(deps, 'a', true);
    const removed = await setFramePackInstalled(deps, 'a', false);
    expect(calls).toEqual([
      { method: 'PUT', path: '/api/v1/packs/glory-frame/a/install' },
      { method: 'DELETE', path: '/api/v1/packs/glory-frame/a/install' },
    ]);
    expect(installed.ok && installed.data.installed).toBe(true);
    expect(removed.ok && removed.data.installed).toBe(false);
  });

  test('la source de démonstration ne fabrique AUCUN pack de cadres', async () => {
    const { deps, calls } = depsAnswering(() => ({ ok: true, data: [frameSummary('a')] }));
    expect(await loadFramePackCatalogue({ ...deps, source: 'fixtures' })).toEqual({ ok: true, data: [] });
    expect((await loadFramePack({ ...deps, source: 'fixtures' }, 'a')).ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('un geste en vol par pack', () => {
  test('un second geste sur le MÊME pack est refusé tant que le premier vole ; un autre pack passe', () => {
    const guard = createPackGestureGuard();
    expect(guard.tryBegin('a')).toBe(true);
    expect(guard.tryBegin('a')).toBe(false);
    expect(guard.tryBegin('b')).toBe(true);
    guard.end('a');
    expect(guard.tryBegin('a')).toBe(true);
  });
});

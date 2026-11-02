import { describe, expect, test } from 'bun:test';

import type { PreparedSceneExport } from './scene-export-assets';
import { brandPreparedScene, prepareBranding, withBranding, type BrandingDeps } from './scene-export-branding';
import type { BrandingAuthor } from './scene-export-branding-identity';
import { noRelationLevel } from './scene-export-branding-level';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { relationLevelProvider } from '@/lib/api/relation-level';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const signal = new AbortController().signal;

const author = (overrides: Partial<BrandingAuthor> = {}): BrandingAuthor => ({
  authorId: 'u-author',
  displayName: 'Windie Nh',
  username: 'windie',
  avatarSrc: 'https://cdn/a.jpg',
  bannerSrc: null,
  accentHex: '6366F1',
  moodEmoji: '🎉',
  moodMessage: null,
  presence: { isOnline: true, lastActiveAt: new Date(NOW - 1_000).toISOString() },
  self: false,
  ...overrides,
});

const depsWith = (overrides: Partial<BrandingDeps> = {}): BrandingDeps => ({
  loadImage: async () => ({ width: 10, height: 10 }) as unknown as CanvasImageSource,
  relationLevel: noRelationLevel,
  now: () => NOW,
  budgetMs: 50,
  ...overrides,
});

function servedLevels(level: unknown) {
  const requests: HttpRequest[] = [];
  const transport = (async () => ({ ok: true, data: { userId: 'u-author', effectiveLevel: level } })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return { ok: true, data: { userId: 'u-author', effectiveLevel: level } } satisfies ApiResult<unknown>;
  }) as HttpTransport['request'];
  return { transport, requests };
}

describe('le niveau de lien servi par GET /relations/:userId peint le logo de cercle', () => {
  const cases: readonly (readonly [string, string | null])[] = [
    ['CLOSE', '🔥'],
    ['BLOOD', '🩸'],
    ['FRIEND', null],
    ['PUBLIC', null],
  ];
  for (const [level, badge] of cases) {
    test(`niveau effectif ${level} : logo ${badge ?? 'aucun'}`, async () => {
      const { transport } = servedLevels(level);
      const prepared = await prepareBranding({ author: author(), deps: depsWith({ relationLevel: relationLevelProvider({ source: 'gateway', transport }) }), signal });
      expect(prepared.identity?.circleBadge).toBe(badge);
    });
  }

  test("sa propre story : la route n'est jamais appelée, aucun logo", async () => {
    const { transport, requests } = servedLevels('BLOOD');
    const prepared = await prepareBranding({ author: author({ self: true }), deps: depsWith({ relationLevel: relationLevelProvider({ source: 'gateway', transport }) }), signal });
    expect(prepared.identity?.circleBadge).toBeNull();
    expect(requests).toHaveLength(0);
  });

  test('sous fixtures : aucun appel, aucun logo', async () => {
    const { transport, requests } = servedLevels('BLOOD');
    const prepared = await prepareBranding({ author: author(), deps: depsWith({ relationLevel: relationLevelProvider({ source: 'fixtures', transport }) }), signal });
    expect(prepared.identity?.circleBadge).toBeNull();
    expect(requests).toHaveLength(0);
  });
});

describe("la préparation de l'emballage de marque", () => {
  test("un témoin injecte « CLOSE » dans le port et voit 🔥 dans le contenu d'intro", async () => {
    const seen: string[] = [];
    const prepared = await prepareBranding({
      author: author(),
      deps: depsWith({
        relationLevel: async ({ authorId }) => {
          seen.push(authorId);
          return 'CLOSE';
        },
      }),
      signal,
    });
    expect(prepared.identity?.circleBadge).toBe('🔥');
    expect(seen).toEqual(['u-author']);
  });

  test('avec le port par défaut, aucun logo : le niveau est inconnu', async () => {
    const prepared = await prepareBranding({ author: author(), deps: depsWith(), signal });
    expect(prepared.identity?.circleBadge).toBeNull();
  });

  test('la présence servie devient le point vert ; non servie, aucun point', async () => {
    expect((await prepareBranding({ author: author(), deps: depsWith(), signal })).identity?.presenceDotHex).toBe('#34D399');
    expect((await prepareBranding({ author: author({ presence: null }), deps: depsWith(), signal })).identity?.presenceDotHex).toBeNull();
  });

  test("un niveau de lien trop lent ne retarde pas l'export : il part sans logo", async () => {
    const startedAt = Date.now();
    const prepared = await prepareBranding({
      author: author(),
      deps: depsWith({ budgetMs: 20, relationLevel: () => new Promise((resolve) => setTimeout(() => resolve('BLOOD'), 300)) }),
      signal,
    });
    expect(prepared.identity?.circleBadge).toBeNull();
    expect(Date.now() - startedAt).toBeLessThan(200);
  });

  test("un avatar qui ne vient pas n'arrête rien : les initiales prennent sa place", async () => {
    const prepared = await prepareBranding({ author: author(), deps: depsWith({ loadImage: async () => Promise.reject(new Error('404')) }), signal });
    expect(prepared.images.avatar).toBeNull();
    expect(prepared.identity?.displayName).toBe('Windie Nh');
  });

  test("avec un auteur : une intro et une carte d'auteur ; sans auteur : pas d'intro, mais la carte de fin reste due", async () => {
    expect((await prepareBranding({ author: author(), deps: depsWith(), signal })).plan).toMatchObject({ hasIntro: true, outroDurationMs: 3_500 });
    expect((await prepareBranding({ author: null, deps: depsWith(), signal })).plan).toMatchObject({ hasIntro: false, storyStartMs: 0, outroDurationMs: 2_000 });
  });
});

describe('la scène posée dans son emballage', () => {
  const prepared = {
    plan: { slides: [{ sceneIndex: 0, startMs: 0, durationMs: 6_000 }], totalMs: 6_000, still: true, sounds: [] },
    assets: {},
    videos: new Map(),
    buffers: new Map(),
    missing: [],
    dispose: () => undefined,
  } as unknown as PreparedSceneExport;

  test('une story de 6 s avec intro et carte d\'auteur dure 1,2 + 6 − 1,5 + 3,5 s', async () => {
    const branding = await prepareBranding({ author: author(), deps: depsWith(), signal });
    const branded = withBranding(prepared, branding);
    expect(branded.plan.totalMs).toBe(1_200 + 6_000 - 1_500 + 3_500);
    expect(branded.plan.slides[0]?.startMs).toBe(1_200);
    expect(branded.plan.still).toBe(false);
    expect(branded.branding?.timeline.outroStartMs).toBe(5_700);
  });

  test('la préparation reste la même : elle garde son nettoyage', async () => {
    const branding = await prepareBranding({ author: null, deps: depsWith(), signal });
    expect(withBranding(prepared, branding).dispose).toBe(prepared.dispose);
  });
});

describe("l'emballage posé sur une story préparée, du port au contenu d'intro", () => {
  const preparedWith = (onDispose: () => void) =>
    ({
      plan: { slides: [{ sceneIndex: 0, startMs: 0, durationMs: 6_000 }], totalMs: 6_000, still: true, sounds: [] },
      assets: {},
      videos: new Map(),
      buffers: new Map(),
      missing: [],
      dispose: onDispose,
    }) as unknown as PreparedSceneExport;

  test("le niveau « CLOSE » servi par le port arrive jusqu'au contenu d'intro de la scène rendue : 🔥", async () => {
    const branded = await brandPreparedScene({
      prepared: preparedWith(() => undefined),
      author: author(),
      deps: depsWith({ relationLevel: async () => 'CLOSE' }),
      signal,
    });
    expect(branded === 'cancelled' ? null : branded.branding?.identity?.circleBadge).toBe('🔥');
  });

  test("un export annulé pendant la préparation de l'emballage libère la scène préparée et se dit annulé", async () => {
    const controller = new AbortController();
    const disposed: string[] = [];
    const branded = await brandPreparedScene({
      prepared: preparedWith(() => disposed.push('scene')),
      author: author(),
      deps: depsWith({
        relationLevel: async () => {
          controller.abort();
          return null;
        },
      }),
      signal: controller.signal,
    });
    expect(branded).toBe('cancelled');
    expect(disposed).toEqual(['scene']);
  });

  test("l'avatar et la bannière décodés pour l'emballage sont libérés avec la scène", async () => {
    const closed: string[] = [];
    const disposed: string[] = [];
    const bitmap = (name: string) => ({ width: 10, height: 10, close: () => closed.push(name) }) as unknown as CanvasImageSource;
    const branded = await brandPreparedScene({
      prepared: preparedWith(() => disposed.push('scene')),
      author: author({ bannerSrc: 'https://cdn/b.jpg' }),
      deps: depsWith({ loadImage: async (src) => bitmap(src.endsWith('b.jpg') ? 'banner' : 'avatar') }),
      signal,
    });
    if (branded === 'cancelled') throw new Error('attendu : une scène emballée');
    branded.dispose();
    expect(disposed).toEqual(['scene']);
    expect([...closed].sort()).toEqual(['avatar', 'banner']);
  });
});

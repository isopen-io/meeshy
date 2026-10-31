import { describe, expect, test } from 'bun:test';

import type { PreparedSceneExport } from './scene-export-assets';
import { prepareBranding, withBranding, type BrandingDeps } from './scene-export-branding';
import type { BrandingAuthor } from './scene-export-branding-identity';
import { noRelationLevel } from './scene-export-branding-level';

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

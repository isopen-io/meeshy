import { TopicSeedService } from '../../topics/TopicSeedService';
import { INITIAL_TOPICS } from '../../topics/seeds/initial-topics';

const REGIONAL_SLUGS = [
  'faits_divers_cameroun',
  'faits_divers_cote_ivoire',
  'faits_divers_gabon',
  'faits_divers_congo',
  'faits_divers_france',
  'faits_divers_usa',
  'faits_divers_canada',
  'people_afrique',
  'buzz_reseaux',
];

function makePrisma(existingSlugs: string[] = []) {
  return {
    agentTopicCatalog: {
      findMany: jest.fn(async () => existingSlugs.map((slug) => ({ slug }))),
      createMany: jest.fn(async (args: { data: Array<{ slug: string }> }) => ({ count: args.data.length })),
      update: jest.fn(),
    },
  } as any;
}

describe('TopicSeedService', () => {
  test('run() inserts every INITIAL_TOPICS entry when the catalog is empty', async () => {
    const prisma = makePrisma([]);
    const result = await new TopicSeedService(prisma).run();
    expect(prisma.agentTopicCatalog.createMany).toHaveBeenCalledTimes(1);
    const inserted = prisma.agentTopicCatalog.createMany.mock.calls[0][0].data as Array<{ slug: string }>;
    expect(inserted.map((t) => t.slug)).toEqual(INITIAL_TOPICS.map((t) => t.slug));
    expect(result).toEqual({ inserted: INITIAL_TOPICS.length, skipped: false });
  });

  test('run() inserts ONLY the slugs missing from an already-seeded catalog', async () => {
    const alreadyThere = INITIAL_TOPICS.slice(0, 13).map((t) => t.slug);
    const prisma = makePrisma(alreadyThere);
    const result = await new TopicSeedService(prisma).run();
    const inserted = prisma.agentTopicCatalog.createMany.mock.calls[0][0].data as Array<{ slug: string }>;
    expect(inserted.map((t) => t.slug)).toEqual(INITIAL_TOPICS.slice(13).map((t) => t.slug));
    expect(inserted.map((t) => t.slug)).toEqual(expect.arrayContaining(REGIONAL_SLUGS));
    expect(result).toEqual({ inserted: INITIAL_TOPICS.length - 13, skipped: false });
  });

  test('run() never rewrites a topic that already exists (admin edits are kept)', async () => {
    const prisma = makePrisma(INITIAL_TOPICS.map((t) => t.slug));
    const result = await new TopicSeedService(prisma).run();
    expect(prisma.agentTopicCatalog.createMany).not.toHaveBeenCalled();
    expect(prisma.agentTopicCatalog.update).not.toHaveBeenCalled();
    expect(result).toEqual({ inserted: 0, skipped: true });
  });

  test('run() survives a concurrent seed (P2002) without throwing', async () => {
    const prisma = makePrisma([]);
    prisma.agentTopicCatalog.createMany.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    const result = await new TopicSeedService(prisma).run();
    expect(result).toEqual({ inserted: 0, skipped: true });
  });

  test('INITIAL_TOPICS carries the 13 original topics plus the 9 faits-divers ones, all well-formed', () => {
    expect(INITIAL_TOPICS).toHaveLength(22);
    const slugs = INITIAL_TOPICS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual(expect.arrayContaining(REGIONAL_SLUGS));
    for (const t of INITIAL_TOPICS) {
      expect(t.slug).toMatch(/^[a-z0-9_]+$/);
      expect(t.label).toBeTruthy();
      expect(t.instructionTemplate.length).toBeGreaterThan(20);
      expect(t.instructionTemplate.length).toBeLessThanOrEqual(1000);
      expect(t.searchHintTemplate.length).toBeLessThanOrEqual(200);
      expect(t.keywordPatterns.length).toBeGreaterThan(0);
      expect(t.keywordPatterns.length).toBeLessThanOrEqual(10);
      expect(t.examples.length).toBeLessThanOrEqual(5);
      expect(t.priority).toBeGreaterThanOrEqual(0);
      expect(t.priority).toBeLessThanOrEqual(10);
      for (const src of t.keywordPatterns) {
        expect(src.length).toBeLessThanOrEqual(200);
        expect(() => new RegExp(src, 'i')).not.toThrow();
      }
    }
  });

  test('the faits-divers topics outrank the original ones by default', () => {
    const regional = INITIAL_TOPICS.filter((t) => REGIONAL_SLUGS.includes(t.slug));
    const original = INITIAL_TOPICS.filter((t) => !REGIONAL_SLUGS.includes(t.slug));
    for (const t of regional) expect(t.priority).toBeGreaterThan(0);
    for (const t of original) expect(t.priority).toBe(0);
  });

  test.each([
    ['faits_divers_cameroun', 'On a vu ça à Douala hier, kongossa de fou'],
    ['faits_divers_cote_ivoire', "Encore une histoire à Abidjan, Yopougon c'est chaud"],
    ['faits_divers_gabon', 'Libreville ce matin'],
    ['faits_divers_congo', 'Kinshasa et Brazzaville, les deux rives'],
    ['faits_divers_france', 'Paris et Marseille, la France quoi'],
    ['faits_divers_usa', 'Aux USA, à New York, ils ont fait quoi ?'],
    ['faits_divers_canada', 'Au Québec, à Montréal, il neige déjà'],
    ['people_afrique', 'Le mariage de la chanteuse a fait un clash'],
    ['buzz_reseaux', 'La vidéo TikTok est devenue virale'],
  ])('%s matches a conversation that mentions its region', (slug, sample) => {
    const topic = INITIAL_TOPICS.find((t) => t.slug === slug)!;
    const matched = topic.keywordPatterns.some((src) => new RegExp(src, 'i').test(sample));
    expect(matched).toBe(true);
  });

  test('regional search hints name the country so the web search stays local', () => {
    const expectations: Record<string, RegExp> = {
      faits_divers_cameroun: /cameroun/i,
      faits_divers_cote_ivoire: /ivoire/i,
      faits_divers_gabon: /gabon/i,
      faits_divers_congo: /congo/i,
      faits_divers_france: /france/i,
      faits_divers_usa: /(usa|états-unis|etats-unis)/i,
      faits_divers_canada: /canada/i,
    };
    for (const [slug, re] of Object.entries(expectations)) {
      const topic = INITIAL_TOPICS.find((t) => t.slug === slug)!;
      expect(topic.searchHintTemplate).toMatch(re);
    }
  });
});

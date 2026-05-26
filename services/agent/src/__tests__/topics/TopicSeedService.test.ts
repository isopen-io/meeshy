import { TopicSeedService } from '../../topics/TopicSeedService';
import { INITIAL_TOPICS } from '../../topics/seeds/initial-topics';

function makePrisma(initialCount: number = 0) {
  const rows: any[] = [];
  return {
    agentTopicCatalog: {
      count: jest.fn(async () => initialCount),
      createMany: jest.fn(async (args: { data: any[]; skipDuplicates?: boolean }) => {
        rows.push(...args.data);
        return { count: args.data.length };
      }),
    },
  } as any;
}

describe('TopicSeedService', () => {
  test('run() inserts INITIAL_TOPICS when catalog empty', async () => {
    const prisma = makePrisma(0);
    const svc = new TopicSeedService(prisma);
    const result = await svc.run();
    expect(prisma.agentTopicCatalog.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.agentTopicCatalog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ slug: 'ai_tech' })]),
    });
    expect(result.inserted).toBe(INITIAL_TOPICS.length);
    expect(result.skipped).toBe(false);
  });

  test('run() no-op when catalog non-empty', async () => {
    const prisma = makePrisma(5);
    const svc = new TopicSeedService(prisma);
    const result = await svc.run();
    expect(prisma.agentTopicCatalog.createMany).not.toHaveBeenCalled();
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(true);
  });

  test('INITIAL_TOPICS has 13 topics with valid structure', () => {
    expect(INITIAL_TOPICS).toHaveLength(13);
    for (const t of INITIAL_TOPICS) {
      expect(t.slug).toMatch(/^[a-z0-9_]+$/);
      expect(t.label).toBeTruthy();
      expect(t.instructionTemplate.length).toBeGreaterThan(20);
      expect(t.keywordPatterns.length).toBeGreaterThan(0);
    }
  });
});

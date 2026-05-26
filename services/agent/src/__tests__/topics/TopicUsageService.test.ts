import { TopicUsageService } from '../../topics/TopicUsageService';
import type { TopicCatalogEntry } from '../../topics/types';

function makeTopic(overrides: Partial<TopicCatalogEntry> = {}): TopicCatalogEntry {
  return {
    id: 't1', slug: 's1', label: 'L1', description: null,
    keywordPatterns: [], instructionTemplate: '', searchHintTemplate: '',
    examples: [], cooldownMinutes: 60, isActive: true,
    ...overrides,
  };
}

function makePrisma(usages: { topicId: string; conversationId: string; usedAt: Date }[] = []) {
  return {
    agentTopicUsageLog: {
      create: jest.fn(async (args: { data: any }) => {
        usages.push(args.data);
        return args.data;
      }),
      findMany: jest.fn(async (args: any) => {
        const filter = args.where;
        return usages
          .filter((u) =>
            u.conversationId === filter.conversationId &&
            (filter.topicId?.in ? filter.topicId.in.includes(u.topicId) : true)
          )
          .sort((a, b) => b.usedAt.getTime() - a.usedAt.getTime());
      }),
    },
  } as any;
}

describe('TopicUsageService', () => {
  test('record() inserts AgentTopicUsageLog', async () => {
    const usages: any[] = [];
    const prisma = makePrisma(usages);
    const svc = new TopicUsageService(prisma);
    await svc.record('t1', 'conv1');
    expect(prisma.agentTopicUsageLog.create).toHaveBeenCalledWith({
      data: { topicId: 't1', conversationId: 'conv1' },
    });
  });

  test('filterEligible() returns all topics when no usage recorded', async () => {
    const prisma = makePrisma();
    const svc = new TopicUsageService(prisma);
    const topics = [makeTopic({ id: 't1' }), makeTopic({ id: 't2' })];
    const eligible = await svc.filterEligible(topics, 'conv1');
    expect(eligible).toHaveLength(2);
  });

  test('filterEligible() excludes topic in cooldown window', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
    const prisma = makePrisma([{ topicId: 't1', conversationId: 'conv1', usedAt: tenMinutesAgo }]);
    const svc = new TopicUsageService(prisma);
    const topics = [makeTopic({ id: 't1', cooldownMinutes: 60 })];
    const eligible = await svc.filterEligible(topics, 'conv1');
    expect(eligible).toHaveLength(0);
  });

  test('filterEligible() includes topic past cooldown window', async () => {
    const twoHoursAgo = new Date(Date.now() - 120 * 60_000);
    const prisma = makePrisma([{ topicId: 't1', conversationId: 'conv1', usedAt: twoHoursAgo }]);
    const svc = new TopicUsageService(prisma);
    const topics = [makeTopic({ id: 't1', cooldownMinutes: 60 })];
    const eligible = await svc.filterEligible(topics, 'conv1');
    expect(eligible).toHaveLength(1);
  });

  test('filterEligible() ignores usage from other conversation', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
    const prisma = makePrisma([{ topicId: 't1', conversationId: 'OTHER', usedAt: tenMinutesAgo }]);
    const svc = new TopicUsageService(prisma);
    const topics = [makeTopic({ id: 't1', cooldownMinutes: 60 })];
    const eligible = await svc.filterEligible(topics, 'conv1');
    expect(eligible).toHaveLength(1);
  });

  test('filterEligible() returns empty when topics list empty', async () => {
    const prisma = makePrisma();
    const svc = new TopicUsageService(prisma);
    const eligible = await svc.filterEligible([], 'conv1');
    expect(eligible).toHaveLength(0);
  });
});

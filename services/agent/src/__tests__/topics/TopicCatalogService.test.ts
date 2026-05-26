import { TopicCatalogService } from '../../topics/TopicCatalogService';
import type { TopicCatalogEntry } from '../../topics/types';

function makeRedisStore() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, _mode?: string, _ttl?: number) => {
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
  };
}

function makePrisma(initial: TopicCatalogEntry[] = []) {
  let rows = [...initial];
  return {
    agentTopicCatalog: {
      findMany: jest.fn(async (_args?: any) => rows),
      findUnique: jest.fn(async (args: { where: { id?: string; slug?: string } }) => {
        return rows.find((r) => r.id === args.where.id || r.slug === args.where.slug) ?? null;
      }),
      create: jest.fn(async (args: { data: Omit<TopicCatalogEntry, 'id'> }) => {
        const row = { id: `t${rows.length + 1}`, ...args.data } as TopicCatalogEntry;
        rows.push(row);
        return row;
      }),
      update: jest.fn(async (args: { where: { id: string }; data: Partial<TopicCatalogEntry> }) => {
        const idx = rows.findIndex((r) => r.id === args.where.id);
        if (idx < 0) throw new Error('not found');
        rows[idx] = { ...rows[idx], ...args.data };
        return rows[idx];
      }),
      delete: jest.fn(async (args: { where: { id: string } }) => {
        rows = rows.filter((r) => r.id !== args.where.id);
        return undefined;
      }),
    },
  } as any;
}

function makeTopic(overrides: Partial<TopicCatalogEntry> = {}): TopicCatalogEntry {
  return {
    id: 't1',
    slug: 'sample',
    label: 'Sample',
    description: null,
    keywordPatterns: ['\\bsample\\b'],
    instructionTemplate: 'Sample {{label}}',
    searchHintTemplate: 'sample search',
    examples: [],
    cooldownMinutes: 60,
    isActive: true,
    ...overrides,
  };
}

describe('TopicCatalogService', () => {
  test('list({activeOnly:true}) hits prisma on first call', async () => {
    const redis = makeRedisStore();
    const prisma = makePrisma([makeTopic()]);
    const svc = new TopicCatalogService(prisma, redis as any);
    const list = await svc.list({ activeOnly: true });
    expect(list).toHaveLength(1);
    expect(prisma.agentTopicCatalog.findMany).toHaveBeenCalledTimes(1);
  });

  test('list() second call hits redis cache, not prisma', async () => {
    const redis = makeRedisStore();
    const prisma = makePrisma([makeTopic()]);
    const svc = new TopicCatalogService(prisma, redis as any);
    await svc.list({ activeOnly: true });
    await svc.list({ activeOnly: true });
    expect(prisma.agentTopicCatalog.findMany).toHaveBeenCalledTimes(1);
    expect(redis.get).toHaveBeenCalled();
  });

  test('invalidate() clears redis + memory caches', async () => {
    const redis = makeRedisStore();
    const prisma = makePrisma([makeTopic()]);
    const svc = new TopicCatalogService(prisma, redis as any);
    await svc.list({ activeOnly: true });
    await svc.invalidate();
    expect(redis.del).toHaveBeenCalled();
    await svc.list({ activeOnly: true });
    expect(prisma.agentTopicCatalog.findMany).toHaveBeenCalledTimes(2);
  });

  test('compiledPatternsFor() returns pre-compiled regexes', async () => {
    const redis = makeRedisStore();
    const topic = makeTopic({ keywordPatterns: ['\\bai\\b', '\\bllm\\b'] });
    const prisma = makePrisma([topic]);
    const svc = new TopicCatalogService(prisma, redis as any);
    await svc.list({ activeOnly: true });
    const regexes = svc.compiledPatternsFor(topic.id);
    expect(regexes).toHaveLength(2);
    expect(regexes[0].test('this is ai stuff')).toBe(true);
    expect(regexes[1].test('llm models')).toBe(true);
  });

  test('compiledPatternsFor() returns empty array for unknown id', () => {
    const redis = makeRedisStore();
    const prisma = makePrisma();
    const svc = new TopicCatalogService(prisma, redis as any);
    expect(svc.compiledPatternsFor('unknown')).toEqual([]);
  });

  test('create() calls prisma.create + invalidates cache', async () => {
    const redis = makeRedisStore();
    const prisma = makePrisma();
    const svc = new TopicCatalogService(prisma, redis as any);
    await svc.list({ activeOnly: true });
    const input: any = { ...makeTopic() };
    delete input.id;
    await svc.create(input);
    expect(prisma.agentTopicCatalog.create).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalled();
  });

  test('update() calls prisma.update + invalidates cache', async () => {
    const redis = makeRedisStore();
    const prisma = makePrisma([makeTopic()]);
    const svc = new TopicCatalogService(prisma, redis as any);
    await svc.update('t1', { label: 'Updated' });
    expect(prisma.agentTopicCatalog.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { label: 'Updated' },
    });
    expect(redis.del).toHaveBeenCalled();
  });

  test('delete() with hard=true calls prisma.delete + invalidates', async () => {
    const redis = makeRedisStore();
    const prisma = makePrisma([makeTopic()]);
    const svc = new TopicCatalogService(prisma, redis as any);
    await svc.delete('t1', { hard: true });
    expect(prisma.agentTopicCatalog.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });

  test('delete() default soft delete = update isActive=false', async () => {
    const redis = makeRedisStore();
    const prisma = makePrisma([makeTopic()]);
    const svc = new TopicCatalogService(prisma, redis as any);
    await svc.delete('t1');
    expect(prisma.agentTopicCatalog.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { isActive: false },
    });
  });
});

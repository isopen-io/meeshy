import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { purgeRemovedSoundFiles, runSoundFilePurgeIfEnabled, soundFilePurgeEnabled, type SoundFileStore } from '../../../services/posts/soundPurge';
import { staticFileUrl } from '../../../services/posts/soundFormats';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

type SoundRow = {
  id: string;
  fileUrl: string;
  deletedAt: Date | null;
  mutedAt: Date | null;
};

type World = {
  sounds: ReadonlyArray<SoundRow>;
  usages: ReadonlyArray<{ soundId: string }>;
  files: Set<string>;
};

const removed = new Date('2026-11-01T00:00:00Z');

function sound(overrides: Partial<SoundRow> & { id: string }): SoundRow {
  return {
    fileUrl: staticFileUrl(`${overrides.id}.m4a`),
    deletedAt: removed,
    mutedAt: null,
    ...overrides,
  };
}

function world(sounds: ReadonlyArray<SoundRow>, usages: ReadonlyArray<{ soundId: string }> = []): World {
  return {
    sounds,
    usages,
    files: new Set(sounds.map((s) => s.fileUrl.split('/').pop() ?? '')),
  };
}

function usedIds(w: World): Set<string> {
  return new Set(w.usages.map((u) => u.soundId));
}

function fakePrisma(w: World): PrismaClient {
  const sound = {
    findMany: async ({ where, take }: { where: Record<string, unknown>; take: number }) => {
      const after = (where['id'] as { gt?: string } | undefined)?.gt;
      return [...w.sounds]
        .sort((x, y) => x.id.localeCompare(y.id))
        .filter((s) => s.deletedAt !== null && s.mutedAt === null && !usedIds(w).has(s.id))
        .filter((s) => after === undefined || s.id > after)
        .slice(0, take)
        .map((s) => ({ id: s.id, fileUrl: s.fileUrl, deletedAt: s.deletedAt, mutedAt: s.mutedAt }));
    },
    count: async ({ where }: { where: { fileUrl: string; id: { not: string } } }) =>
      w.sounds.filter((s) => s.fileUrl === where.fileUrl && s.id !== where.id.not).length,
  };
  const soundUsage = {
    count: async ({ where }: { where: { soundId: string } }) =>
      w.usages.filter((u) => u.soundId === where.soundId).length,
  };
  return { sound, soundUsage } as unknown as PrismaClient;
}

function fakeStore(w: World): SoundFileStore & { removedNames: string[] } {
  const removedNames: string[] = [];
  return {
    removedNames,
    remove: async (filename: string) => {
      if (!w.files.has(filename)) return 'absent';
      w.files.delete(filename);
      removedNames.push(filename);
      return 'removed';
    },
  };
}

describe('purgeRemovedSoundFiles (#9854)', () => {
  it('supprime le fichier d\'un son retiré qui n\'a plus aucun usage', async () => {
    const w = world([sound({ id: 'a' })]);
    const store = fakeStore(w);

    const result = await purgeRemovedSoundFiles({ prisma: fakePrisma(w), store });

    expect(store.removedNames).toEqual(['a.m4a']);
    expect(result.removed).toBe(1);
  });

  it('garde le fichier d\'un son retiré encore utilisé par une publication', async () => {
    const w = world([sound({ id: 'a' })], [{ soundId: 'a' }]);
    const store = fakeStore(w);

    await purgeRemovedSoundFiles({ prisma: fakePrisma(w), store });

    expect(store.removedNames).toEqual([]);
    expect(w.files.has('a.m4a')).toBe(true);
  });

  it('ne touche jamais un son coupé (preuve de modération) ni un son vivant', async () => {
    const w = world([
      sound({ id: 'muted', mutedAt: removed }),
      sound({ id: 'alive', deletedAt: null }),
    ]);
    const store = fakeStore(w);

    await purgeRemovedSoundFiles({ prisma: fakePrisma(w), store });

    expect(store.removedNames).toEqual([]);
  });

  it('garde un fichier qu\'une autre ligne Sound cite encore', async () => {
    const shared = staticFileUrl('shared.m4a');
    const w = world([
      sound({ id: 'a', fileUrl: shared }),
      sound({ id: 'b', fileUrl: shared, deletedAt: null }),
    ]);
    const store = fakeStore(w);

    await purgeRemovedSoundFiles({ prisma: fakePrisma(w), store });

    expect(store.removedNames).toEqual([]);
  });

  it('ignore une adresse qui ne désigne pas un fichier du volume des sons', async () => {
    const w = world([
      sound({ id: 'x', fileUrl: 'https://static.example/../../etc/passwd' }),
      sound({ id: 'y', fileUrl: staticFileUrl('notes.txt') }),
    ]);
    const store = fakeStore(w);

    await purgeRemovedSoundFiles({ prisma: fakePrisma(w), store });

    expect(store.removedNames).toEqual([]);
  });

  it('est idempotente : un rejeu ne supprime rien de plus', async () => {
    const w = world([sound({ id: 'a' }), sound({ id: 'b' })], [{ soundId: 'b' }]);
    const store = fakeStore(w);

    await purgeRemovedSoundFiles({ prisma: fakePrisma(w), store });
    const replay = await purgeRemovedSoundFiles({ prisma: fakePrisma(w), store });

    expect(store.removedNames).toEqual(['a.m4a']);
    expect(replay.removed).toBe(0);
  });

  it('parcourt toutes les fournées sans boucler sur un fichier qui résiste', async () => {
    const w = world([sound({ id: 'a' }), sound({ id: 'b' }), sound({ id: 'c' })]);
    const store: SoundFileStore & { removedNames: string[] } = {
      removedNames: [],
      remove: async (filename: string) => {
        if (filename === 'a.m4a') throw new Error('EACCES');
        store.removedNames.push(filename);
        return 'removed';
      },
    };

    const result = await purgeRemovedSoundFiles({ prisma: fakePrisma(w), store, batchSize: 1 });

    expect(store.removedNames).toEqual(['b.m4a', 'c.m4a']);
    expect(result).toEqual({ removed: 2, failed: 1 });
  });
});

describe('purgeRemovedSoundFiles — la destruction ne se fie pas à la seule requête (#9854)', () => {
  type Doc = MongoDocument & { id: string; fileUrl: string };

  function connector(docs: ReadonlyArray<Doc>, options: { honourWhere: boolean }) {
    const wheres: MongoDocument[] = [];
    const prisma = {
      sound: {
        findMany: async ({ where, take }: { where: MongoDocument; take: number }) => {
          wheres.push(where);
          const after = (where['id'] as { gt?: string } | undefined)?.gt;
          return [...docs]
            .sort((x, y) => x.id.localeCompare(y.id))
            .filter((d) => after === undefined || d.id > after)
            .filter((d) => !options.honourWhere || matchesMongoWhere(d, where))
            .slice(0, take)
            .map((d) => ({
              id: d.id,
              fileUrl: d.fileUrl,
              deletedAt: (d['deletedAt'] as Date | null | undefined) ?? null,
              mutedAt: (d['mutedAt'] as Date | null | undefined) ?? null,
            }));
        },
        count: async () => 0,
      },
      soundUsage: { count: async () => 0 },
    } as unknown as PrismaClient;
    return { prisma, wheres };
  }

  function recordingStore(): SoundFileStore & { removedNames: string[] } {
    const removedNames: string[] = [];
    return {
      removedNames,
      remove: async (filename: string) => {
        removedNames.push(filename);
        return 'removed';
      },
    };
  }

  const liveNeverRemoved: Doc = { id: 'live', fileUrl: staticFileUrl('live.m4a'), usages: [] };
  const mutedRemoved: Doc = { id: 'muted', fileUrl: staticFileUrl('muted.m4a'), deletedAt: removed, mutedAt: removed, usages: [] };
  const removedUnused: Doc = { id: 'gone', fileUrl: staticFileUrl('gone.m4a'), deletedAt: removed, usages: [] };

  it('la clause, lue avec la sémantique Mongo, n\'apparie ni un son vivant à `deletedAt` ABSENT ni un son coupé', async () => {
    const { prisma } = connector([liveNeverRemoved, mutedRemoved, removedUnused], { honourWhere: true });
    const store = recordingStore();

    await purgeRemovedSoundFiles({ prisma, store });

    expect(store.removedNames).toEqual(['gone.m4a']);
  });

  it('un candidat rendu sans retrait ou coupé (pipeline d\'agrégation, ordre BSON) ne perd jamais son fichier', async () => {
    const { prisma } = connector([liveNeverRemoved, mutedRemoved, removedUnused], { honourWhere: false });
    const store = recordingStore();

    const result = await purgeRemovedSoundFiles({ prisma, store });

    expect(store.removedNames).toEqual(['gone.m4a']);
    expect(result.removed).toBe(1);
  });
});

describe('soundFilePurgeEnabled (#9854)', () => {
  it('est coupée par défaut : la première passe sur des données réelles attend un feu vert explicite', () => {
    expect(soundFilePurgeEnabled({})).toBe(false);
    expect(soundFilePurgeEnabled({ SOUND_FILE_PURGE_ENABLED: 'true' })).toBe(true);
  });
});

describe('runSoundFilePurgeIfEnabled (#9854)', () => {
  it('ne touche à rien tant que le drapeau est coupé', async () => {
    const w = world([sound({ id: 'a' })]);
    const store = fakeStore(w);

    const result = await runSoundFilePurgeIfEnabled({ prisma: fakePrisma(w), store, env: {} });

    expect(result).toBeNull();
    expect(store.removedNames).toEqual([]);
  });

  it('passe quand le drapeau est levé', async () => {
    const w = world([sound({ id: 'a' })]);
    const store = fakeStore(w);

    const result = await runSoundFilePurgeIfEnabled({
      prisma: fakePrisma(w),
      store,
      env: { SOUND_FILE_PURGE_ENABLED: 'true' },
    });

    expect(result).toEqual({ removed: 1, failed: 0 });
  });
});

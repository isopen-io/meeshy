/**
 * Un consentement à l'enregistrement s'inscrit aussi sur une demande qui ne
 * porte pas la liste `consentedUserIds` (#8309).
 *
 * `CallRecording.consentedUserIds` est né sans `@default([])`. `addConsent`
 * n'écrivait que si `NOT: { consentedUserIds: { has: userId } }` — une
 * négation que Prisma, sur MongoDB, n'apparie jamais quand la clé est absente :
 * le consentement était perdu en silence et l'enregistrement ne démarrait
 * jamais. Le double évalue le `where` avec les sémantiques MESURÉES.
 */
import { describe, it, expect } from '@jest/globals';
import { prismaCallRecordingRepository } from '../callRecordingRepository';
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';

const pending = (overrides: MongoDocument = {}): MongoDocument => ({
  id: 'rec-1',
  callSessionId: 'call-1',
  requesterId: 'alice',
  requiredUserIds: ['bob'],
  requestedAt: new Date(0),
  ...overrides,
});

const store = (initial: MongoDocument) => {
  const state = { row: initial };
  const push = (row: MongoDocument, data: MongoDocument): MongoDocument =>
    Object.entries(data).reduce<MongoDocument>((acc, [key, value]) => {
      const pushed = (value as { push?: unknown }).push;
      return pushed === undefined ? { ...acc, [key]: value } : { ...acc, [key]: [...((acc[key] as unknown[]) ?? []), pushed] };
    }, row);
  const prisma = {
    callRecording: {
      findFirst: async ({ where }: { where: MongoDocument }) => (matchesMongoWhere(state.row, where) ? state.row : null),
      findUnique: async ({ where }: { where: MongoDocument }) => (matchesMongoWhere(state.row, where) ? state.row : null),
      updateMany: async ({ where, data }: { where: MongoDocument; data: MongoDocument }) => {
        if (!matchesMongoWhere(state.row, where)) return { count: 0 };
        state.row = push(state.row, data);
        return { count: 1 };
      },
    },
  };
  return { state, repository: prismaCallRecordingRepository(prisma as never) };
};

describe('addConsent sur une demande sans la liste consentedUserIds (#8309)', () => {
  it('inscrit le consentement', async () => {
    const { state, repository } = store(pending());
    await repository.addConsent('rec-1', 'bob');
    expect(state.row.consentedUserIds).toEqual(['bob']);
  });

  it('ne l’inscrit qu’une fois', async () => {
    const { state, repository } = store(pending());
    await repository.addConsent('rec-1', 'bob');
    await repository.addConsent('rec-1', 'bob');
    expect(state.row.consentedUserIds).toEqual(['bob']);
  });

  it('n’écrit rien sur une demande déjà démarrée', async () => {
    const { state, repository } = store(pending({ startedAt: new Date(1) }));
    await repository.addConsent('rec-1', 'bob');
    expect(state.row.consentedUserIds).toBeUndefined();
  });
});

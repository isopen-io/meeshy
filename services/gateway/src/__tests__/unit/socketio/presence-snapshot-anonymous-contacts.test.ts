/**
 * L'instantané de présence d'un inscrit compte aussi ses co-participants
 * ANONYMES (#8309).
 *
 * Un invité par lien n'a pas de compte : Prisma n'écrit pas sa clé `userId`.
 * L'instantané excluait le lecteur par `NOT: { userId }` — une négation que
 * Prisma, sur MongoDB, n'apparie jamais quand la clé est absente : chaque
 * invité disparaissait de la liste « registered + anonymes » qu'il annonce.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { presenceSnapshotContactsWhere } from '../../../socketio/presence-snapshot-contacts';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

const CONVERSATION = 'conv-1';
const READER = 'user-reader';

const rows: readonly MongoDocument[] = [
  { id: 'p-reader', conversationId: CONVERSATION, isActive: true, userId: READER },
  { id: 'p-friend', conversationId: CONVERSATION, isActive: true, userId: 'user-friend' },
  { id: 'p-guest', conversationId: CONVERSATION, isActive: true },
  { id: 'p-gone', conversationId: CONVERSATION, isActive: false, userId: 'user-gone' },
  { id: 'p-elsewhere', conversationId: 'conv-2', isActive: true, userId: 'user-elsewhere' },
];

const contacts = (viewer: { viewerId: string; isAnonymous: boolean }) =>
  rows
    .filter((row) => matchesMongoWhere(row, presenceSnapshotContactsWhere({ conversationIds: [CONVERSATION], ...viewer }) as MongoDocument))
    .map((row) => row.id);

describe('les contacts de l’instantané de présence (#8309)', () => {
  it('rend, à un inscrit, ses co-participants inscrits ET anonymes, sans lui-même', () => {
    expect(contacts({ viewerId: READER, isAnonymous: false })).toEqual(['p-friend', 'p-guest']);
  });

  it('rend, à un anonyme, tous les autres participants actifs, sans lui-même', () => {
    expect(contacts({ viewerId: 'p-guest', isAnonymous: true })).toEqual(['p-reader', 'p-friend']);
  });
});

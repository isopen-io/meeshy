/**
 * `emitMentionCreated` — le seul éventail `mention:created` des chemins
 * d'édition, quel qu'en soit le transport.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { emitMentionCreated } from '../../../socketio/emitMentionCreated';

const CONTEXT = {
  messageId: 'msg-1',
  conversationId: 'conv-1',
  editorUserId: 'u-editor',
  content: 'salut @bob',
  timestamp: new Date('2026-08-08T10:00:00.000Z'),
};

function makeIO() {
  const byRoom = new Map<string, { emit: jest.Mock<any> }>();
  const io = {
    to: jest.fn((room: string) => {
      const known = byRoom.get(room);
      if (known) return known;
      const target = { emit: jest.fn<any>() };
      byRoom.set(room, target);
      return target;
    }),
  };
  return { io, emitsTo: (room: string) => byRoom.get(room)?.emit.mock.calls ?? [] };
}

describe('emitMentionCreated', () => {
  it('émet dans le salon PERSONNEL de chaque entrant', () => {
    const { io, emitsTo } = makeIO();

    emitMentionCreated({ io, newlyMentionedUserIds: ['u-bob', 'u-carol'], ...CONTEXT });

    expect(emitsTo('user:u-bob')).toEqual([[
      'mention:created',
      {
        messageId: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'u-editor',
        mentionedUserId: 'u-bob',
        content: 'salut @bob',
        timestamp: '2026-08-08T10:00:00.000Z',
      },
    ]]);
    expect(emitsTo('user:u-carol')).toHaveLength(1);
  });

  // Se notifier soi-même est un bruit pur : l'auteur SAIT qu'il vient de se nommer.
  it('saute l’auteur quand il se nomme lui-même', () => {
    const { io, emitsTo } = makeIO();

    emitMentionCreated({ io, newlyMentionedUserIds: ['u-editor', 'u-bob'], ...CONTEXT });

    expect(emitsTo('user:u-editor')).toEqual([]);
    expect(emitsTo('user:u-bob')).toHaveLength(1);
  });

  it('ne touche à rien sans entrant', () => {
    const { io } = makeIO();

    emitMentionCreated({ io, newlyMentionedUserIds: [], ...CONTEXT });

    expect(io.to).not.toHaveBeenCalled();
  });

  it('ne lève pas sans couche Socket.IO', () => {
    expect(() => emitMentionCreated({ io: null, newlyMentionedUserIds: ['u-bob'], ...CONTEXT })).not.toThrow();
  });

  // Un éventail en panne ne doit pas défaire une édition déjà commise.
  it('signale une émission en échec sans lever, et continue vers les suivants', () => {
    const onError = jest.fn();
    const boom = new Error('socket closed');
    const emits: Record<string, jest.Mock<any>> = {};
    const io = {
      to: jest.fn((room: string) => {
        emits[room] ??= jest.fn<any>(() => {
          if (room === 'user:u-bob') throw boom;
        });
        return { emit: emits[room] };
      }),
    };

    expect(() => emitMentionCreated({
      io, newlyMentionedUserIds: ['u-bob', 'u-carol'], ...CONTEXT, onError,
    })).not.toThrow();

    expect(onError).toHaveBeenCalledWith(boom);
    expect(emits['user:u-carol']).toHaveBeenCalled();
  });
});

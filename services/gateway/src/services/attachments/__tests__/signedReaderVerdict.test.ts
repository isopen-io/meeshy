/**
 * #9600 — le lecteur d'une adresse signée est jugé comme celui d'une route par
 * identifiant (#9589) : membre ACTIF de la conversation du message porteur,
 * message encore vivant, et son échéance à lui pas encore passée.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { VIEW_ONCE_BURN_GRACE_MS } from '../../messaging/scheduleViewOnceBurn';
import { resolveSignedReaderVerdict } from '../attachmentReadVerdict';

const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const MESSAGE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const CONVERSATION = 'dddddddddddddddddddddd01';
const READER = 'cccccccccccccccccccccc01';
const SENDER = 'cccccccccccccccccccccc02';
const NOW = new Date('2026-10-08T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (ms: number) => new Date(NOW.getTime() + ms);

type Participant = { id: string; conversationId: string; isActive: boolean };

const carrier = (over: Record<string, unknown> = {}) => ({
  conversationId: CONVERSATION,
  deletedAt: null,
  viewOnceBurnAt: null,
  senderId: SENDER,
  createdAt: ago(60_000),
  expiresAt: null,
  isViewOnce: false,
  effectFlags: 0,
  ephemeralDuration: null,
  ...over,
});

function prismaWith(input: {
  piece?: { messageId: string | null; isViewOnce: boolean } | null;
  message?: ReturnType<typeof carrier> | null;
  participants?: Participant[];
  entry?: { ephemeralExpiresAt: Date | null; viewedOnceAt: Date | null } | null;
}) {
  const participants = input.participants ?? [{ id: READER, conversationId: CONVERSATION, isActive: true }];
  const participantFindFirst = jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
    participants.find((p) => Object.entries(where).every(([field, value]) => (p as Record<string, unknown>)[field] === value)) ?? null,
  );
  return {
    prisma: {
      messageAttachment: {
        findUnique: jest.fn(async () => (input.piece === undefined ? { messageId: MESSAGE, isViewOnce: false } : input.piece)),
      },
      message: { findUnique: jest.fn(async () => (input.message === undefined ? carrier() : input.message)) },
      participant: { findFirst: participantFindFirst },
      messageStatusEntry: { findFirst: jest.fn(async () => input.entry ?? null) },
    },
    participantFindFirst,
  };
}

const verdictOf = (setup: ReturnType<typeof prismaWith>, reader = READER) =>
  resolveSignedReaderVerdict(setup.prisma as never, { attachmentId: PIECE, readerParticipantId: reader, now: NOW });

describe('resolveSignedReaderVerdict', () => {
  it('admet le membre actif dont le contenu vit encore', async () => {
    expect(await verdictOf(prismaWith({}))).toBe('allow');
  });

  it('cherche le lecteur PAR SON IDENTIFIANT de participant, dans la conversation du message, actif', async () => {
    const setup = prismaWith({});
    await verdictOf(setup);
    expect(setup.participantFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: READER, conversationId: CONVERSATION, isActive: true } }),
    );
  });

  it("refuse un participant qui a quitté la conversation, ou celui d'une AUTRE conversation", async () => {
    expect(await verdictOf(prismaWith({ participants: [{ id: READER, conversationId: CONVERSATION, isActive: false }] }))).not.toBe('allow');
    expect(await verdictOf(prismaWith({ participants: [{ id: READER, conversationId: 'dddddddddddddddddddddd02', isActive: true }] }))).not.toBe('allow');
  });

  it("refuse une pièce disparue, pas encore rattachée, ou dont le message n'existe plus", async () => {
    expect(await verdictOf(prismaWith({ piece: null }))).not.toBe('allow');
    expect(await verdictOf(prismaWith({ piece: { messageId: null, isViewOnce: false } }))).not.toBe('allow');
    expect(await verdictOf(prismaWith({ message: null }))).not.toBe('allow');
  });

  it('refuse le fichier d\'un message rappelé ou détruit', async () => {
    expect(await verdictOf(prismaWith({ message: carrier({ deletedAt: ago(1_000) }) }))).toBe('gone');
    expect(await verdictOf(prismaWith({ message: carrier({ expiresAt: ago(1_000) }) }))).toBe('gone');
  });

  it('refuse à CE lecteur une flamme dont son décompte est fini, même si le message vit pour les autres', async () => {
    const flame = carrier({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30, expiresAt: ahead(3_600_000) });
    expect(await verdictOf(prismaWith({ message: flame, entry: { ephemeralExpiresAt: ago(1), viewedOnceAt: null } }))).toBe('gone');
    expect(await verdictOf(prismaWith({ message: flame, entry: { ephemeralExpiresAt: ahead(10_000), viewedOnceAt: null } }))).toBe('allow');
  });

  it('refuse à CE lecteur une vue unique ouverte depuis plus que son sursis', async () => {
    const viewOnce = carrier({ isViewOnce: true });
    const opened = (ms: number) => ({ ephemeralExpiresAt: null, viewedOnceAt: ago(ms) });
    expect(await verdictOf(prismaWith({ message: viewOnce, entry: opened(VIEW_ONCE_BURN_GRACE_MS) }))).toBe('gone');
    expect(await verdictOf(prismaWith({ message: viewOnce, entry: opened(VIEW_ONCE_BURN_GRACE_MS - 1_000) }))).toBe('allow');
  });

  it('lit la vue unique PROPRE à la pièce', async () => {
    const setup = prismaWith({ piece: { messageId: MESSAGE, isViewOnce: true }, entry: { ephemeralExpiresAt: null, viewedOnceAt: ago(VIEW_ONCE_BURN_GRACE_MS) } });
    expect(await verdictOf(setup)).toBe('gone');
  });
});

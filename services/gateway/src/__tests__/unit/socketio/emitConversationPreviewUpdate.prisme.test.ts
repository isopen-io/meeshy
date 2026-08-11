import { emitConversationPreviewUpdate } from '../../../socketio/emitConversationPreviewUpdate';

type Emitted = { room: string; event: string; payload: Record<string, unknown> };

function ioSpy() {
  const emitted: Emitted[] = [];
  const io = {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          emitted.push({ room, event, payload: payload as Record<string, unknown> });
        },
      };
    },
  };
  return { io, emitted };
}

function prismaWith(params: {
  participants: Array<{ id: string; userId: string | null; language?: string }>;
  latest: Record<string, unknown> | null;
  users?: Array<Record<string, unknown>>;
}) {
  return {
    participant: { findMany: jest.fn().mockResolvedValue(params.participants) },
    message: { findFirst: jest.fn().mockResolvedValue(params.latest) },
    user: { findMany: jest.fn().mockResolvedValue(params.users ?? []) },
  } as never;
}

const FR_READER = {
  id: 'u-fr',
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
};

describe('emitConversationPreviewUpdate — le Prisme voyage avec l\'aperçu', () => {
  it('porte la carte de traductions du prisme du destinataire', async () => {
    const { io, emitted } = ioSpy();
    const prisma = prismaWith({
      participants: [{ id: 'p1', userId: 'u-fr' }],
      latest: {
        id: 'm1',
        content: 'Hello everyone',
        senderId: 'p2',
        createdAt: new Date('2026-08-11T10:00:00Z'),
        metadata: null,
        translations: { fr: { text: 'Bonjour tout le monde' } },
        originalLanguage: 'en',
      },
      users: [FR_READER],
    });

    await emitConversationPreviewUpdate(prisma, io, 'c1', 'u-fr');

    expect(emitted).toHaveLength(1);
    expect(emitted[0].payload.lastMessagePreview).toBe('Hello everyone');
    expect(emitted[0].payload.lastMessageTranslations).toEqual({ fr: 'Bonjour tout le monde' });
    expect(emitted[0].payload.lastMessageOriginalLanguage).toBe('en');
  });

  it('porte `lastMessageTranslations: null` quand l\'édition a périmé la colonne — le vide REÇU est ce qui périme la carte du client', async () => {
    const { io, emitted } = ioSpy();
    const prisma = prismaWith({
      participants: [{ id: 'p1', userId: 'u-fr' }],
      latest: {
        id: 'm1',
        content: 'Hello everyone, edited',
        senderId: 'p2',
        createdAt: new Date('2026-08-11T10:00:00Z'),
        metadata: null,
        // Ce que `PUT /messages/:id` écrit dans la MÊME transaction que le
        // nouveau contenu : la carte de traductions ne décrit plus le message.
        translations: null,
        originalLanguage: 'en',
      },
      users: [FR_READER],
    });

    await emitConversationPreviewUpdate(prisma, io, 'c1', 'u-fr');

    expect(emitted[0].payload).toHaveProperty('lastMessageTranslations', null);
    expect(emitted[0].payload.lastMessagePreview).toBe('Hello everyone, edited');
  });

  it('sert à chaque destinataire SA langue et non celle du voisin', async () => {
    const { io, emitted } = ioSpy();
    const prisma = prismaWith({
      participants: [
        { id: 'p1', userId: 'u-fr' },
        { id: 'p2', userId: 'u-es' },
      ],
      latest: {
        id: 'm1',
        content: 'Hello everyone',
        senderId: 'p3',
        createdAt: new Date('2026-08-11T10:00:00Z'),
        metadata: null,
        translations: { fr: { text: 'Bonjour' }, es: { text: 'Hola' } },
        originalLanguage: 'en',
      },
      users: [
        FR_READER,
        { id: 'u-es', systemLanguage: 'es', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
      ],
    });

    await emitConversationPreviewUpdate(prisma, io, 'c1', 'u-fr');

    const byRoom = new Map(emitted.map((e) => [e.room, e.payload]));
    expect(byRoom.get('user:u-fr')?.lastMessageTranslations).toEqual({ fr: 'Bonjour' });
    expect(byRoom.get('user:u-es')?.lastMessageTranslations).toEqual({ es: 'Hola' });
  });

  it('porte le couple même quand la conversation n\'a plus de message', async () => {
    const { io, emitted } = ioSpy();
    const prisma = prismaWith({ participants: [{ id: 'p1', userId: 'u-fr' }], latest: null });

    await emitConversationPreviewUpdate(prisma, io, 'c1', 'u-fr');

    expect(emitted[0].payload).toHaveProperty('lastMessageTranslations', null);
    expect(emitted[0].payload).toHaveProperty('lastMessageOriginalLanguage', null);
  });
});

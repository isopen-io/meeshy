/**
 * `GET /conversations/:id/messages` résout les `@pseudo` de la page dans
 * `meta.mentionedUsers` — agrégé pour la page, pas porté par chaque message
 * (`resolveMentionedUsers`, `routes/conversations/messages-list.ts`). Le lecteur
 * de la réponse est donc le SEUL endroit qui voit cette carte : s'il la jette,
 * la bulle n'a plus aucun moyen de rendre le nom, et le module de résolution
 * reste ce qu'il était dans `dev` — juste, testé, et monté par personne (#7458).
 */
const mockGet = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

const transformCalls: Array<{ msg: unknown; options: unknown }> = [];

jest.mock('@/services/conversations/transformers.service', () => ({
  transformersService: {
    transformMessageData: (msg: unknown, options: unknown) => {
      transformCalls.push({ msg, options });
      return msg;
    },
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

import { messagesService } from '@/services/conversations/messages.service';

const jean = { userId: 'u1', username: 'jdupont42', displayName: 'Jean Dupont', avatar: null };

const responseWith = (meta: Record<string, unknown> | undefined) => ({
  data: {
    success: true,
    data: [{ id: 'm1', content: 'salut @jdupont42' }],
    pagination: { total: 1, offset: 0, limit: 50, hasMore: false },
    ...(meta ? { meta } : {}),
  },
});

describe('MessagesService.getMessages — la résolution de mention de la page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    transformCalls.length = 0;
  });

  it('remet aux messages les personnes résolues par la réponse', async () => {
    mockGet.mockResolvedValue(responseWith({ userLanguage: 'fr', mentionedUsers: [jean] }));

    await messagesService.getMessages('conv-1');

    expect(transformCalls).toHaveLength(1);
    expect(transformCalls[0].options).toEqual({ mentionedUsers: [jean] });
  });

  it('ne fabrique rien quand la réponse ne porte aucune résolution', async () => {
    mockGet.mockResolvedValue(responseWith({ userLanguage: 'fr' }));

    await messagesService.getMessages('conv-2');

    expect(transformCalls[0].options).toEqual({ mentionedUsers: undefined });
  });

  it('ne casse pas sur une réponse sans meta du tout', async () => {
    mockGet.mockResolvedValue(responseWith(undefined));

    const result = await messagesService.getMessages('conv-3');

    expect(result.messages).toHaveLength(1);
    expect(transformCalls[0].options).toEqual({ mentionedUsers: undefined });
  });
});

/**
 * `markAsRead` transporte les identifiants des messages RÉELLEMENT affichés.
 *
 * Sans eux, le gateway retombe sur son chemin historique par fenêtre
 * temporelle, qui marque comme lus des messages jamais montrés — ouvrir une
 * conversation à 200 non-lus les déclarait tous lus.
 *
 * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
 */

const mockPost = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

jest.mock('@/services/conversations/transformers.service', () => ({
  transformersService: { transformMessageData: (msg: unknown) => msg },
}));

jest.mock('@/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

import { messagesService } from '@/services/conversations/messages.service';

const CONVERSATION = 'conv-1';
const A = '507f1f77bcf86cd799439011';
const B = '507f1f77bcf86cd799439012';

describe('markAsRead', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({ data: { success: true } });
  });

  it('sends the reported message ids in the body', async () => {
    await messagesService.markAsRead(CONVERSATION, [A, B]);

    expect(mockPost).toHaveBeenCalledWith(
      `/api/v1/conversations/${CONVERSATION}/mark-as-read`,
      { messageIds: [A, B] }
    );
  });

  it('omits the body entirely when no ids are reported', async () => {
    // Un corps `{messageIds: []}` signifierait « rien n'a été affiché » et
    // ferait travailler le serveur pour rien ; l'absence de corps conserve le
    // repli historique, seul comportement sûr pour un appel non informé.
    await messagesService.markAsRead(CONVERSATION);

    expect(mockPost).toHaveBeenCalledWith(`/api/v1/conversations/${CONVERSATION}/mark-as-read`);
  });

  it('omits the body on an empty id list rather than sending an empty batch', async () => {
    await messagesService.markAsRead(CONVERSATION, []);

    expect(mockPost).toHaveBeenCalledWith(`/api/v1/conversations/${CONVERSATION}/mark-as-read`);
  });

  it('drops optimistic client ids, which the server would reject as malformed', async () => {
    // Les messages en cours d'envoi portent un `cid_<uuid>` et non un ObjectId :
    // en laisser passer un ferait rejeter TOUT le lot en 400, donc perdre les
    // lectures réelles qui l'accompagnaient.
    await messagesService.markAsRead(CONVERSATION, [A, 'cid_7f3a1b2c-0000-4000-8000-000000000000', B]);

    expect(mockPost).toHaveBeenCalledWith(
      `/api/v1/conversations/${CONVERSATION}/mark-as-read`,
      { messageIds: [A, B] }
    );
  });

  it('omits the body when every reported id was optimistic', async () => {
    await messagesService.markAsRead(CONVERSATION, ['cid_7f3a1b2c-0000-4000-8000-000000000000']);

    expect(mockPost).toHaveBeenCalledWith(`/api/v1/conversations/${CONVERSATION}/mark-as-read`);
  });

  it('caps the batch at the server limit of 200 ids', async () => {
    const many = Array.from({ length: 250 }, (_, i) =>
      i.toString(16).padStart(24, '0')
    );

    await messagesService.markAsRead(CONVERSATION, many);

    const sent = mockPost.mock.calls[0][1] as { messageIds: string[] };
    expect(sent.messageIds).toHaveLength(200);
    // On garde les PLUS RÉCENTS : ce sont ceux que l'utilisateur vient de voir.
    expect(sent.messageIds[199]).toBe(many[249]);
  });
});

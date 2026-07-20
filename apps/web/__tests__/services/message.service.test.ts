jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000${path}`,
}));

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(),
  },
}));

import { messageService } from '@/services/message.service';
import { authManager } from '@/services/auth-manager.service';

const mockAuthManager = authManager as jest.Mocked<typeof authManager>;
const TOKEN = 'jwt-token-abc';

function makeResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn() as jest.Mock;
});

afterEach(() => {
  delete (global as Record<string, unknown>).fetch;
});

// ─── editMessage ──────────────────────────────────────────────────────────────

describe('messageService.editMessage', () => {
  it('throws when auth token is missing', async () => {
    mockAuthManager.getAuthToken.mockReturnValue(null);

    await expect(
      messageService.editMessage('conv-1', 'msg-1', { content: 'new text' })
    ).rejects.toThrow("Token d'authentification manquant");
  });

  it('PUTs to the correct endpoint with auth header and body', async () => {
    mockAuthManager.getAuthToken.mockReturnValue(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue(
      makeResponse({ success: true, data: { id: 'msg-1', content: 'new text' } })
    );

    await messageService.editMessage('conv-1', 'msg-1', { content: 'new text', originalLanguage: 'fr' });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/conversations/conv-1/messages/msg-1',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
        body: JSON.stringify({ content: 'new text', originalLanguage: 'fr' }),
      })
    );
  });

  it('returns response data on success', async () => {
    mockAuthManager.getAuthToken.mockReturnValue(TOKEN);
    const data = { success: true, data: { id: 'msg-1', content: 'updated' } };
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse(data));

    const result = await messageService.editMessage('conv-1', 'msg-1', { content: 'updated' });

    expect(result).toEqual(data);
  });

  it('throws with error message when response is not ok', async () => {
    mockAuthManager.getAuthToken.mockReturnValue(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue(
      makeResponse({ error: 'Message not found' }, false, 404)
    );

    await expect(
      messageService.editMessage('conv-1', 'msg-1', { content: 'new' })
    ).rejects.toThrow('Message not found');
  });

  it('throws fallback message when error field is absent in 4xx body', async () => {
    mockAuthManager.getAuthToken.mockReturnValue(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({}, false, 500));

    await expect(
      messageService.editMessage('conv-1', 'msg-1', { content: 'new' })
    ).rejects.toThrow('Erreur lors de la modification du message');
  });

  it('throws on network failure', async () => {
    mockAuthManager.getAuthToken.mockReturnValue(TOKEN);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network error'));

    await expect(
      messageService.editMessage('conv-1', 'msg-1', { content: 'new' })
    ).rejects.toThrow('network error');
  });
});

// ─── deleteMessage ────────────────────────────────────────────────────────────

describe('messageService.deleteMessage', () => {
  it('throws when auth token is missing', async () => {
    mockAuthManager.getAuthToken.mockReturnValue(null);

    await expect(
      messageService.deleteMessage('conv-1', 'msg-1')
    ).rejects.toThrow("Token d'authentification manquant");
  });

  it('DELETEs the correct endpoint with auth header', async () => {
    mockAuthManager.getAuthToken.mockReturnValue(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: true }));

    await messageService.deleteMessage('conv-1', 'msg-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/conversations/conv-1/messages/msg-1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      })
    );
  });

  it('throws with error message when response is not ok', async () => {
    mockAuthManager.getAuthToken.mockReturnValue(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue(
      makeResponse({ error: 'Unauthorized' }, false, 403)
    );

    await expect(messageService.deleteMessage('conv-1', 'msg-1')).rejects.toThrow('Unauthorized');
  });

  it('throws fallback message when error field is absent', async () => {
    mockAuthManager.getAuthToken.mockReturnValue(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({}, false, 500));

    await expect(messageService.deleteMessage('conv-1', 'msg-1')).rejects.toThrow(
      'Erreur lors de la suppression du message'
    );
  });

  it('throws on network failure', async () => {
    mockAuthManager.getAuthToken.mockReturnValue(TOKEN);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('timeout'));

    await expect(messageService.deleteMessage('conv-1', 'msg-1')).rejects.toThrow('timeout');
  });
});

// Mock dependencies BEFORE imports (factories run immediately on module load)
jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000${path}`,
}));

jest.mock('@/utils/client-message-id', () => ({
  generateClientMessageId: () => 'client-msg-123',
}));

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAnonymousSession: jest.fn(),
    clearAnonymousSessions: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authManager } = require('@/services/auth-manager.service') as { authManager: { getAnonymousSession: jest.Mock; clearAnonymousSessions: jest.Mock } };
const mockGetAnonymousSession = authManager.getAnonymousSession;
const mockClearAnonymousSessions = authManager.clearAnonymousSessions;

import { AnonymousChatService } from '@/services/anonymous-chat.service';

const TOKEN = 'sess-token-abc';
const LINK_ID = 'link-123';

function makeResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

function makeService(token: string | null = TOKEN): AnonymousChatService {
  mockGetAnonymousSession.mockReturnValue(token ? { token } : null);
  const svc = new AnonymousChatService();
  svc.initialize(LINK_ID);
  return svc;
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn<any>();
});

afterEach(() => {
  delete (global as any).fetch;
});

// ─── constructor + initialize ─────────────────────────────────────────────────

describe('AnonymousChatService constructor + initialize', () => {
  it('reads session token from authManager on construction', () => {
    mockGetAnonymousSession.mockReturnValue({ token: TOKEN });
    const svc = new AnonymousChatService();
    expect(svc.getSessionToken()).toBe(TOKEN);
  });

  it('sets sessionToken to null when no anonymous session exists', () => {
    mockGetAnonymousSession.mockReturnValue(null);
    const svc = new AnonymousChatService();
    expect(svc.getSessionToken()).toBeNull();
  });

  it('initialize sets linkId and refreshes sessionToken', () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'new-token' });
    const svc = new AnonymousChatService();
    svc.initialize('link-xyz');
    expect(svc.getSessionToken()).toBe('new-token');
  });
});

// ─── hasActiveSession + getSessionToken ──────────────────────────────────────

describe('AnonymousChatService.hasActiveSession', () => {
  it('returns true when sessionToken is set', () => {
    const svc = makeService(TOKEN);
    expect(svc.hasActiveSession()).toBe(true);
  });

  it('returns false when sessionToken is null', () => {
    const svc = makeService(null);
    expect(svc.hasActiveSession()).toBe(false);
  });
});

describe('AnonymousChatService.getSessionToken', () => {
  it('returns the current session token', () => {
    const svc = makeService(TOKEN);
    expect(svc.getSessionToken()).toBe(TOKEN);
  });

  it('returns null when no session', () => {
    const svc = makeService(null);
    expect(svc.getSessionToken()).toBeNull();
  });
});

// ─── refreshSession ───────────────────────────────────────────────────────────

describe('AnonymousChatService.refreshSession', () => {
  it('throws when sessionToken is null', async () => {
    const svc = makeService(null);
    await expect(svc.refreshSession()).rejects.toThrow('Aucune session anonyme trouvée');
  });

  it('POSTs to /anonymous/refresh with sessionToken', async () => {
    const svc = makeService(TOKEN);
    const data = { participant: { id: 'p1' }, conversation: { id: 'c1', title: 'T', type: 'GROUP', allowViewHistory: false }, linkId: LINK_ID };
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: true, data }));

    await svc.refreshSession();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/anonymous/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sessionToken: TOKEN }),
      })
    );
  });

  it('returns data on success', async () => {
    const svc = makeService(TOKEN);
    const data = { participant: { id: 'p1' }, conversation: { id: 'c1', title: 'T', type: 'GROUP', allowViewHistory: false }, linkId: LINK_ID };
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: true, data }));

    const result = await svc.refreshSession();

    expect(result).toEqual(data);
  });

  it('throws "Session invalide" when response is not ok', async () => {
    const svc = makeService(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({}, false, 401));

    await expect(svc.refreshSession()).rejects.toThrow('Session invalide');
  });

  it('throws with server message when success=false', async () => {
    const svc = makeService(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: false, message: 'Session expirée' }));

    await expect(svc.refreshSession()).rejects.toThrow('Session expirée');
  });

  it('throws on network error', async () => {
    const svc = makeService(TOKEN);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network failure'));

    await expect(svc.refreshSession()).rejects.toThrow('network failure');
  });
});

// ─── loadMessages ─────────────────────────────────────────────────────────────

describe('AnonymousChatService.loadMessages', () => {
  it('throws when not initialized (no session or linkId)', async () => {
    const svc = makeService(null);
    await expect(svc.loadMessages()).rejects.toThrow('Session non initialisée');
  });

  it('calls correct URL with default limit and offset', async () => {
    const svc = makeService(TOKEN);
    const payload = { messages: [], hasMore: false, total: 0 };
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: true, data: payload }));

    await svc.loadMessages();

    expect(global.fetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/links/${LINK_ID}/messages?limit=50&offset=0`,
      expect.objectContaining({ method: 'GET', headers: { 'X-Session-Token': TOKEN } })
    );
  });

  it('calls URL with custom limit and offset', async () => {
    const svc = makeService(TOKEN);
    const payload = { messages: [], hasMore: false, total: 0 };
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: true, data: payload }));

    await svc.loadMessages(10, 20);

    expect(global.fetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/links/${LINK_ID}/messages?limit=10&offset=20`,
      expect.anything()
    );
  });

  it('returns messages payload on success', async () => {
    const svc = makeService(TOKEN);
    const payload = { messages: [{ id: 'm1', content: 'hi' }], hasMore: true, total: 1 };
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: true, data: payload }));

    const result = await svc.loadMessages();

    expect(result).toEqual(payload);
  });

  it('throws when response is not ok', async () => {
    const svc = makeService(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({}, false, 500));

    await expect(svc.loadMessages()).rejects.toThrow('Erreur lors du chargement des messages');
  });

  it('throws when success=false', async () => {
    const svc = makeService(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: false, message: 'Forbidden' }));

    await expect(svc.loadMessages()).rejects.toThrow('Forbidden');
  });
});

// ─── sendMessage ─────────────────────────────────────────────────────────────

describe('AnonymousChatService.sendMessage', () => {
  it('throws when not initialized', async () => {
    const svc = makeService(null);
    await expect(svc.sendMessage('hello')).rejects.toThrow('Session non initialisée');
  });

  it('POSTs to correct endpoint with content and clientMessageId', async () => {
    const svc = makeService(TOKEN);
    const message = { id: 'm1', content: 'hello' };
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: true, data: message }));

    await svc.sendMessage('hello');

    expect(global.fetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/links/${LINK_ID}/messages`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Session-Token': TOKEN }),
        body: expect.stringContaining('"content":"hello"'),
      })
    );
  });

  it('includes replyToId when provided', async () => {
    const svc = makeService(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: true, data: { id: 'm1' } }));

    await svc.sendMessage('reply', 'fr', 'msg-parent-id');

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.replyToId).toBe('msg-parent-id');
  });

  it('omits replyToId when not provided', async () => {
    const svc = makeService(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: true, data: { id: 'm1' } }));

    await svc.sendMessage('hello', 'fr');

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).not.toHaveProperty('replyToId');
  });

  it('returns the message on success', async () => {
    const svc = makeService(TOKEN);
    const message = { id: 'm1', content: 'hello' };
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: true, data: message }));

    const result = await svc.sendMessage('hello');

    expect(result).toEqual(message);
  });

  it('throws with errorData.message when response is not ok', async () => {
    const svc = makeService(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({ message: 'Bad request' }),
    });

    await expect(svc.sendMessage('hello')).rejects.toThrow('Bad request');
  });
});

// ─── leaveSession ─────────────────────────────────────────────────────────────

describe('AnonymousChatService.leaveSession', () => {
  it('is a no-op when sessionToken is null', async () => {
    const svc = makeService(null);
    await svc.leaveSession();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('POSTs to /anonymous/leave with sessionToken', async () => {
    const svc = makeService(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: jest.fn() });

    await svc.leaveSession();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/anonymous/leave',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sessionToken: TOKEN }),
      })
    );
  });

  it('clears sessionToken and linkId after leaving', async () => {
    const svc = makeService(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: jest.fn() });

    await svc.leaveSession();

    expect(svc.getSessionToken()).toBeNull();
    expect(svc.hasActiveSession()).toBe(false);
  });

  it('calls authManager.clearAnonymousSessions', async () => {
    const svc = makeService(TOKEN);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: jest.fn() });

    await svc.leaveSession();

    expect(mockClearAnonymousSessions).toHaveBeenCalled();
  });

  it('still cleans up when fetch throws (swallows error)', async () => {
    const svc = makeService(TOKEN);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

    await svc.leaveSession();

    expect(svc.getSessionToken()).toBeNull();
    expect(svc.hasActiveSession()).toBe(false);
  });
});

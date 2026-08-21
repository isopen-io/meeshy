/**
 * O17 (rév. 3) — négociation de forme à la LECTURE : le client annonce ce
 * qu'il sait lire. Sans `X-Canvas-Caps: 3`, le gateway traite le web comme un
 * client sans capacités et sert, pour tout blob v3-natif, la SENTINELLE v1
 * localisée (« Mets à jour Meeshy pour voir ce contenu ») plutôt que la scène
 * réelle — jamais un canvas vide, mais jamais le contenu non plus. Poser
 * l'en-tête est ce qui fait passer le web du côté « restitué » de la table de
 * décision O17.
 *
 * L'en-tête est posé au même funnel que `Authorization`/`X-Device-Locale` —
 * `ApiService.buildHeaders` — donc porté par toute requête qui passe par
 * `request()` (get/post/put/patch/delete, et `uploadFile` qui délègue à
 * `request()`).
 *
 * @jest-environment jsdom
 */

let mockGetAuthToken = jest.fn();
let mockDecodeJWT = jest.fn();
let mockClearAllSessions = jest.fn();
let mockRefreshToken = jest.fn();

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: (...args: any[]) => mockGetAuthToken(...args),
    decodeJWT: (...args: any[]) => mockDecodeJWT(...args),
    clearAllSessions: (...args: any[]) => mockClearAllSessions(...args),
  },
}));

jest.mock('@/services/auth.service', () => ({
  authService: {
    refreshToken: (...args: any[]) => mockRefreshToken(...args),
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((path: string) => `https://gate.meeshy.me${path}`),
}));

jest.mock('@/utils/auth', () => ({
  isJWTExpired: jest.fn().mockReturnValue(false),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { ApiService } from '@/services/api.service';

describe('X-Canvas-Caps header (O17, rév. 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockGetAuthToken.mockReturnValue('test-jwt-token');
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('announces v3 capability - without it the gateway serves the update sentinel', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
    });

    const service = new ApiService();
    await service.get('/posts/feed');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://gate.meeshy.me/posts/feed',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Canvas-Caps': '3' }),
      })
    );
  });

  it('carries the header on every HTTP verb, not just GET', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
    });

    const service = new ApiService();
    await service.post('/posts', { content: 'hello' });
    await service.patch('/posts/1', { content: 'edited' });
    await service.delete('/posts/1');

    for (const call of mockFetch.mock.calls) {
      const headers = call[1].headers as Record<string, string>;
      expect(headers['X-Canvas-Caps']).toBe('3');
    }
  });

  it('carries the header on uploadFile calls', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ fileId: 'f-1' }),
    });

    const service = new ApiService();
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    await service.uploadFile('/files/upload', file);

    const sentHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(sentHeaders['X-Canvas-Caps']).toBe('3');
  });

  it('never blocks a request for lacking the header itself - the header only announces, R6 forbids a version gate on web', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
    });

    const service = new ApiService();
    const result = await service.get('/posts/feed');

    expect(result.success).toBe(true);
  });
});

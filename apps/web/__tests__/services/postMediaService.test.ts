/**
 * PostMediaService — l'unique appelant web de `DELETE /posts/media/:mediaId`.
 *
 * Miroir exact de `AttachmentService.deleteAttachment` (même route de
 * secours, même contrat) : le transport post appelle CELUI-CI plutôt que
 * `AttachmentService.deleteAttachment`, qui ne connaît que
 * `MessageAttachment` et rendrait 404 sur un id de `PostMedia`.
 */

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((path: string) => `https://api.test${path}`),
}));

jest.mock('@/utils/token-utils', () => ({
  createAuthHeaders: jest.fn(() => ({ Authorization: 'Bearer test-token' })),
}));

import { PostMediaService } from '@/services/postMediaService';

const makeMockFetch = (ok: boolean, body: unknown = {}) =>
  jest.fn().mockResolvedValue({ ok, json: jest.fn().mockResolvedValue(body) });

describe('PostMediaService.deletePendingMedia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves without value when the response is ok', async () => {
    global.fetch = makeMockFetch(true);
    await expect(PostMediaService.deletePendingMedia('media-1')).resolves.toBeUndefined();
  });

  it('throws when the response is not ok', async () => {
    global.fetch = makeMockFetch(false);
    await expect(PostMediaService.deletePendingMedia('media-1')).rejects.toThrow('Failed to delete media');
  });

  it('sends a DELETE request to /posts/media/:mediaId', async () => {
    global.fetch = makeMockFetch(true);
    await PostMediaService.deletePendingMedia('media-42', 'tok');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/api/v1/posts/media/media-42',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('includes the mediaId in the DELETE URL', async () => {
    global.fetch = makeMockFetch(true);
    await PostMediaService.deletePendingMedia('my-media-id');

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('my-media-id');
  });
});

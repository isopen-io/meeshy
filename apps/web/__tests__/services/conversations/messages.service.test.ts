/**
 * Tests for MessagesService request de-duplication
 *
 * The service aborts a pending request when a new one is issued for the same
 * key. Scoping that key to the conversation alone made the two legitimate
 * concurrent reads of an open conversation — the paginated list read
 * (offset/before) and the forward catch-up read (after) — cancel each other,
 * which silently dropped whichever one lost the race.
 */

const mockGet = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

jest.mock('@/services/conversations/transformers.service', () => ({
  transformersService: {
    transformMessageData: (msg: unknown) => msg,
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

import { messagesService } from '@/services/conversations/messages.service';

function deferredResponse() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const emptyPayload = {
  data: { success: true, data: [], pagination: { total: 0, offset: 0, limit: 50, hasMore: false } },
};

describe('MessagesService.getMessages — concurrent reads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not abort the paginated read when a forward catch-up read starts', async () => {
    const paginated = deferredResponse();
    const catchUp = deferredResponse();

    mockGet
      .mockImplementationOnce((_url: string, _params: unknown, opts: { signal: AbortSignal }) => {
        opts.signal.addEventListener('abort', () => paginated.resolve(Promise.reject(
          Object.assign(new Error('aborted'), { name: 'AbortError' })
        )));
        return paginated.promise;
      })
      .mockImplementationOnce(() => catchUp.promise);

    const paginatedRead = messagesService.getMessages('conv-1', 1, 20);
    const catchUpRead = messagesService.getMessages('conv-1', 1, 50, null, undefined, '2024-01-01T00:00:00.000Z');

    paginated.resolve(emptyPayload);
    catchUp.resolve(emptyPayload);

    await expect(paginatedRead).resolves.toEqual(expect.objectContaining({ messages: [] }));
    await expect(catchUpRead).resolves.toEqual(expect.objectContaining({ messages: [] }));
  });

  it('still aborts the previous read of the same kind for the same conversation', async () => {
    const first = deferredResponse();
    let firstAborted = false;

    mockGet
      .mockImplementationOnce((_url: string, _params: unknown, opts: { signal: AbortSignal }) => {
        opts.signal.addEventListener('abort', () => {
          firstAborted = true;
          first.resolve(Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        });
        return first.promise;
      })
      .mockImplementationOnce(() => Promise.resolve(emptyPayload));

    const firstRead = messagesService.getMessages('conv-1', 1, 20).catch((e: Error) => e);
    await messagesService.getMessages('conv-1', 2, 20);

    expect(firstAborted).toBe(true);
    await expect(firstRead).resolves.toBeInstanceOf(Error);
  });
});

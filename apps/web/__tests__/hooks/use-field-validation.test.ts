import { renderHook, act } from '@testing-library/react';
import { useFieldValidation } from '@/hooks/use-field-validation';

jest.mock('@/lib/config', () => ({
  buildApiUrl: (endpoint: string) => `http://test.local${endpoint}`,
}));

const mockT = ((key: string) => key) as unknown as Parameters<typeof useFieldValidation>[0]['t'];

const usernameResponse = (available: boolean) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data: { usernameAvailable: available } }),
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('useFieldValidation — annulation des vérifications de disponibilité obsolètes', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('annule la requête en vol quand la valeur change avant la réponse', async () => {
    jest.useFakeTimers();
    const signals: AbortSignal[] = [];
    global.fetch = jest.fn((_url: string, opts: { signal: AbortSignal }) => {
      signals.push(opts.signal);
      return new Promise(() => {}); // ne se résout jamais
    }) as unknown as typeof fetch;

    const { rerender } = renderHook(
      ({ v }) => useFieldValidation({ value: v, t: mockT, type: 'username' }),
      { initialProps: { v: 'ab' } }
    );

    await act(async () => { await flush(); jest.advanceTimersByTime(2000); await flush(); });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(signals[0].aborted).toBe(false);

    rerender({ v: 'abc' });
    await act(async () => { await flush(); jest.advanceTimersByTime(2000); await flush(); });

    expect(signals[0].aborted).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(signals[1].aborted).toBe(false);
  });

  it("ignore une réponse obsolète : elle n'écrase pas la validation courante", async () => {
    jest.useFakeTimers();
    const resolvers: Array<(r: unknown) => void> = [];
    global.fetch = jest.fn(
      (_url: string, _opts: { signal: AbortSignal }) =>
        new Promise((resolve) => { resolvers.push(resolve); })
    ) as unknown as typeof fetch;

    const { result, rerender } = renderHook(
      ({ v }) => useFieldValidation({ value: v, t: mockT, type: 'username' }),
      { initialProps: { v: 'ab' } }
    );

    await act(async () => { await flush(); jest.advanceTimersByTime(2000); await flush(); });
    rerender({ v: 'abc' });
    await act(async () => { await flush(); jest.advanceTimersByTime(2000); await flush(); });
    expect(resolvers).toHaveLength(2);

    // La réponse récente (#2, 'abc') arrive d'abord : disponible.
    await act(async () => { resolvers[1](usernameResponse(true)); await flush(); });
    expect(result.current.status).toBe('available');

    // La réponse obsolète (#1, 'ab') arrive ensuite : taken. Elle NE DOIT PAS
    // écraser l'état courant car sa requête a été annulée.
    await act(async () => { resolvers[0](usernameResponse(false)); await flush(); });
    expect(result.current.status).toBe('available');
  });

  it('annule la requête de disponibilité au démontage', async () => {
    jest.useFakeTimers();
    let captured: AbortSignal | undefined;
    global.fetch = jest.fn((_url: string, opts: { signal: AbortSignal }) => {
      captured = opts.signal;
      return new Promise(() => {});
    }) as unknown as typeof fetch;

    const { unmount } = renderHook(
      () => useFieldValidation({ value: 'ab', t: mockT, type: 'username' })
    );

    await act(async () => { await flush(); jest.advanceTimersByTime(2000); await flush(); });
    expect(captured?.aborted).toBe(false);

    unmount();
    expect(captured?.aborted).toBe(true);
  });
});

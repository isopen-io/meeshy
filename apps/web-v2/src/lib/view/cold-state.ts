export type ColdState = 'ready' | 'error' | 'offline' | 'loading';

export function coldStateOf(query: { readonly data: unknown; readonly isError: boolean; readonly isPaused: boolean }): ColdState {
  if (query.data !== undefined) return 'ready';
  return query.isError ? 'error' : 'loading';
}

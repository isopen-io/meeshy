import type { ListPaginationState } from '@/lib/lens/pagination';

export type ThreadLoadSignal = 'seeking' | 'newer';

export const THREAD_LOAD_SIGNAL_DELAY_MS = 200;

export function threadLoadSignalOf(_input: {
  readonly windowLoading: boolean;
  readonly newerState: ListPaginationState;
}): ThreadLoadSignal | null {
  return null;
}

export function useDelayedSignal<T extends string>(_signal: T | null, _delayMs: number): T | null {
  return null;
}

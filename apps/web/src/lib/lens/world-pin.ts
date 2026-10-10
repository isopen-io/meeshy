export const WORLD_IDENTIFIER = '';

export const pinWorldWide = <T extends { readonly identifier?: string | null }>(
  conversations: readonly T[],
): { readonly world: T | undefined; readonly rest: readonly T[] } => ({ world: undefined, rest: conversations });

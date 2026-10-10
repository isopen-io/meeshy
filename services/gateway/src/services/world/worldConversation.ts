import type { WorldEntry } from '@meeshy/shared/types/world';

export type WorldSeedReport = {
  readonly conversation: 'created' | 'existing';
  readonly shareLink: 'created' | 'existing' | 'identifier-taken' | 'skipped-no-creator';
  readonly members: readonly { readonly username: string; readonly outcome: string }[];
};

export async function ensureWorldConversation(_deps: unknown): Promise<WorldSeedReport> {
  throw new Error('ensureWorldConversation: not implemented (#10000)');
}

export async function loadWorldEntry(_prisma: unknown): Promise<WorldEntry | null> {
  throw new Error('loadWorldEntry: not implemented (#10000)');
}

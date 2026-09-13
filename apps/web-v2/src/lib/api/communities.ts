import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DES COMMUNAUTÉS** (#6364) — squelette réservé ; la logique arrive
 * dans le lot qui le remplit.
 */

export type CommunitiesDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export type CommunitySummary = {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly description: string | null;
  readonly avatar: string | null;
  readonly banner: string | null;
  readonly isPrivate: boolean;
  readonly createdBy: string | null;
  readonly memberCount: number;
  readonly conversationCount: number;
};

export type CommunityConversation = {
  readonly id: string;
  readonly identifier: string | null;
  readonly title: string | null;
  readonly type: string | null;
  readonly avatar: string | null;
  readonly memberCount: number;
  readonly lastMessageAt: string | null;
};

export type CommunityPage = { readonly communities: readonly CommunitySummary[]; readonly nextOffset: number | null };
export type CommunityConversationPage = { readonly conversations: readonly CommunityConversation[]; readonly nextOffset: number | null };

export type CommunityDraft = { readonly name: string; readonly identifier: string; readonly description: string; readonly isPrivate: boolean };
export type CreateCommunityBody = { readonly name: string; readonly identifier?: string; readonly description?: string; readonly isPrivate: boolean };
export type DraftValidation = { readonly ok: true; readonly body: CreateCommunityBody } | { readonly ok: false; readonly field: keyof CommunityDraft };

const pending = (): ApiResult<never> => ({ ok: false, status: 0, error: 'non implémenté' });

export function decodeCommunity(_raw: unknown): CommunitySummary | null {
  return null;
}

export function decodeCommunityConversation(_raw: unknown): CommunityConversation | null {
  return null;
}

export function validateCommunityDraft(_draft: CommunityDraft): DraftValidation {
  return { ok: false, field: 'name' };
}

export async function loadCommunities(_params: CommunitiesDeps & { readonly search: string; readonly offset: number }): Promise<ApiResult<CommunityPage>> {
  return pending();
}

export async function loadCommunity(_params: CommunitiesDeps & { readonly communityId: string }): Promise<ApiResult<CommunitySummary>> {
  return pending();
}

export async function loadCommunityConversations(
  _params: CommunitiesDeps & { readonly communityId: string; readonly offset: number },
): Promise<ApiResult<CommunityConversationPage>> {
  return pending();
}

export async function createCommunity(_deps: CommunitiesDeps, _draft: CommunityDraft): Promise<ApiResult<CommunitySummary>> {
  return pending();
}

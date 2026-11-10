/**
 * #17118 — écrire à un ami WhatsApp depuis le web (squelette, témoins rouges).
 */
import type { ApiResult } from '@/lib/api/http';

export type ExternalOpening = {
  readonly conversationId: string;
  readonly type: 'external';
  readonly encryptionMode: 'e2ee';
  readonly network: 'whatsapp';
  readonly created: boolean;
};

export type ExternalOpeningRefusal = 'disabled' | 'reserved' | 'limit' | 'invalid' | 'rate-limited' | 'offline' | 'failed';

export type ExternalOpeningOutcome =
  | { readonly kind: 'open'; readonly conversationId: string; readonly created: boolean }
  | { readonly kind: 'phone-unverified' }
  | { readonly kind: 'refused'; readonly reason: ExternalOpeningRefusal };

export function externalConversationsReachable(_base: string): boolean {
  throw new Error('non implémenté');
}

export function externalConversationEntryVisible(_params: { readonly base: string; readonly platformRole: string | null }): boolean {
  throw new Error('non implémenté');
}

export function normalizeExternalHandle(_raw: string): string | null {
  throw new Error('non implémenté');
}

export function externalOpeningOutcomeOf(_params: { readonly result: ApiResult<ExternalOpening>; readonly online: boolean }): ExternalOpeningOutcome {
  throw new Error('non implémenté');
}

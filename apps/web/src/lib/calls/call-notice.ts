import type { Message } from '@/lib/api/types';
import { metadataOf } from '@/lib/view/message-metadata';

import type { CallMedia } from './call-store';

/**
 * **LE GESTE D'UNE BULLE D'APPEL** (#6382) — `BubbleCallNoticeView.swift` :
 * un résumé d'appel TERMINÉ se rappelle, du même type ; un appel ENCORE EN
 * COURS (`kind === 'call-live'`) se rejoint. La bulle ne connaît que sa
 * conversation ; le nom et l'avatar de l'appel viennent de l'en-tête du fil,
 * qui les déclare en montant (`rememberCallIdentity`).
 */
export type CallNoticeTarget = {
  readonly conversationId: string;
  readonly callId: string | null;
  readonly media: CallMedia;
  readonly live: boolean;
};

export function callNoticeTarget(message: Pick<Message, 'conversationId' | 'metadata'>): CallNoticeTarget | null {
  const metadata = metadataOf(message);
  if (metadata === null || (metadata.kind !== 'call' && metadata.kind !== 'call-live')) return null;
  const callId = typeof metadata.callId === 'string' && metadata.callId !== '' ? metadata.callId : null;
  return {
    conversationId: message.conversationId,
    callId,
    media: metadata.callType === 'video' ? 'video' : 'audio',
    live: metadata.kind === 'call-live',
  };
}

export type CallIdentity = { readonly title: string; readonly avatar: string | null; readonly isGroup: boolean };

const identities = new Map<string, CallIdentity>();

export function rememberCallIdentity(conversationId: string, identity: CallIdentity): void {
  identities.set(conversationId, identity);
}

export function callIdentityOf(conversationId: string): CallIdentity {
  return identities.get(conversationId) ?? { title: '', avatar: null, isGroup: false };
}

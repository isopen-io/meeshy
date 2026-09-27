import type { Attachment, Message } from '@/lib/api/types';
import { kindOf } from '@/lib/view/message';
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
  /** Un appel TERMINÉ, identifié et qui a duré : sa transcription gravée peut se relire (#8048). */
  readonly transcript: boolean;
  /** L'enregistrement consenti par tous et rattaché à la bulle d'un appel TERMINÉ (#8064) : il se réécoute ici. */
  readonly recording: CallNoticeRecording | null;
};

export type CallNoticeRecording = { readonly attachment: Attachment; readonly language: string };

type CallNoticeSource = Pick<Message, 'conversationId' | 'metadata'> & Partial<Pick<Message, 'attachments' | 'originalLanguage'>>;

const recordingOf = (message: CallNoticeSource): CallNoticeRecording | null => {
  const attachment = (message.attachments ?? []).find((candidate) => kindOf(candidate) === 'audio');
  return attachment === undefined ? null : { attachment, language: message.originalLanguage ?? 'fr' };
};

export function callNoticeTarget(message: CallNoticeSource): CallNoticeTarget | null {
  const metadata = metadataOf(message);
  if (metadata === null || (metadata.kind !== 'call' && metadata.kind !== 'call-live')) return null;
  const callId = typeof metadata.callId === 'string' && metadata.callId !== '' ? metadata.callId : null;
  return {
    conversationId: message.conversationId,
    callId,
    media: metadata.callType === 'video' ? 'video' : 'audio',
    live: metadata.kind === 'call-live',
    transcript: metadata.kind === 'call' && callId !== null && typeof metadata.durationSeconds === 'number' && metadata.durationSeconds > 0,
    recording: metadata.kind === 'call' ? recordingOf(message) : null,
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

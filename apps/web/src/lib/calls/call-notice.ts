import type { Attachment, Message } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
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
  /** Un appel ABOUTI (`completed`), identifié et qui a duré : sa transcription gravée peut se relire (#8048). Interrompu, manqué ou refusé : rien (iOS `BubbleCallJournalOffer`, Android `FocalCallJournalOffer`, #17878 A1.1). */
  readonly transcript: boolean;
  /** L'enregistrement consenti par tous et rattaché à la bulle d'un appel TERMINÉ (#8064) : il se réécoute (ou se revoit, #8437) ici. */
  readonly recording: CallNoticeRecording | null;
  /** Ceux que la passerelle a servis sur le résumé (#17868, A1.2) ; `null`/absent : la carte ne dit aucun nom. */
  readonly participants?: readonly CallParticipant[] | null;
  /** Le lecteur : la ligne se résout chez lui, le message étant le même pour tous. */
  readonly viewerId?: string | undefined;
};

export type CallParticipant = { readonly userId: string; readonly displayName: string };

export type CallNoticeRecording = { readonly attachment: Attachment; readonly language: string };

type CallNoticeSource = Pick<Message, 'conversationId' | 'metadata'> & Partial<Pick<Message, 'attachments' | 'originalLanguage'>>;

const recordingOf = (message: CallNoticeSource): CallNoticeRecording | null => {
  const attachment = (message.attachments ?? []).find((candidate) => kindOf(candidate) === 'audio' || kindOf(candidate) === 'video');
  return attachment === undefined ? null : { attachment, language: message.originalLanguage ?? 'fr' };
};

/** Décodage TOLÉRANT (iOS `try?`, Android) : clé absente ou malformée — un seul élément faux suffit — ⇒ `null`, jamais d'échec de la carte. */
export function decodeCallParticipants(raw: unknown): readonly CallParticipant[] | null {
  if (!Array.isArray(raw)) return null;
  const people: CallParticipant[] = [];
  for (const entry of raw as readonly unknown[]) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { userId, displayName } = entry as Record<string, unknown>;
    if (typeof userId !== 'string' || typeof displayName !== 'string') return null;
    people.push({ userId, displayName });
  }
  return people;
}

/**
 * « Awa, Karim, Lina et vous » (iOS `participantsLine`, Android `FocalCallParticipants`) : les AUTRES, rognés et non
 * vides, dans l'ordre servi, puis « vous » si le lecteur a pris part ; la jointure est celle de la langue
 * (`Intl.ListFormat`). `null` quand aucun autre nom n'est servi : pas de ligne.
 */
export function callParticipantsLine({ participants, viewerId = '', language }: { readonly participants: readonly CallParticipant[] | null | undefined; readonly viewerId?: string | undefined; readonly language: InterfaceLanguage }): string | null {
  const served = participants ?? [];
  const others = served
    .filter((person) => person.userId !== viewerId)
    .map((person) => person.displayName.trim())
    .filter((name) => name !== '');
  if (others.length === 0) return null;
  const viewerTookPart = viewerId !== '' && served.some((person) => person.userId === viewerId);
  const names = viewerTookPart ? [...others, translate(language, 'call.card.participants.you')] : others;
  return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(names);
}

export function callNoticeTarget(message: CallNoticeSource, viewerId = ''): CallNoticeTarget | null {
  const metadata = metadataOf(message);
  if (metadata === null || (metadata.kind !== 'call' && metadata.kind !== 'call-live')) return null;
  const callId = typeof metadata.callId === 'string' && metadata.callId !== '' ? metadata.callId : null;
  return {
    conversationId: message.conversationId,
    callId,
    media: metadata.callType === 'video' ? 'video' : 'audio',
    live: metadata.kind === 'call-live',
    transcript: metadata.kind === 'call' && metadata.outcome === 'completed' && callId !== null && typeof metadata.durationSeconds === 'number' && metadata.durationSeconds > 0,
    recording: metadata.kind === 'call' ? recordingOf(message) : null,
    participants: decodeCallParticipants(metadata.participants),
    viewerId,
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

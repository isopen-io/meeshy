import type { CallEndReason, CallMedia } from './call-store';

/**
 * **CE QUE LE SOCKET REMET, LU SANS JAMAIS LE CROIRE** (#6382) — les charges
 * `call:*` arrivent en `unknown` (`call-transport.ts`) et sont DÉCODÉES ici,
 * champ par champ, contre les contrats de `@meeshy/shared/types/video-call`.
 * Un champ absent ou mal typé rend `null` : le moteur ignore l'événement
 * plutôt que de planter au milieu d'un appel.
 */

type Json = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

export type DecodedPerson = { readonly userId: string; readonly name: string; readonly avatar: string | null };

export function decodeIceServers(value: unknown): readonly RTCIceServer[] | null {
  if (!Array.isArray(value)) return null;
  const servers = value.flatMap((entry): RTCIceServer[] => {
    if (!isRecord(entry)) return [];
    const urls = typeof entry.urls === 'string' ? entry.urls : Array.isArray(entry.urls) ? entry.urls.filter((url): url is string => typeof url === 'string') : null;
    if (urls === null || urls.length === 0) return [];
    const username = str(entry.username);
    const credential = str(entry.credential);
    return [{ urls, ...(username === null ? {} : { username }), ...(credential === null ? {} : { credential }) }];
  });
  return servers;
}

function personOf(value: unknown): DecodedPerson | null {
  if (!isRecord(value)) return null;
  const userId = str(value.userId);
  if (userId === null) return null;
  const name = str(value.displayName) ?? str(value.username) ?? '';
  return { userId, name, avatar: str(value.avatar) };
}

export type DecodedInitiated = {
  readonly callId: string;
  readonly conversationId: string;
  readonly media: CallMedia;
  readonly initiator: DecodedPerson;
  readonly participants: readonly DecodedPerson[];
  readonly isGroup: boolean;
  readonly conversationTitle: string | null;
  readonly iceServers: readonly RTCIceServer[] | null;
};

export function decodeInitiated(payload: unknown): DecodedInitiated | null {
  if (!isRecord(payload)) return null;
  const callId = str(payload.callId);
  const conversationId = str(payload.conversationId);
  const initiator = personOf(payload.initiator);
  if (callId === null || conversationId === null || initiator === null) return null;
  const participants = Array.isArray(payload.participants) ? payload.participants.map(personOf).filter((person): person is DecodedPerson => person !== null) : [];
  return {
    callId,
    conversationId,
    media: payload.type === 'video' ? 'video' : 'audio',
    initiator,
    participants,
    isGroup: payload.conversationType === 'group',
    conversationTitle: str(payload.conversationTitle),
    iceServers: decodeIceServers(payload.iceServers),
  };
}

export type DecodedJoined = { readonly callId: string; readonly person: DecodedPerson; readonly participantId: string | null; readonly audio: boolean; readonly video: boolean; readonly iceServers: readonly RTCIceServer[] | null };

export function decodeParticipantJoined(payload: unknown): DecodedJoined | null {
  if (!isRecord(payload) || !isRecord(payload.participant)) return null;
  const callId = str(payload.callId);
  const person = personOf(payload.participant);
  if (callId === null || person === null) return null;
  return {
    callId,
    person,
    participantId: str(payload.participant.id),
    audio: bool(payload.participant.isAudioEnabled) ?? true,
    video: bool(payload.participant.isVideoEnabled) ?? false,
    iceServers: decodeIceServers(payload.iceServers),
  };
}

export function decodeParticipantLeft(payload: unknown): { readonly callId: string; readonly participantId: string | null; readonly userId: string | null } | null {
  if (!isRecord(payload)) return null;
  const callId = str(payload.callId);
  if (callId === null) return null;
  return { callId, participantId: str(payload.participantId), userId: str(payload.userId) };
}

export type DecodedSignal =
  | { readonly callId: string; readonly kind: 'description'; readonly type: 'offer' | 'answer'; readonly from: string; readonly to: string; readonly sdp: string; readonly epoch: number }
  | { readonly callId: string; readonly kind: 'candidate'; readonly from: string; readonly to: string; readonly candidate: string; readonly sdpMid: string | null; readonly sdpMLineIndex: number | null; readonly epoch: number };

export function decodeSignal(payload: unknown): DecodedSignal | null {
  if (!isRecord(payload) || !isRecord(payload.signal)) return null;
  const callId = str(payload.callId);
  const signal = payload.signal;
  const from = str(signal.from);
  const to = str(signal.to);
  if (callId === null || from === null || to === null) return null;
  const epoch = num(signal.negotiationId) ?? 0;
  if (signal.type === 'ice-candidate') {
    const candidate = typeof signal.candidate === 'string' ? signal.candidate : null;
    if (candidate === null) return null;
    return { callId, kind: 'candidate', from, to, candidate, sdpMid: str(signal.sdpMid), sdpMLineIndex: num(signal.sdpMLineIndex), epoch };
  }
  const sdp = str(signal.sdp);
  if (sdp === null) return null;
  if (signal.type === 'answer') return { callId, kind: 'description', type: 'answer', from, to, sdp, epoch };
  if (signal.type === 'offer' || signal.type === 'ice-restart') return { callId, kind: 'description', type: 'offer', from, to, sdp, epoch };
  return null;
}

export function decodeEnded(payload: unknown): { readonly callId: string; readonly durationSec: number; readonly endedBy: string | null; readonly reason: string } | null {
  if (!isRecord(payload)) return null;
  const callId = str(payload.callId);
  if (callId === null) return null;
  return { callId, durationSec: num(payload.duration) ?? 0, endedBy: str(payload.endedBy), reason: str(payload.reason) ?? 'completed' };
}

export function decodeCallId(payload: unknown): string | null {
  return isRecord(payload) ? str(payload.callId) : null;
}

export function decodeMediaToggled(payload: unknown): { readonly callId: string; readonly userId: string | null; readonly participantId: string | null; readonly mediaType: 'audio' | 'video'; readonly enabled: boolean } | null {
  if (!isRecord(payload)) return null;
  const callId = str(payload.callId);
  const enabled = bool(payload.enabled);
  if (callId === null || enabled === null || (payload.mediaType !== 'audio' && payload.mediaType !== 'video')) return null;
  return { callId, userId: str(payload.userId), participantId: str(payload.participantId), mediaType: payload.mediaType, enabled };
}

export function decodeError(payload: unknown): { readonly callId: string | null; readonly code: string; readonly message: string } | null {
  if (!isRecord(payload)) return null;
  const code = str(payload.code);
  if (code === null) return null;
  return { callId: str(payload.callId), code, message: str(payload.message) ?? code };
}

export function decodeIceRefresh(payload: unknown): { readonly callId: string; readonly iceServers: readonly RTCIceServer[] } | null {
  if (!isRecord(payload)) return null;
  const callId = str(payload.callId);
  const iceServers = decodeIceServers(payload.iceServers);
  return callId === null || iceServers === null ? null : { callId, iceServers };
}

export type DecodedSegment = { readonly callId: string; readonly id: string; readonly speakerId: string; readonly speakerName: string | null; readonly text: string; readonly original: string; readonly isFinal: boolean };

export function decodeTranslatedSegment(payload: unknown): DecodedSegment | null {
  if (!isRecord(payload) || !isRecord(payload.segment)) return null;
  const callId = str(payload.callId);
  const segment = payload.segment;
  const speakerId = str(segment.speakerId);
  const original = str(segment.text);
  if (callId === null || speakerId === null || original === null) return null;
  const startMs = num(segment.startMs) ?? 0;
  return {
    callId,
    id: str(segment.id) ?? `${speakerId}:${startMs}`,
    speakerId,
    speakerName: str(segment.speakerDisplayName),
    text: str(segment.translatedText) ?? original,
    original,
    isFinal: bool(segment.isFinal) ?? true,
  };
}

/** La réponse d'un accusé `{ success, data?, error? }`. */
export function decodeAck(value: unknown): { readonly ok: true; readonly data: Json } | { readonly ok: false; readonly code: string; readonly endReason: string | null } {
  if (!isRecord(value)) return { ok: false, code: 'NO_ACK', endReason: null };
  if (value.success === true) return { ok: true, data: isRecord(value.data) ? value.data : {} };
  const error = isRecord(value.error) ? value.error : {};
  return { ok: false, code: str(error.code) ?? 'UNKNOWN', endReason: str(error.endReason) };
}

/** Les membres déjà présents d'une session rendue par `call:join` (session Prisma brute). */
export function decodeSessionMembers(session: unknown): readonly (DecodedPerson & { readonly participantId: string | null })[] {
  if (!isRecord(session) || !Array.isArray(session.participants)) return [];
  return session.participants.flatMap((row): (DecodedPerson & { readonly participantId: string | null })[] => {
    if (!isRecord(row) || row.leftAt !== null && row.leftAt !== undefined) return [];
    const nested = isRecord(row.participant) ? row.participant : {};
    const user = isRecord(nested.user) ? nested.user : {};
    const userId = str(nested.userId) ?? str(row.userId) ?? str(row.participantId);
    if (userId === null) return [];
    const name = str(nested.displayName) ?? str(user.displayName) ?? str(user.username) ?? '';
    return [{ userId, name, avatar: str(user.avatar) ?? str(nested.avatar), participantId: str(row.id) }];
  });
}

/**
 * `CallEndReasonMapper` d'iOS — la raison du gateway devient la raison
 * AFFICHÉE. `answered_elsewhere` n'est pas un refus : l'appel a été pris sur
 * un autre appareil.
 */
export function mapServerEndReason(raw: string): CallEndReason {
  const reason = raw.toLowerCase();
  if (reason === 'missed' || reason === 'no_answer' || reason === 'unanswered' || reason === 'noanswer') return 'missed';
  if (reason === 'rejected' || reason === 'declined') return 'rejected';
  if (reason === 'busy') return 'busy';
  if (reason === 'failed') return 'failed';
  if (reason === 'connectionlost' || reason === 'heartbeattimeout' || reason === 'connection_lost') return 'connectionLost';
  return 'remote';
}

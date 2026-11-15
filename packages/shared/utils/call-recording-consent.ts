import {
  CALL_RECORDING_CONSENT_TIMEOUT_MS,
  type CallRecordingErrorCode,
} from '../types/call-recording.js';

export { CALL_RECORDING_CONSENT_TIMEOUT_MS };

export type CallRecordingState = {
  readonly requesterId: string;
  readonly requiredUserIds: readonly string[];
  readonly consentedUserIds: readonly string[];
  readonly requestedAt: number;
  readonly startedAt: number | null;
  readonly stoppedAt: number | null;
};

export type CallRecordingPhase = 'pending' | 'expired' | 'active' | 'stopped';

export type ConsentAnswer = {
  readonly userId: string;
  readonly accepted: boolean;
};

export type ConsentOutcome =
  | { readonly kind: 'rejected'; readonly code: CallRecordingErrorCode }
  | { readonly kind: 'refused' }
  | { readonly kind: 'accepted'; readonly allConsented: boolean };

export function recordingPhase(state: CallRecordingState, now: number): CallRecordingPhase {
  if (state.stoppedAt !== null) return 'stopped';
  if (state.startedAt !== null) return 'active';
  if (now - state.requestedAt >= CALL_RECORDING_CONSENT_TIMEOUT_MS) return 'expired';
  return 'pending';
}

export function hasEveryConsent(required: readonly string[], consented: readonly string[]): boolean {
  return required.length > 0 && required.every((userId) => consented.includes(userId));
}

export function evaluateConsent(state: CallRecordingState, answer: ConsentAnswer, now: number): ConsentOutcome {
  const phase = recordingPhase(state, now);
  if (phase === 'expired') return { kind: 'rejected', code: 'RECORDING_EXPIRED' };
  if (phase !== 'pending') return { kind: 'rejected', code: 'RECORDING_NOT_PENDING' };
  if (!state.requiredUserIds.includes(answer.userId)) return { kind: 'rejected', code: 'NOT_A_CONSENTER' };
  if (!answer.accepted) return { kind: 'refused' };
  const consented = state.consentedUserIds.includes(answer.userId)
    ? state.consentedUserIds
    : [...state.consentedUserIds, answer.userId];
  return { kind: 'accepted', allConsented: hasEveryConsent(state.requiredUserIds, consented) };
}

export function evaluateArrival(state: CallRecordingState, userId: string, now: number): 'stop' | 'ignore' {
  if (recordingPhase(state, now) === 'stopped') return 'ignore';
  if (userId === state.requesterId) return 'ignore';
  const consenters = state.startedAt === null ? state.requiredUserIds : state.consentedUserIds;
  return consenters.includes(userId) ? 'ignore' : 'stop';
}

export function mayLinkRecording(
  state: CallRecordingState & { readonly attachmentId: string | null },
  userId: string,
): boolean {
  return state.requesterId === userId && state.startedAt !== null && state.attachmentId === null;
}

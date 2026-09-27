export const CALL_RECORDING_CONSENT_TIMEOUT_MS = 30_000;

export const CALL_RECORDING_STOP_REASONS = [
  'refused',
  'timeout',
  'participant-joined',
  'stopped',
  'requester-left',
  'call-ended',
] as const;

export type CallRecordingStopReason = typeof CALL_RECORDING_STOP_REASONS[number];

export const CALL_RECORDING_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'NOT_A_PARTICIPANT',
  'CALL_NOT_ACTIVE',
  'NO_PEER_TO_CONSENT',
  'RECORDING_ALREADY_PENDING',
  'RECORDING_NOT_FOUND',
  'RECORDING_NOT_PENDING',
  'RECORDING_EXPIRED',
  'NOT_A_CONSENTER',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type CallRecordingErrorCode = typeof CALL_RECORDING_ERROR_CODES[number];

/**
 * Ce qu'on enregistre (#8437) : l'audio seul, ou la vidéo avec son audio. Le
 * type voyage avec la DEMANDE, pour que chacun consente en connaissance.
 */
export const CALL_RECORDING_KINDS = ['audio', 'video'] as const;

export type CallRecordingKind = typeof CALL_RECORDING_KINDS[number];

/** Un enregistrement antérieur au champ (ou une valeur inconnue) se lit « audio ». */
export const callRecordingKindOf = (stored: string | null | undefined): CallRecordingKind =>
  stored === 'video' ? 'video' : 'audio';

export type CallRecordingRequestEvent = {
  readonly callId: string;
  /** Absent chez un client antérieur à #8437 : `audio`. */
  readonly kind?: CallRecordingKind;
};

export type CallRecordingConsentEvent = {
  readonly callId: string;
  readonly recordingId: string;
  readonly accepted: boolean;
};

export type CallRecordingStopEvent = {
  readonly callId: string;
  readonly recordingId: string;
};

export type CallRecordingAck =
  | { readonly success: true; readonly recordingId: string }
  | { readonly success: false; readonly code: CallRecordingErrorCode };

export type CallRecordingRequestedEvent = {
  readonly callId: string;
  readonly recordingId: string;
  readonly requesterId: string;
  readonly requiredUserIds: readonly string[];
  readonly expiresAt: string;
  readonly kind: CallRecordingKind;
};

export type CallRecordingStartedEvent = {
  readonly callId: string;
  readonly recordingId: string;
  readonly recorderId: string;
  readonly startedAt: string;
  readonly kind: CallRecordingKind;
};

export type CallRecordingStoppedEvent = {
  readonly callId: string;
  readonly recordingId: string;
  readonly reason: CallRecordingStopReason;
  readonly byUserId: string | null;
  readonly wasRecording: boolean;
};

export type CallRecordingLinkBody = {
  readonly attachmentId: string;
};

export type CallRecordingLinkResult = {
  readonly recordingId: string;
  readonly kind: CallRecordingKind;
  readonly messageId: string;
  readonly attachmentId: string;
};

import type { CallQualityFeedbackEvent } from '@meeshy/shared/types/video-call';

import type { ActiveCall, CallEndReason, CallMedia } from './call-store';

/**
 * **LA NOTE D'APRÈS-APPEL** (#8072, parité F6) — la règle, pure : QUAND on
 * la demande et CE qui part. Discrète par construction : un appel sur cinq
 * au hasard, mais toujours celui qui a souffert (qualité mauvaise, reprise,
 * connexion perdue) — c'est lui que la mesure a besoin d'entendre. Jamais
 * pour un appel qui n'a pas vraiment eu lieu (refusé, manqué, < 10 s).
 * La note part par `call:quality-feedback` ; la passerelle l'écrit sur la
 * ligne `CallParticipant` de celui qui note.
 */

export const FEEDBACK_SAMPLE_RATE = 0.2;
export const FEEDBACK_MIN_SECONDS = 10;
/** Une note ≥ 4 part d'un toucher ; en dessous, on demande ce qui a gêné. */
export const FEEDBACK_GOOD_RATING = 4;

export type CallFeedbackRating = CallQualityFeedbackEvent['rating'];
export type CallFeedbackIssue = NonNullable<CallQualityFeedbackEvent['issues']>[number];

export type CallFeedbackPrompt = {
  readonly callId: string;
  readonly title: string;
  readonly media: CallMedia;
};

const RATED_END_REASONS: ReadonlySet<CallEndReason> = new Set(['local', 'remote', 'connectionLost']);

export function feedbackPromptFor(params: {
  readonly call: Pick<ActiveCall, 'title' | 'media'> & { readonly callId: string | null };
  readonly reason: CallEndReason;
  readonly durationSec: number | null;
  readonly troubled: boolean;
  readonly random: number;
}): CallFeedbackPrompt | null {
  const { call, reason, durationSec, troubled, random } = params;
  if (call.callId === null || durationSec === null || durationSec < FEEDBACK_MIN_SECONDS) return null;
  if (!RATED_END_REASONS.has(reason)) return null;
  const asked = troubled || reason === 'connectionLost' || random < FEEDBACK_SAMPLE_RATE;
  return asked ? { callId: call.callId, title: call.title, media: call.media } : null;
}

const AUDIO_ISSUES: readonly CallFeedbackIssue[] = ['audio_quality', 'echo', 'dropped', 'other'];
const VIDEO_ISSUES: readonly CallFeedbackIssue[] = ['audio_quality', 'video_quality', 'echo', 'dropped', 'sync', 'other'];

export function feedbackIssuesFor(media: CallMedia): readonly CallFeedbackIssue[] {
  return media === 'video' ? VIDEO_ISSUES : AUDIO_ISSUES;
}

export function feedbackPayload(params: {
  readonly callId: string;
  readonly rating: CallFeedbackRating;
  readonly issues: readonly CallFeedbackIssue[];
}): CallQualityFeedbackEvent {
  const issues = params.rating >= FEEDBACK_GOOD_RATING ? [] : [...new Set(params.issues)];
  return { callId: params.callId, rating: params.rating, ...(issues.length > 0 ? { issues } : {}) };
}

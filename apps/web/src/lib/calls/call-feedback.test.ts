import { describe, expect, test } from 'bun:test';

import { FEEDBACK_MIN_SECONDS, feedbackIssuesFor, feedbackPayload, feedbackPromptFor } from './call-feedback';

/**
 * LA NOTE D'APRÈS-APPEL (#8072) — demandée par échantillon, jamais après
 * chaque appel : un appel qui a vraiment eu lieu (≥ 10 s), et toujours quand
 * il a souffert (qualité mauvaise, reprise, connexion perdue).
 */

const ended = { callId: 'call-1', title: 'Amina', media: 'audio' as const };

describe('feedbackPromptFor', () => {
  test('un appel ordinaire n’est demandé qu’au tirage de l’échantillon', () => {
    const base = { call: ended, reason: 'local' as const, durationSec: 120, troubled: false };
    expect(feedbackPromptFor({ ...base, random: 0.05 })).toEqual(ended);
    expect(feedbackPromptFor({ ...base, random: 0.9 })).toBeNull();
  });

  test('un appel qui a souffert est toujours demandé, y compris une connexion perdue', () => {
    expect(feedbackPromptFor({ call: ended, reason: 'remote', durationSec: 60, troubled: true, random: 0.99 })).toEqual(ended);
    expect(feedbackPromptFor({ call: ended, reason: 'connectionLost', durationSec: 60, troubled: false, random: 0.99 })).toEqual(ended);
  });

  test('jamais pour un appel trop court, jamais décroché ou sans identité', () => {
    expect(feedbackPromptFor({ call: ended, reason: 'local', durationSec: FEEDBACK_MIN_SECONDS - 1, troubled: true, random: 0 })).toBeNull();
    expect(feedbackPromptFor({ call: ended, reason: 'local', durationSec: null, troubled: true, random: 0 })).toBeNull();
    expect(feedbackPromptFor({ call: ended, reason: 'rejected', durationSec: 60, troubled: true, random: 0 })).toBeNull();
    expect(feedbackPromptFor({ call: ended, reason: 'missed', durationSec: 60, troubled: true, random: 0 })).toBeNull();
    expect(feedbackPromptFor({ call: { ...ended, callId: null }, reason: 'local', durationSec: 60, troubled: true, random: 0 })).toBeNull();
  });
});

describe('feedbackIssuesFor', () => {
  test('les motifs vidéo ne sont proposés qu’après un appel vidéo', () => {
    expect(feedbackIssuesFor('audio')).not.toContain('video_quality');
    expect(feedbackIssuesFor('video')).toContain('video_quality');
    const offered: readonly string[] = feedbackIssuesFor('audio');
    expect(['echo', 'dropped', 'audio_quality'].every((issue) => offered.includes(issue))).toBe(true);
  });
});

describe('feedbackPayload', () => {
  test('une bonne note part sans motifs ; une mauvaise garde les siens, sans doublon', () => {
    expect(feedbackPayload({ callId: 'call-1', rating: 5, issues: ['echo'] })).toEqual({ callId: 'call-1', rating: 5 });
    expect(feedbackPayload({ callId: 'call-1', rating: 2, issues: ['echo', 'echo', 'dropped'] })).toEqual({ callId: 'call-1', rating: 2, issues: ['echo', 'dropped'] });
    expect(feedbackPayload({ callId: 'call-1', rating: 3, issues: [] })).toEqual({ callId: 'call-1', rating: 3 });
  });
});

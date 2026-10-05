import { describe, it, expect } from 'vitest';
import {
  CALL_REACTION_EMOJIS,
  callInviteParticipantSchema,
  callMuteParticipantSchema,
  callReactionSchema,
  parseCallReactionCounts,
} from '../types/call-controls.js';
import { CALL_RECORDING_KINDS, callRecordingKindOf } from '../types/call-recording.js';
import { CLIENT_EVENTS, SERVER_EVENTS } from '../types/socketio-events.js';

const CALL_ID = '65f000000000000000000001';
const USER_ID = '65f000000000000000000002';

describe('contrôles d’appel — invitation, micro coupé, réactions (#8433, #8438, #8439)', () => {
  it('nomme ses six événements au format entity:action-word', () => {
    expect(CLIENT_EVENTS.CALL_INVITE_PARTICIPANT).toBe('call:invite-participant');
    expect(CLIENT_EVENTS.CALL_MUTE_PARTICIPANT).toBe('call:mute-participant');
    expect(CLIENT_EVENTS.CALL_REACTION).toBe('call:reaction');
    expect(SERVER_EVENTS.CALL_PARTICIPANT_INVITED).toBe('call:participant-invited');
    expect(SERVER_EVENTS.CALL_MUTED_BY_MODERATOR).toBe('call:muted-by-moderator');
    expect(SERVER_EVENTS.CALL_REACTION_RECEIVED).toBe('call:reaction-received');
  });

  it('une invitation nomme un appel et une personne, rien d’autre', () => {
    expect(callInviteParticipantSchema.safeParse({ callId: CALL_ID, userId: USER_ID }).success).toBe(true);
    expect(callInviteParticipantSchema.safeParse({ callId: CALL_ID, userId: 'bob' }).success).toBe(false);
    expect(callInviteParticipantSchema.safeParse({ callId: CALL_ID, userId: USER_ID, role: 'admin' }).success).toBe(false);
  });

  it('couper un micro vise une entrée du roster, et ne porte aucun « rallumer »', () => {
    expect(callMuteParticipantSchema.safeParse({ callId: CALL_ID, targetUserId: USER_ID }).success).toBe(true);
    expect(callMuteParticipantSchema.safeParse({ callId: CALL_ID, targetUserId: USER_ID, enabled: true }).success).toBe(false);
    expect(callMuteParticipantSchema.safeParse({ callId: CALL_ID }).success).toBe(false);
  });

  it('une réaction n’accepte que les emojis de la liste blanche', () => {
    expect(CALL_REACTION_EMOJIS.length).toBe(8);
    expect(callReactionSchema.safeParse({ callId: CALL_ID, emoji: CALL_REACTION_EMOJIS[0] }).success).toBe(true);
    expect(callReactionSchema.safeParse({ callId: CALL_ID, emoji: '💩' }).success).toBe(false);
    expect(callReactionSchema.safeParse({ callId: CALL_ID, emoji: '👍', extra: 1 }).success).toBe(false);
  });

  it('les comptes lus en base ne gardent que les emojis connus et les entiers positifs', () => {
    expect(parseCallReactionCounts({ '👍': 3, '💩': 9, '🔥': -1, '❤️': 2.5, '🎉': 0 })).toEqual({ '👍': 3 });
    expect(parseCallReactionCounts(null)).toEqual({});
    expect(parseCallReactionCounts('garbage')).toEqual({});
  });
});

describe('type d’enregistrement (#8437)', () => {
  it('connaît l’audio seul et la vidéo avec son audio', () => {
    expect(CALL_RECORDING_KINDS).toEqual(['audio', 'video']);
  });

  it('lit un enregistrement antérieur au champ comme de l’audio', () => {
    expect(callRecordingKindOf(null)).toBe('audio');
    expect(callRecordingKindOf(undefined)).toBe('audio');
    expect(callRecordingKindOf('video')).toBe('video');
    expect(callRecordingKindOf('hologram')).toBe('audio');
  });
});

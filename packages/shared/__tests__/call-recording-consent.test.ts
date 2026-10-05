import { describe, it, expect } from 'vitest';
import {
  CALL_RECORDING_CONSENT_TIMEOUT_MS,
  recordingPhase,
  evaluateConsent,
  evaluateArrival,
  mayLinkRecording,
  type CallRecordingState,
} from '../utils/call-recording-consent.js';
import { SERVER_EVENTS, CLIENT_EVENTS } from '../types/socketio-events.js';

const T0 = 1_700_000_000_000;

const pending = (overrides: Partial<CallRecordingState> = {}): CallRecordingState => ({
  requesterId: 'alice',
  requiredUserIds: ['bob', 'carol'],
  consentedUserIds: [],
  requestedAt: T0,
  startedAt: null,
  stoppedAt: null,
  ...overrides,
});

describe('enregistrement d’appel — le consentement de tous (#8064)', () => {
  it('nomme ses six événements au format entity:action-word', () => {
    expect(CLIENT_EVENTS.CALL_RECORDING_REQUEST).toBe('call:recording-request');
    expect(CLIENT_EVENTS.CALL_RECORDING_CONSENT).toBe('call:recording-consent');
    expect(CLIENT_EVENTS.CALL_RECORDING_STOP).toBe('call:recording-stop');
    expect(SERVER_EVENTS.CALL_RECORDING_REQUESTED).toBe('call:recording-requested');
    expect(SERVER_EVENTS.CALL_RECORDING_STARTED).toBe('call:recording-started');
    expect(SERVER_EVENTS.CALL_RECORDING_STOPPED).toBe('call:recording-stopped');
  });

  it('une demande sans réponse est en attente, puis expire au délai', () => {
    expect(recordingPhase(pending(), T0 + 1000)).toBe('pending');
    expect(recordingPhase(pending(), T0 + CALL_RECORDING_CONSENT_TIMEOUT_MS)).toBe('expired');
  });

  it('un enregistrement démarré ou arrêté garde sa phase', () => {
    expect(recordingPhase(pending({ startedAt: T0 + 10 }), T0 + 10 * CALL_RECORDING_CONSENT_TIMEOUT_MS)).toBe('active');
    expect(recordingPhase(pending({ startedAt: T0 + 10, stoppedAt: T0 + 20 }), T0 + 30)).toBe('stopped');
    expect(recordingPhase(pending({ stoppedAt: T0 + 20 }), T0 + 30)).toBe('stopped');
  });

  it('ne démarre qu’après l’accord du DERNIER participant requis', () => {
    const first = evaluateConsent(pending(), { userId: 'bob', accepted: true }, T0 + 100);
    expect(first).toEqual({ kind: 'accepted', allConsented: false });

    const last = evaluateConsent(pending({ consentedUserIds: ['bob'] }), { userId: 'carol', accepted: true }, T0 + 200);
    expect(last).toEqual({ kind: 'accepted', allConsented: true });
  });

  it('un seul refus arrête la demande', () => {
    expect(evaluateConsent(pending({ consentedUserIds: ['bob'] }), { userId: 'carol', accepted: false }, T0 + 1)).toEqual({ kind: 'refused' });
  });

  it('refuse (fail-closed) une réponse hors délai, d’un tiers, du demandeur ou sur une demande close', () => {
    const late = T0 + CALL_RECORDING_CONSENT_TIMEOUT_MS + 1;
    expect(evaluateConsent(pending(), { userId: 'bob', accepted: true }, late)).toEqual({ kind: 'rejected', code: 'RECORDING_EXPIRED' });
    expect(evaluateConsent(pending(), { userId: 'mallory', accepted: true }, T0 + 1)).toEqual({ kind: 'rejected', code: 'NOT_A_CONSENTER' });
    expect(evaluateConsent(pending(), { userId: 'alice', accepted: true }, T0 + 1)).toEqual({ kind: 'rejected', code: 'NOT_A_CONSENTER' });
    expect(evaluateConsent(pending({ stoppedAt: T0 + 1 }), { userId: 'bob', accepted: true }, T0 + 2)).toEqual({ kind: 'rejected', code: 'RECORDING_NOT_PENDING' });
    expect(evaluateConsent(pending({ startedAt: T0 + 1 }), { userId: 'bob', accepted: true }, T0 + 2)).toEqual({ kind: 'rejected', code: 'RECORDING_NOT_PENDING' });
  });

  it('un accord répété ne compte qu’une fois', () => {
    expect(evaluateConsent(pending({ consentedUserIds: ['bob'] }), { userId: 'bob', accepted: true }, T0 + 1)).toEqual({ kind: 'accepted', allConsented: false });
  });

  it('un participant qui rejoint sans avoir consenti arrête une demande ou un enregistrement en cours', () => {
    expect(evaluateArrival(pending(), 'dave', T0 + 1)).toBe('stop');
    expect(evaluateArrival(pending({ startedAt: T0 + 1 }), 'dave', T0 + 2)).toBe('stop');
  });

  it('le retour d’un participant qui a déjà consenti ne coupe rien, pas plus qu’une arrivée après l’arrêt', () => {
    expect(evaluateArrival(pending({ startedAt: T0 + 1, consentedUserIds: ['bob', 'carol'] }), 'bob', T0 + 2)).toBe('ignore');
    expect(evaluateArrival(pending({ startedAt: T0 + 1 }), 'alice', T0 + 2)).toBe('ignore');
    expect(evaluateArrival(pending({ stoppedAt: T0 + 1 }), 'dave', T0 + 2)).toBe('ignore');
  });

  it('seul l’enregistreur d’un enregistrement réellement démarré peut y lier un fichier, une seule fois', () => {
    const recorded = pending({ startedAt: T0 + 1, stoppedAt: T0 + 9 });
    expect(mayLinkRecording({ ...recorded, attachmentId: null }, 'alice')).toBe(true);
    expect(mayLinkRecording({ ...recorded, attachmentId: null }, 'bob')).toBe(false);
    expect(mayLinkRecording({ ...pending({ stoppedAt: T0 + 9 }), attachmentId: null }, 'alice')).toBe(false);
    expect(mayLinkRecording({ ...recorded, attachmentId: 'att' }, 'alice')).toBe(false);
  });
});

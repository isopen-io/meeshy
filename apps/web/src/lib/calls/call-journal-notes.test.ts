import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { CallCaption } from './call-captions';
import { CALL_SERVER_EVENTS } from './call-socket-bridge';
import { journalEntries, overlayEntries, recordingNote, withJournalNote, type CallJournalNote } from './call-journal-notes';
import type { ActiveCall, CallMember } from './call-store';

const member = (userId: string, name: string): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' });

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall =>
  ({
    callId: 'c1',
    members: { 'u-karim': member('u-karim', 'Karim') },
    captions: [],
    journalNotes: [],
    ...overrides,
  }) as ActiveCall;

const caption = (id: string, at: number): CallCaption => ({ id, speakerId: 'u-awa', speakerName: 'Awa', original: 'Hi', translated: null, pair: null, isFinal: true, at, mine: false });

const note = (overrides: Partial<CallJournalNote> = {}): CallJournalNote => ({ id: 'n1', kind: 'screenshot', userId: 'u-karim', name: null, at: 1_000, ...overrides });

describe('le journal vivant garde les captures (#16665)', () => {
  test('une capture prend le nom du membre à son heure, pour survivre à son départ', () => {
    const next = withJournalNote(call(), note());
    expect(next.journalNotes).toEqual([note({ name: 'Karim' })]);
  });

  test('une capture d’écran redite dans les 5 s par la même personne ne s’inscrit qu’une fois', () => {
    const once = withJournalNote(call(), note({ id: 'a', at: 1_000 }));
    const twice = withJournalNote(once, note({ id: 'b', at: 4_000 }));
    const otherKind = withJournalNote(twice, note({ id: 'c', kind: 'recording', at: 4_500 }));
    const later = withJournalNote(otherKind, note({ id: 'd', at: 7_000 }));
    expect(later.journalNotes?.map((entry) => entry.id)).toEqual(['a', 'c', 'd']);
  });

  test('une note déjà inscrite (même id) ne se double pas', () => {
    const once = withJournalNote(call(), note({ id: 'rec-start:r1', kind: 'call-recording-started', userId: null }));
    expect(withJournalNote(once, note({ id: 'rec-start:r1', kind: 'call-recording-started', userId: null }))).toBe(once);
  });

  test('les phrases et les notes se rangent à leur heure, et le bandeau montre les deux dernières', () => {
    const captions = [caption('s1', 500), caption('s2', 2_000)];
    const notes = [note({ id: 'n1', at: 1_000 })];
    expect(journalEntries(captions, notes).map((entry) => (entry.type === 'caption' ? entry.caption.id : entry.note.id))).toEqual(['s1', 'n1', 's2']);
    expect(overlayEntries(captions, notes, 2).map((entry) => (entry.type === 'caption' ? entry.caption.id : entry.note.id))).toEqual(['n1', 's2']);
  });
});

describe('une note se range dans l’ordre d’arrivée, quelle que soit l’horloge du pair', () => {
  test('une capture arrivée après une phrase datée en avance par l’appareil du pair reste au bandeau', () => {
    const captions = [caption('s1', 10_000), caption('s2', 12_000)];
    const next = withJournalNote(call({ captions }), note({ id: 'n1', at: 8_000 }));
    const shown = overlayEntries(captions, next.journalNotes ?? [], 2).map((entry) => (entry.type === 'caption' ? entry.caption.id : entry.note.id));
    expect(shown).toEqual(['s2', 'n1']);
  });
});

describe('l’enregistrement consenti note son début et sa fin', () => {
  test('le pont remet aussi ces deux moments au moteur, qui seul écrit le journal', () => {
    expect(CALL_SERVER_EVENTS).toContain(SERVER_EVENTS.CALL_RECORDING_STARTED);
    expect(CALL_SERVER_EVENTS).toContain(SERVER_EVENTS.CALL_RECORDING_STOPPED);
  });

  test('`call:recording-started` et `call:recording-stopped` d’un enregistrement qui avait commencé', () => {
    expect(recordingNote(SERVER_EVENTS.CALL_RECORDING_STARTED, { callId: 'c1', recordingId: 'r1', recorderId: 'u-awa' }, 9_000)).toEqual({ callId: 'c1', note: { id: 'rec-start:r1', kind: 'call-recording-started', userId: 'u-awa', name: null, at: 9_000 } });
    expect(recordingNote(SERVER_EVENTS.CALL_RECORDING_STOPPED, { callId: 'c1', recordingId: 'r1', byUserId: null, wasRecording: true }, 9_500)?.note).toEqual({ id: 'rec-stop:r1', kind: 'call-recording-stopped', userId: null, name: null, at: 9_500 });
  });

  test('un arrêt avant tout démarrage, une demande ou une charge mal formée ne notent rien', () => {
    expect(recordingNote(SERVER_EVENTS.CALL_RECORDING_STOPPED, { callId: 'c1', recordingId: 'r1', wasRecording: false }, 1)).toBeNull();
    expect(recordingNote(SERVER_EVENTS.CALL_RECORDING_REQUESTED, { callId: 'c1', recordingId: 'r1' }, 1)).toBeNull();
    expect(recordingNote(SERVER_EVENTS.CALL_RECORDING_STARTED, { callId: 'c1' }, 1)).toBeNull();
  });
});

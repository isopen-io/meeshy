import { describe, expect, it } from 'vitest';

import { QUOTABLE_NOTICE_KINDS, quotableNoticeKind, quotedNoticeText } from './quotable-notice';

describe('quotableNoticeKind — les avis AFFICHÉS qu’on peut citer (#17441)', () => {
  it.each(['call', 'call-live', 'member-joined', 'members-arrived', 'member-left'])('%s se cite', (kind) => {
    expect(quotableNoticeKind({ messageType: 'system', metadata: { kind } })).toBe(kind);
  });

  it.each(['content-capture', 'member-removed', 'conversation-renamed', 'conversation-image', undefined])('%s ne se cite pas', (kind) => {
    expect(quotableNoticeKind({ messageType: 'system', metadata: kind ? { kind } : {} })).toBeNull();
  });

  it('seul un message SYSTÈME est un avis : un texte qui porterait la clé n’en est pas un', () => {
    expect(quotableNoticeKind({ messageType: 'text', metadata: { kind: 'call' } })).toBeNull();
    expect(quotableNoticeKind({ messageType: 'system', metadata: null })).toBeNull();
    expect(quotableNoticeKind({ messageType: 'system', metadata: ['call'] })).toBeNull();
  });

  it('la liste est fermée', () => {
    expect([...QUOTABLE_NOTICE_KINDS]).toEqual(['call', 'call-live', 'member-joined', 'members-arrived', 'member-left']);
  });
});

const callMetadata = (overrides: Record<string, unknown> = {}) => ({
  kind: 'call',
  callId: 'call-1',
  initiatorId: 'u-ama',
  callType: 'audio',
  outcome: 'missed',
  durationSeconds: 0,
  bytesTotal: null,
  bytesEstimated: false,
  networkQuality: null,
  ...overrides,
});

describe('quotedNoticeText — ce qu’une citation d’avis DIT, dans la langue du lecteur (#17441)', () => {
  it('un appel manqué reçu se dit « manqué » ; émis par le lecteur, « sans réponse » ou « annulé »', () => {
    expect(quotedNoticeText({ metadata: callMetadata(), viewerId: 'u-kofi', language: 'en' })).toBe('Missed call');
    expect(quotedNoticeText({ metadata: callMetadata(), viewerId: 'u-ama', language: 'en' })).toBe('Unanswered call');
    expect(quotedNoticeText({ metadata: callMetadata({ endedByInitiator: true }), viewerId: 'u-ama', language: 'fr' })).toBe('Appel annulé');
  });

  it('un appel abouti se dit par son média et sa durée ; un appel en cours, « en cours »', () => {
    expect(quotedNoticeText({ metadata: callMetadata({ outcome: 'completed', callType: 'video', durationSeconds: 272 }), viewerId: 'u-kofi', language: 'en' })).toBe('Video call · 04:32');
    expect(quotedNoticeText({ metadata: callMetadata({ kind: 'call-live', outcome: 'completed' }), viewerId: 'u-kofi', language: 'fr' })).toBe('Appel en cours');
    expect(quotedNoticeText({ metadata: callMetadata({ outcome: 'rejected' }), viewerId: 'u-kofi', language: 'en' })).toBe('Declined call');
  });

  it('une arrivée, des arrivées regroupées et un départ se disent dans la langue du lecteur', () => {
    const joined = { kind: 'member-joined', participantId: 'p-1', displayName: 'Bruno', isAnonymous: false, viaShareLink: false };
    expect(quotedNoticeText({ metadata: joined, viewerId: 'u', language: 'en' })).toBe('Bruno joined the conversation');
    expect(quotedNoticeText({ metadata: { ...joined, addedBy: { participantId: 'p-2', displayName: 'Demo' } }, viewerId: 'u', language: 'en' })).toBe('Demo added Bruno');
    const arrived = { kind: 'members-arrived', arrivals: [{ participantId: 'p-1', displayName: 'Aïcha' }], count: 1, windowStartedAt: '2026-11-10T08:00:00.000Z' };
    expect(quotedNoticeText({ metadata: arrived, viewerId: 'u', language: 'en' })).toBe('Aïcha just arrived — say hi');
    const left = { kind: 'member-left', actor: { participantId: 'p-1', displayName: 'Bob' } };
    expect(quotedNoticeText({ metadata: left, viewerId: 'u', language: 'en' })).toBe('Bob left the conversation');
  });

  it('un avis non citable ou illisible ne se dit pas : la citation retombe sur son texte', () => {
    expect(quotedNoticeText({ metadata: { kind: 'member-removed', actor: { participantId: 'a', displayName: 'A' }, target: { participantId: 'b', displayName: 'B' } }, viewerId: 'u', language: 'en' })).toBeNull();
    expect(quotedNoticeText({ metadata: { kind: 'member-left' }, viewerId: 'u', language: 'en' })).toBeNull();
    expect(quotedNoticeText({ metadata: undefined, viewerId: 'u', language: 'en' })).toBeNull();
  });
});

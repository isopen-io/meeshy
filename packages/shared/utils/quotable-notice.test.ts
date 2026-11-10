import { describe, expect, it } from 'vitest';

import { QUOTABLE_NOTICE_KINDS, quotableNoticeKind } from './quotable-notice';

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

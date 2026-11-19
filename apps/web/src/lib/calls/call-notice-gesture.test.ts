import { describe, expect, test } from 'bun:test';

import { callNoticeGesture, type CallNoticeTarget } from './call-notice';

/**
 * #19778 — la carte d'un appel TERMINÉ offrait encore « Rejoindre », et le
 * toucher répondait « appel terminé ». La copie du message (`call-live`) ne
 * suffit plus : « Rejoindre » exige que la passerelle confirme un appel vivant
 * de CE `callId` ; tant qu'elle ne l'a pas dit, la carte reste neutre ; quand
 * elle dit autre chose, la carte est celle d'un appel fini (« Rappeler »).
 */

const target = (overrides: Partial<CallNoticeTarget> = {}): CallNoticeTarget => ({
  conversationId: 'c1',
  callId: 'k1',
  media: 'audio',
  live: true,
  transcript: false,
  recording: null,
  ...overrides,
});

const settled = (served: { readonly callId: string; readonly media: 'audio' | 'video' } | null | undefined) => ({ served, confirming: false });

describe('callNoticeGesture (#19778)', () => {
  test('un résumé terminé se rappelle, sans rien demander à la passerelle', () => {
    expect(callNoticeGesture(target({ live: false }), settled(undefined))).toBe('call-back');
    expect(callNoticeGesture(target({ live: false }), settled({ callId: 'k1', media: 'audio' }))).toBe('call-back');
  });

  test('une carte « en cours » se rejoint quand la passerelle confirme CET appel vivant', () => {
    expect(callNoticeGesture(target(), settled({ callId: 'k1', media: 'audio' }))).toBe('join');
    expect(callNoticeGesture(target(), { served: { callId: 'k1', media: 'audio' }, confirming: true })).toBe('join');
  });

  test('avant la réponse de la passerelle, ou pendant qu’elle reconfirme une autre réponse, la carte reste neutre', () => {
    expect(callNoticeGesture(target(), settled(undefined))).toBeNull();
    expect(callNoticeGesture(target(), { served: null, confirming: true })).toBeNull();
    expect(callNoticeGesture(target(), { served: { callId: 'k2', media: 'audio' }, confirming: true })).toBeNull();
  });

  test('la passerelle ne voit plus cet appel : la carte est celle d’un appel fini', () => {
    expect(callNoticeGesture(target(), settled(null))).toBe('call-back');
    expect(callNoticeGesture(target(), settled({ callId: 'k2', media: 'video' }))).toBe('call-back');
  });

  test('une carte « en cours » sans identifiant d’appel ne se rejoint jamais à l’aveugle', () => {
    expect(callNoticeGesture(target({ callId: null }), settled({ callId: 'k1', media: 'audio' }))).toBe('call-back');
  });
});

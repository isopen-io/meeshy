import { beforeAll, describe, expect, test } from 'bun:test';

import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';

import { controlNoticeText, noticeRole } from './call-control-text';

/**
 * LE MOT D'UN CONTRÔLE D'APPEL (#8433, #8438) — qui m'a coupé, et pourquoi mon
 * geste n'a pas abouti, dans la langue de l'interface ; jamais un code brut.
 */

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
});

const nameOf = (userId: string) => (userId === 'u-nadia' ? 'Nadia' : null);

describe('le mot d’un contrôle d’appel', () => {
  test('« Nadia a coupé votre micro » ; un inconnu devient « Un participant »', () => {
    expect(controlNoticeText('fr', { kind: 'muted-by', byUserId: 'u-nadia' }, nameOf)).toBe('Nadia a coupé votre micro');
    expect(controlNoticeText('fr', { kind: 'muted-by', byUserId: 'u-x' }, nameOf)).toBe('Un participant a coupé votre micro');
  });

  test('chaque refus d’invitation dit sa raison', () => {
    expect(controlNoticeText('fr', { kind: 'invite-failed', code: 'NOT_A_CONTACT', name: 'Bruno' }, nameOf)).toBe('Bruno n’est pas dans vos contacts');
    expect(controlNoticeText('fr', { kind: 'invite-failed', code: 'MAX_PARTICIPANTS_REACHED', name: 'Bruno' }, nameOf)).toBe('L’appel est complet');
    expect(controlNoticeText('fr', { kind: 'invite-failed', code: 'INTERNAL_ERROR', name: 'Bruno' }, nameOf)).toBe('Impossible d’inviter Bruno');
  });

  test('une invitation qui se résout sans décroché le dit, en statut discret (#8470)', () => {
    expect(controlNoticeText('fr', { kind: 'invite-declined', name: 'Léa' }, nameOf)).toBe('Léa a refusé');
    expect(controlNoticeText('fr', { kind: 'invite-unanswered', name: 'Léa' }, nameOf)).toBe('Léa n’a pas répondu');
    expect(noticeRole({ kind: 'invite-declined', name: 'Léa' })).toBe('status');
    expect(noticeRole({ kind: 'invite-unanswered', name: 'Léa' })).toBe('status');
  });

  test('un micro qu’on n’a pas pu couper, un retrait refusé', () => {
    expect(controlNoticeText('fr', { kind: 'mute-failed', code: 'PERMISSION_DENIED', name: 'Nadia' }, nameOf)).toBe('Vous n’avez pas ce droit dans cet appel');
    expect(controlNoticeText('fr', { kind: 'mute-failed', code: 'VALIDATION_ERROR', name: 'Nadia' }, nameOf)).toBe('Impossible de couper le micro de Nadia');
    expect(controlNoticeText('fr', { kind: 'remove-failed', name: 'Nadia' }, nameOf)).toBe('Impossible de retirer Nadia');
  });

  test('une coupure imposée se dit, un échec s’annonce', () => {
    expect(noticeRole({ kind: 'muted-by', byUserId: 'u' })).toBe('status');
    expect(noticeRole({ kind: 'remove-failed', name: 'x' })).toBe('alert');
  });
});

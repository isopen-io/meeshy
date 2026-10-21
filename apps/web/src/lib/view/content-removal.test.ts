import { describe, expect, test } from 'bun:test';

import {
  MODERATION_REASON_MAX,
  moderatesConversation,
  moderatesPlatformContent,
  moderationReasonOf,
  removalBody,
} from './content-removal';

describe('le motif d’un retrait', () => {
  test('nettoyé de ses bords, il part entre 3 et 500 caractères — sinon rien ne part', () => {
    expect(moderationReasonOf('  Spam répété  ')).toBe('Spam répété');
    expect(moderationReasonOf('ab')).toBeNull();
    expect(moderationReasonOf('   ab   ')).toBeNull();
    expect(moderationReasonOf('')).toBeNull();
    expect(moderationReasonOf('x'.repeat(MODERATION_REASON_MAX))).toBe('x'.repeat(500));
    expect(moderationReasonOf('x'.repeat(MODERATION_REASON_MAX + 1))).toBeNull();
  });

  test('le corps du DELETE ne porte le motif que s’il y en a un — l’auteur supprime sans corps, comme avant', () => {
    expect(removalBody(undefined)).toEqual({});
    expect(removalBody('Spam')).toEqual({ body: { reason: 'Spam' } });
  });
});

describe('qui retire le message d’un autre dans une conversation', () => {
  test('jamais dans une conversation directe, quel que soit le rôle', () => {
    expect(moderatesConversation({ conversation: { type: 'direct', currentUserRole: 'creator' }, platformRole: 'BIGBOSS' })).toBe(false);
  });

  test('le créateur, l’administrateur et le modérateur d’un groupe, d’une conversation publique, globale ou de diffusion', () => {
    for (const type of ['group', 'public', 'global', 'broadcast']) {
      for (const role of ['creator', 'admin', 'moderator']) {
        expect({ type, role, ok: moderatesConversation({ conversation: { type, currentUserRole: role }, platformRole: null }) }).toEqual({ type, role, ok: true });
      }
    }
  });

  test('le rang se lit EXACT, comme la passerelle le compare — plier la casse offrirait ce qu’elle refuse (#11210)', () => {
    expect(moderatesConversation({ conversation: { type: 'group', currentUserRole: 'ADMIN' }, platformRole: null })).toBe(false);
  });

  test('un simple membre non, sauf rôle de plateforme MODERATOR, ADMIN ou BIGBOSS', () => {
    const conversation = { type: 'group', currentUserRole: 'member' };
    expect(moderatesConversation({ conversation, platformRole: null })).toBe(false);
    expect(moderatesConversation({ conversation, platformRole: 'USER' })).toBe(false);
    expect(moderatesConversation({ conversation, platformRole: 'AUDIT' })).toBe(false);
    for (const role of ['MODERATOR', 'ADMIN', 'BIGBOSS']) expect(moderatesConversation({ conversation, platformRole: role })).toBe(true);
  });

  test('un type inconnu n’ouvre rien', () => {
    expect(moderatesConversation({ conversation: { type: 'mystery', currentUserRole: 'creator' }, platformRole: 'ADMIN' })).toBe(false);
  });
});

describe('qui retire la publication ou le commentaire d’un autre', () => {
  test('le rôle de plateforme MODERATOR, ADMIN ou BIGBOSS, servi — jamais deviné', () => {
    expect(['MODERATOR', 'ADMIN', 'BIGBOSS'].map(moderatesPlatformContent)).toEqual([true, true, true]);
    expect(['USER', 'AUDIT', 'ANALYST', null, undefined, ''].map(moderatesPlatformContent)).toEqual([false, false, false, false, false, false]);
  });
});

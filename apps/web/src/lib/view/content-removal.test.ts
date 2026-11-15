import { describe, expect, test } from 'bun:test';

import {
  MODERATION_REASON_MAX,
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

describe('qui retire la publication ou le commentaire d’un autre', () => {
  test('le rôle de plateforme MODERATOR, ADMIN ou BIGBOSS, servi — jamais deviné', () => {
    expect(['MODERATOR', 'ADMIN', 'BIGBOSS'].map(moderatesPlatformContent)).toEqual([true, true, true]);
    expect(['USER', 'AUDIT', 'ANALYST', null, undefined, ''].map(moderatesPlatformContent)).toEqual([false, false, false, false, false, false]);
  });
});

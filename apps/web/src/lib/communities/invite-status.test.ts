import { beforeAll, describe, expect, test } from 'bun:test';

import type { InviteOutcome } from '@/lib/api/community-invite';
import { loadCommunityMembershipCatalog } from '@/lib/i18n-community-membership-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { inviteStatusOf } from './invite-status';

const done = (counts: Partial<Omit<Extract<InviteOutcome, { status: 'done' }>, 'status'>>): InviteOutcome => ({
  status: 'done',
  invited: 0,
  already: 0,
  refused: 0,
  failed: 0,
  throttled: 0,
  ...counts,
});

beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadCommunityMembershipCatalog(language)));
});

describe('ce qu’une invitation a donné — le budget d’ajouts (#20657)', () => {
  test('personne n’entre parce que le budget est plein : « réessayez plus tard », jamais « l’invitation a échoué »', () => {
    expect(inviteStatusOf('fr', done({ throttled: 3 }))).toBe('Trop d’ajouts pour l’instant. Réessayez plus tard.');
  });

  test('le budget l’emporte sur une panne voisine : réessayer tout de suite ne servirait à rien', () => {
    expect(inviteStatusOf('fr', done({ throttled: 1, failed: 1 }))).toBe('Trop d’ajouts pour l’instant. Réessayez plus tard.');
  });

  test('certains sont entrés avant que le budget soit plein : le nombre, puis la raison', () => {
    expect(inviteStatusOf('fr', done({ invited: 2, throttled: 4 }))).toBe(
      '2 personnes ont rejoint la communauté. Trop d’ajouts pour l’instant. Réessayez plus tard.',
    );
  });

  test('la phrase ne dit pas QUI est saturé (l’acteur ou la personne ajoutée)', () => {
    const phrase = inviteStatusOf('fr', done({ throttled: 1 }));
    expect(phrase).not.toMatch(/elle|cette personne|vous avez/i);
  });

  test('les sept langues ont leur phrase, distincte de l’échec générique', () => {
    SUPPORTED_INTERFACE_LANGUAGES.forEach((language) => {
      const throttled = inviteStatusOf(language, done({ throttled: 1 }));
      expect(throttled.length).toBeGreaterThan(0);
      expect(throttled).not.toBe(inviteStatusOf(language, done({ failed: 1 })));
    });
  });

  test('sans budget plein, rien ne change — le témoin miroir', () => {
    expect(inviteStatusOf('fr', done({ failed: 1 }))).toBe('L’invitation a échoué. Réessayez.');
    expect(inviteStatusOf('fr', done({ invited: 1, refused: 1 }))).toBe(
      '1 personne a rejoint la communauté. Certaines personnes n’ont pas pu être ajoutées.',
    );
  });
});

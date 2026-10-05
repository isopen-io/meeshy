import { describe, expect, test } from 'bun:test';

import type { PersonSummary } from '@/lib/api/friend-requests';

import { invitableFriends, personOf } from './call-people';

/**
 * QUI L'ON PEUT AJOUTER À UN APPEL (#8433) — ses contacts acceptés, moins
 * celles et ceux déjà dans l'appel (ou qui y sonnent), filtrés par la
 * recherche sans accents ni casse.
 */

const person = (id: string, displayName: string | null, username = id): PersonSummary => ({ id, username, displayName, avatar: null });

const friends = [person('u-bruno', 'Bruno'), person('u-elodie', 'Élodie'), person('u-nadia', 'Nadia')];

describe('qui l’on peut ajouter à un appel', () => {
  test('les contacts moins ceux déjà dans l’appel', () => {
    expect(invitableFriends({ friends, inCall: ['u-nadia'], query: '' }).map((p) => p.id)).toEqual(['u-bruno', 'u-elodie']);
  });

  test('la recherche ignore accents et casse', () => {
    expect(invitableFriends({ friends, inCall: [], query: 'elo' }).map((p) => p.id)).toEqual(['u-elodie']);
    expect(invitableFriends({ friends, inCall: [], query: '  BRU ' }).map((p) => p.id)).toEqual(['u-bruno']);
  });

  test('tout le monde est déjà là : personne à proposer', () => {
    expect(invitableFriends({ friends, inCall: ['u-bruno', 'u-elodie', 'u-nadia'], query: '' })).toEqual([]);
  });

  test('une personne devient l’invitée que le moteur attend, nommée par son nom affiché ou son pseudo', () => {
    expect(personOf(person('u-bruno', 'Bruno'))).toEqual({ userId: 'u-bruno', name: 'Bruno', avatar: null });
    expect(personOf(person('u-x', null, 'xavier'))).toEqual({ userId: 'u-x', name: 'xavier', avatar: null });
  });
});

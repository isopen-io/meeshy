import { describe, expect, test } from 'bun:test';

import { decodeFriendRequest, decodePerson, type FriendRequestRecord, type PersonSummary } from '@/lib/api/friend-requests';

import { candidatesFor, friendsOf } from './candidates';

/**
 * LES AMIS D'ABORD (#6705) — directive porteur 2026-09-15 : « créer de
 * nouvelles conversations à partir de cette interface, et que ça charge ses
 * amis en premier en cache local ». Ces témoins tiennent la PROJECTION : ce que
 * l'écran propose à partir des amitiés acceptées (servies par le cache persisté
 * de TanStack Query) et de la recherche globale, sans DOM ni réseau.
 */

const ME = 'u-me';

const wirePerson = (id: string, displayName: string | null, username: string = id) => ({
  id,
  username,
  displayName,
  avatar: null,
});

const friendship = (senderId: string, receiverId: string, people: Readonly<Record<string, unknown>>): FriendRequestRecord =>
  decodeFriendRequest({
    id: `f-${senderId}-${receiverId}`,
    senderId,
    receiverId,
    status: 'accepted',
    message: null,
    createdAt: '2026-09-15T09:00:00.000Z',
    sender: people[senderId],
    receiver: people[receiverId],
  }) as FriendRequestRecord;

const PEOPLE = {
  [ME]: wirePerson(ME, 'Moi', 'moi'),
  'u-zoe': wirePerson('u-zoe', 'Zoé Martin', 'zoe'),
  'u-ada': wirePerson('u-ada', 'Ada Lovelace', 'ada'),
  'u-emile': wirePerson('u-emile', 'Émile Durand', 'emile'),
  'u-kwame': wirePerson('u-kwame', null, 'kwame'),
};

const person = (id: keyof typeof PEOPLE): PersonSummary => decodePerson(PEOPLE[id]) as PersonSummary;

const ids = (people: readonly PersonSummary[]) => people.map((p) => p.id);

describe('les amis qu’une nouvelle conversation propose', () => {
  test('rend l’AUTRE personne de chaque amitié, que le lecteur ait envoyé ou reçu la demande', () => {
    const accepted = [friendship(ME, 'u-zoe', PEOPLE), friendship('u-ada', ME, PEOPLE)];
    expect(ids(friendsOf({ accepted, viewerId: ME }))).toEqual(['u-ada', 'u-zoe']);
  });

  test('le lecteur n’est jamais proposé, et une amitié en double ne donne qu’une ligne', () => {
    const accepted = [friendship(ME, 'u-zoe', PEOPLE), friendship('u-zoe', ME, PEOPLE), friendship(ME, ME, PEOPLE)];
    expect(ids(friendsOf({ accepted, viewerId: ME }))).toEqual(['u-zoe']);
  });

  test('une amitié dont la personne n’a pas été servie est écartée, jamais rendue sans nom', () => {
    const accepted = [friendship(ME, 'u-zoe', { ...PEOPLE, 'u-zoe': undefined }), friendship(ME, 'u-ada', PEOPLE)];
    expect(ids(friendsOf({ accepted, viewerId: ME }))).toEqual(['u-ada']);
  });

  test('les amis se rangent par nom affiché, accents et casse ignorés, l’identifiant faute de nom', () => {
    const accepted = ['u-zoe', 'u-emile', 'u-kwame', 'u-ada'].map((id) => friendship(ME, id, PEOPLE));
    expect(ids(friendsOf({ accepted, viewerId: ME }))).toEqual(['u-ada', 'u-emile', 'u-kwame', 'u-zoe']);
  });

  test('sans lecteur connu, rien n’est proposé : impossible de savoir qui est l’autre', () => {
    expect(friendsOf({ accepted: [friendship(ME, 'u-zoe', PEOPLE)], viewerId: null })).toEqual([]);
  });
});

describe('ce que l’écran propose pendant la frappe', () => {
  const friends = [person('u-ada'), person('u-emile'), person('u-zoe')];

  test('sans frappe : tous les amis, et aucune autre personne', () => {
    const view = candidatesFor({ friends, query: '', searchResults: [person('u-kwame')], viewerId: ME });
    expect(ids(view.friends)).toEqual(['u-ada', 'u-emile', 'u-zoe']);
    expect(view.others).toEqual([]);
  });

  test('la frappe filtre les amis par nom ou par identifiant, accents et casse ignorés', () => {
    expect(ids(candidatesFor({ friends, query: 'emi', searchResults: undefined, viewerId: ME }).friends)).toEqual(['u-emile']);
    expect(ids(candidatesFor({ friends, query: 'ÉMILE', searchResults: undefined, viewerId: ME }).friends)).toEqual(['u-emile']);
    expect(ids(candidatesFor({ friends, query: 'zoe', searchResults: undefined, viewerId: ME }).friends)).toEqual(['u-zoe']);
  });

  test('la recherche globale n’ajoute que des personnes qui ne sont ni des amis ni le lecteur', () => {
    const view = candidatesFor({
      friends,
      query: 'ma',
      searchResults: [person('u-zoe'), person(ME), person('u-kwame')],
      viewerId: ME,
    });
    expect(ids(view.others)).toEqual(['u-kwame']);
  });

  test('une recherche encore absente ne retire rien aux amis déjà filtrés', () => {
    const view = candidatesFor({ friends, query: 'ada', searchResults: undefined, viewerId: ME });
    expect(ids(view.friends)).toEqual(['u-ada']);
    expect(view.others).toEqual([]);
  });
});

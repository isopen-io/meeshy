import { describe, expect, test } from 'bun:test';

import type { CallHistoryPage, CallRecord } from '@/lib/api/calls';

import { callDisplayNameOf, callDurationLabel, callFilterFromSearch, callParticipantNames, searchCallRecords, seededCallHistory } from './view';

/**
 * LES RÈGLES PURES DU JOURNAL D'APPELS (#6362) — miroir des accesseurs de
 * `APICallRecord` (`CallModels.swift`) : durée, nom affiché, filtre servi.
 */

const record = (overrides: Partial<CallRecord> = {}): CallRecord => ({
  callId: 'a1',
  conversationId: 'c-amina',
  conversationType: 'direct',
  conversationTitle: null,
  conversationAvatar: null,
  direction: 'incoming',
  isVideo: false,
  startedAt: '2026-09-13T09:00:00.000Z',
  durationSec: 185,
  bytes: null,
  peer: { userId: 'u-amina', username: 'amina', displayName: 'Amina Diallo', avatar: null },
  participants: [],
  ...overrides,
});

const cached = (pages: readonly CallHistoryPage[]) => ({ pages: [...pages], pageParams: pages.map(() => null) });

describe('la durée d’un appel', () => {
  test('M:SS sous l’heure, H:MM:SS au-delà, et rien pour un appel sans durée', () => {
    expect(callDurationLabel(0)).toBe('');
    expect(callDurationLabel(59)).toBe('0:59');
    expect(callDurationLabel(185)).toBe('3:05');
    expect(callDurationLabel(3725)).toBe('1:02:05');
  });
});

describe('le nom affiché', () => {
  test('nom du pair, puis son identifiant, puis le titre du groupe, puis « inconnu »', () => {
    expect(callDisplayNameOf(record(), 'Inconnu')).toBe('Amina Diallo');
    expect(callDisplayNameOf(record({ peer: { userId: 'u', username: 'amina', displayName: null, avatar: null } }), 'Inconnu')).toBe('amina');
    expect(callDisplayNameOf(record({ peer: null, conversationTitle: 'Équipe' }), 'Inconnu')).toBe('Équipe');
    expect(callDisplayNameOf(record({ peer: null }), 'Inconnu')).toBe('Inconnu');
  });
});

describe('le filtre vit dans l’adresse', () => {
  test('« missed » est reconnu ; toute autre valeur rend « tous »', () => {
    expect(callFilterFromSearch('missed')).toBe('missed');
    expect(callFilterFromSearch(null)).toBe('all');
    expect(callFilterFromSearch('manques')).toBe('all');
  });
});

describe('« Manqués » se peint depuis « Tous » déjà en cache', () => {
  test('seuls les appels manqués de la liste complète, sans page suivante', () => {
    const seeded = seededCallHistory(
      cached([{ records: [record({ callId: 'a', direction: 'missed' }), record({ callId: 'b' }), record({ callId: 'c', direction: 'missed' })], nextCursor: null }]),
      'missed',
    );
    expect(seeded?.pages.flatMap((page) => page.records.map((r) => r.callId))).toEqual(['a', 'c']);
    expect(seeded?.pages.at(-1)?.nextCursor).toBeNull();
  });

  test('« Tous » n’a rien à emprunter, et un cache vide laisse le squelette', () => {
    expect(seededCallHistory(cached([{ records: [record()], nextCursor: null }]), 'all')).toBeUndefined();
    expect(seededCallHistory(undefined, 'missed')).toBeUndefined();
  });

  test('aucun manqué dans une liste COMPLÈTE : le vide est juste ; dans une liste tronquée, il mentirait', () => {
    expect(seededCallHistory(cached([{ records: [record()], nextCursor: null }]), 'missed')?.pages[0]?.records).toEqual([]);
    expect(seededCallHistory(cached([{ records: [record()], nextCursor: 'a1' }]), 'missed')).toBeUndefined();
  });
});

describe('chercher dans le journal (#8066)', () => {
  const journal = [
    record({ callId: 'a1' }),
    record({ callId: 'b2', peer: { userId: 'u-eloi', username: 'eloi_b', displayName: 'Éloi Bâ', avatar: null } }),
    record({ callId: 'g3', peer: null, conversationType: 'group', conversationTitle: 'Équipe produit' }),
    record({ callId: 'x4', peer: null, conversationTitle: null }),
  ];
  const found = (query: string) => searchCallRecords(journal, query, 'Inconnu').map((r) => r.callId);

  test('une recherche vide ou blanche rend le journal tel quel', () => {
    expect(found('')).toEqual(['a1', 'b2', 'g3', 'x4']);
    expect(found('   ')).toEqual(['a1', 'b2', 'g3', 'x4']);
  });

  test('sans accents ni casse : « eloi » trouve « Éloi », « EQUIPE » trouve « Équipe »', () => {
    expect(found('eloi')).toEqual(['b2']);
    expect(found('EQUIPE')).toEqual(['g3']);
  });

  test('l’identifiant du pair compte aussi, pas seulement le nom affiché', () => {
    expect(found('eloi_b')).toEqual(['b2']);
  });

  test('le NOM AFFICHÉ se cherche, repli compris', () => {
    expect(found('inconnu')).toEqual(['x4']);
    expect(found('zzz')).toEqual([]);
  });
});

describe('les participants d’un appel de groupe (#8066)', () => {
  const people = ['Ada', 'Bruno', 'Chloé', 'Dia'].map((displayName, index) => ({
    participantId: `p${index}`,
    username: displayName.toLowerCase(),
    displayName,
    avatar: null,
  }));
  const group = record({ callId: 'g1', peer: null, conversationType: 'group', conversationTitle: 'Équipe', participants: people });

  test('la ligne en nomme quelques-uns et compte les autres', () => {
    expect(callParticipantNames(group, 2)).toEqual({ names: ['Ada', 'Bruno'], more: 2 });
    expect(callParticipantNames(group, 5)).toEqual({ names: ['Ada', 'Bruno', 'Chloé', 'Dia'], more: 0 });
  });

  test('un appel direct ne nomme personne de plus que son pair', () => {
    expect(callParticipantNames(record(), 2)).toEqual({ names: [], more: 0 });
  });

  test('chercher un participant trouve l’appel de groupe où il était', () => {
    expect(searchCallRecords([record(), group], 'chloe', 'Inconnu').map((r) => r.callId)).toEqual(['g1']);
    expect(searchCallRecords([record(), group], 'BRUNO', 'Inconnu').map((r) => r.callId)).toEqual(['g1']);
  });
});

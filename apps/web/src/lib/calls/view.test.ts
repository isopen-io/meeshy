import { describe, expect, test } from 'bun:test';

import type { CallHistoryPage, CallRecord } from '@/lib/api/calls';

import { callDisplayNameOf, callDurationLabel, callFilterFromSearch, seededCallHistory } from './view';

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
  peer: { userId: 'u-amina', username: 'amina', displayName: 'Amina Diallo', avatar: null },
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

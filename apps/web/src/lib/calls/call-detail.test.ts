import { describe, expect, test } from 'bun:test';

import type { CallSession } from '@/lib/api/call-sessions';
import type { CallRecord } from '@/lib/api/calls';

import { callAbsoluteDate, callDataLabel, callDetailFromRecord, callDetailFromSession, deepLinkPlan, findCachedRecord } from './call-detail';

/**
 * LA FICHE D'UN APPEL (#6383) — miroir de `CallDetailSheet.swift` : nom,
 * direction, type, date ABSOLUE, durée, données. Le numéro du pair n'y est
 * PAS (décision prudente, D-127) : aucun type de ce module ne le porte.
 */

const record = (overrides: Partial<CallRecord> = {}): CallRecord => ({
  callId: 'call-1',
  conversationId: 'c-1',
  conversationType: 'direct',
  conversationTitle: null,
  conversationAvatar: null,
  direction: 'outgoing',
  isVideo: true,
  startedAt: '2026-09-13T09:00:00.000Z',
  durationSec: 754,
  bytes: 48_620_000,
  peer: { userId: 'u-kwame', username: 'kwame', displayName: 'Kwame Mensah', avatar: 'k.jpg' },
  ...overrides,
});

const session = (overrides: Partial<CallSession> = {}): CallSession => ({
  callId: 'call-2',
  conversationId: 'c-2',
  media: 'audio',
  live: false,
  initiatorId: 'u-ada',
  answered: true,
  startedAt: '2026-09-13T09:00:00.000Z',
  durationSec: 60,
  participants: [
    { userId: 'u-ada', name: 'Ada', avatar: 'a.jpg' },
    { userId: 'u-me', name: 'Moi', avatar: null },
  ],
  ...overrides,
});

describe('une fiche depuis le journal en cache', () => {
  test('reprend le nom, la direction, le type, la durée et les données de la ligne', () => {
    expect(callDetailFromRecord(record(), 'Inconnu')).toEqual({
      callId: 'call-1',
      conversationId: 'c-1',
      name: 'Kwame Mensah',
      avatar: 'k.jpg',
      direction: 'outgoing',
      media: 'video',
      startedAt: '2026-09-13T09:00:00.000Z',
      durationSec: 754,
      bytes: 48_620_000,
      isGroup: false,
      live: false,
    });
  });

  test('aucune clé ne porte un numéro de téléphone', () => {
    const detail = callDetailFromRecord(record(), 'Inconnu');
    expect(Object.keys(detail).some((key) => /phone/i.test(key))).toBe(false);
  });

  test('un appel de groupe se nomme par sa conversation', () => {
    expect(callDetailFromRecord(record({ peer: null, conversationType: 'group', conversationTitle: 'Équipe' }), 'Inconnu')).toMatchObject({ name: 'Équipe', isGroup: true });
  });

  test('le journal en cache se lit sur ses deux filtres', () => {
    const cached = (records: readonly CallRecord[]) => ({ pages: [{ records, nextCursor: null }], pageParams: [null] });
    expect(findCachedRecord([cached([record({ callId: 'a' })]), cached([record({ callId: 'b' })])], 'b')?.callId).toBe('b');
    expect(findCachedRecord([undefined, cached([])], 'b')).toBeNull();
  });
});

describe('une fiche depuis la passerelle (lien profond sans cache)', () => {
  test('j’ai lancé l’appel : émis, vers l’autre participant', () => {
    expect(callDetailFromSession(session({ initiatorId: 'u-me' }), { viewerId: 'u-me', unknown: 'Inconnu' })).toMatchObject({
      direction: 'outgoing',
      name: 'Ada',
      avatar: 'a.jpg',
      isGroup: false,
      bytes: null,
    });
  });

  test('on m’a appelé et j’ai répondu : reçu ; sans réponse : manqué', () => {
    expect(callDetailFromSession(session(), { viewerId: 'u-me', unknown: 'Inconnu' }).direction).toBe('incoming');
    expect(callDetailFromSession(session({ answered: false }), { viewerId: 'u-me', unknown: 'Inconnu' }).direction).toBe('missed');
  });

  test('l’identité connue de la conversation passe avant la liste des participants', () => {
    const identity = { title: 'Famille', avatar: 'f.jpg', isGroup: true };
    expect(callDetailFromSession(session(), { viewerId: 'u-me', unknown: 'Inconnu', identity })).toMatchObject({ name: 'Famille', avatar: 'f.jpg', isGroup: true });
  });

  test('personne d’autre que moi : le repli', () => {
    expect(callDetailFromSession(session({ participants: [] }), { viewerId: 'u-me', unknown: 'Inconnu' }).name).toBe('Inconnu');
  });
});

describe('ce que le lien profond `/call/:callId` fait', () => {
  test('un appel vivant se REJOINT ; un appel fini se LIT ; rien : introuvable', () => {
    expect(deepLinkPlan(session({ live: true }))).toBe('join');
    expect(deepLinkPlan(session())).toBe('detail');
    expect(deepLinkPlan(null)).toBe('not-found');
  });
});

describe('les valeurs de la fiche, dans la langue de l’interface', () => {
  test('les données échangées suivent les unités de la langue ; rien sans mesure', () => {
    expect(callDataLabel(48_620_000, 'fr')).toBe('46 Mo');
    expect(callDataLabel(2_310_000, 'fr')).toBe('2,2 Mo');
    expect(callDataLabel(48_620_000, 'en')).toBe('46 MB');
    expect(callDataLabel(null, 'fr')).toBeNull();
  });

  test('la date est ABSOLUE — jour et heure — et localisée', () => {
    const fr = callAbsoluteDate('2026-09-13T09:05:00.000Z', 'fr', 'UTC');
    expect(fr).toContain('13');
    expect(fr).toContain('09:05');
    expect(callAbsoluteDate('2026-09-13T09:05:00.000Z', 'en', 'UTC')).toContain('Sep');
    expect(callAbsoluteDate(null, 'fr', 'UTC')).toBe('');
  });
});

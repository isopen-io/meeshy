import { beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { callNoticeTarget, callParticipantsLine, decodeCallParticipants } from './call-notice';

/**
 * LA CARTE D'APPEL NOMME SES PARTICIPANTS (#17868, A1.2) — miroir de `CallSummaryMetadata.participantsLine`
 * (iOS) et de `FocalCallParticipants` (Android), mêmes vecteurs : les autres, dans l'ordre servi, puis « vous »
 * en dernier si le lecteur a pris part ; jamais son propre nom ; aucune ligne sans autre nom.
 */

beforeAll(async () => {
  await Promise.all(['fr', 'en', 'es', 'de', 'ar'].map((language) => loadInterfaceCatalog(language as 'fr')));
});

const team = [
  { userId: 'u_awa', displayName: 'Awa' },
  { userId: 'u_me', displayName: 'Charles' },
  { userId: 'u_karim', displayName: 'Karim' },
  { userId: 'u_lina', displayName: 'Lina' },
];

const line = (participants: ReturnType<typeof decodeCallParticipants>, viewerId: string, language = 'fr') => callParticipantsLine({ participants, viewerId, language });

const callMessage = (participants?: unknown) => ({
  conversationId: 'c1',
  metadata: { kind: 'call', callId: 'c1', callType: 'audio', outcome: 'completed', durationSeconds: 42, ...(participants === undefined ? {} : { participants }) },
});

describe('la ligne des participants', () => {
  test('les pairs d’abord puis « vous », jamais son propre nom', () => {
    expect(line(team, 'u_me')).toBe('Awa, Karim, Lina et vous');
  });

  test('la ligne se résout par lecteur, depuis le même message', () => {
    expect(line(team, 'u_awa')).toBe('Charles, Karim, Lina et vous');
  });

  test('un duo se lit en deux noms', () => {
    expect(line([team[0], team[1]], 'u_me')).toBe('Awa et vous');
  });

  test('un lecteur qui n’a pas pris part n’est pas ajouté', () => {
    expect(line([team[0], team[2]], 'u_me')).toBe('Awa et Karim');
  });

  test('un identifiant de lecteur vide n’est jamais « vous »', () => {
    expect(line(team, '')).toBe('Awa, Charles, Karim et Lina');
  });

  test('aucune ligne quand aucun autre nom n’est servi', () => {
    expect(line(null, 'u_me')).toBeNull();
    expect(line([], 'u_me')).toBeNull();
    expect(line([team[1]], 'u_me')).toBeNull();
    expect(line([{ userId: 'u_x', displayName: '  ' }, team[1]], 'u_me')).toBeNull();
  });

  test('les noms servis sont rognés', () => {
    expect(line([{ userId: 'u_x', displayName: '  Awa ' }, team[1]], 'u_me')).toBe('Awa et vous');
  });

  test('le « vous » est celui de la langue du lecteur, la conjonction aussi', () => {
    expect(line([team[0], team[1]], 'u_me', 'en')).toBe('Awa and you');
    expect(line([team[0], team[1]], 'u_me', 'es')).toBe('Awa y tú');
    expect(line([team[0], team[1]], 'u_me', 'de')).toBe('Awa und du');
    expect(line([team[0], team[1]], 'u_me', 'ar')).toContain('أنت');
  });
});

describe('le décodeur de participants du résumé', () => {
  test('il lit les participants servis', () => {
    expect(decodeCallParticipants([{ userId: 'u_awa', displayName: 'Awa' }])).toEqual([{ userId: 'u_awa', displayName: 'Awa' }]);
  });

  test('clé absente ou malformée ⇒ aucune liste, jamais d’exception', () => {
    for (const raw of [undefined, null, 'Awa', 42, {}, [{ userId: 'u_awa' }], ['x'], [{ userId: 7, displayName: null }], [team[0], { userId: 'u_y' }]]) {
      expect(decodeCallParticipants(raw)).toBeNull();
    }
  });

  test('la cible de la carte porte les participants et le lecteur', () => {
    const target = callNoticeTarget(callMessage(team), 'u_me');
    expect(target?.participants).toEqual(team);
    expect(target?.viewerId).toBe('u_me');
  });

  test('une clé malformée ne fait jamais échouer la cible', () => {
    const target = callNoticeTarget(callMessage('Awa'), 'u_me');
    expect(target).not.toBeNull();
    expect(target?.callId).toBe('c1');
    expect(target?.participants).toBeNull();
  });
});

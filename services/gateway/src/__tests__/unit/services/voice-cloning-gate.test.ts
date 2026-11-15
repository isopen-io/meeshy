/**
 * Aucun chemin du serveur n'envoie `generateVoiceClone: true` au translator sans
 * que chaque voix en jeu ait consenti ET 18 ans révolus (#17309). La porte passe
 * par le vrai `ConsentValidationService` ; seule la base est doublée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { voiceCloningAllowedFor, gatedVoiceClone, userIdOfParticipant } from '../../../services/voice-cloning-gate';

const CONSENTED = new Date('2026-01-01T00:00:00.000Z');
const ADULT = new Date('1990-06-15T00:00:00.000Z');
const MINOR = new Date(Date.UTC(new Date().getUTCFullYear() - 12, 0, 1));

type Row = { birthDate: Date | null; voiceCloningEnabledAt?: Date | null };

function makePrisma(users: Record<string, Row>, participants: Record<string, string | null> = {}) {
  return {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = users[where.id];
        if (!row) return null;
        return {
          dataProcessingConsentAt: CONSENTED,
          analyticsConsentAt: null,
          voiceDataConsentAt: CONSENTED,
          voiceProfileConsentAt: CONSENTED,
          voiceCloningEnabledAt: row.voiceCloningEnabledAt === undefined ? CONSENTED : row.voiceCloningEnabledAt,
          birthDate: row.birthDate,
        };
      }),
    },
    userPreferences: { findUnique: jest.fn(async () => null) },
    participant: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id in participants ? { userId: participants[where.id] } : null),
    },
  } as never;
}

describe('voiceCloningAllowedFor (#17309)', () => {
  it('ouvre à un adulte qui a consenti', async () => {
    expect(await voiceCloningAllowedFor(makePrisma({ a: { birthDate: ADULT } }), ['a'])).toBe(true);
  });

  it('ferme à un mineur, même consentant', async () => {
    expect(await voiceCloningAllowedFor(makePrisma({ m: { birthDate: MINOR } }), ['m'])).toBe(false);
  });

  it('ferme sans date de naissance', async () => {
    expect(await voiceCloningAllowedFor(makePrisma({ n: { birthDate: null } }), ['n'])).toBe(false);
  });

  it('ferme à un adulte sans consentement au clonage', async () => {
    const prisma = makePrisma({ a: { birthDate: ADULT, voiceCloningEnabledAt: null } });
    expect(await voiceCloningAllowedFor(prisma, ['a'])).toBe(false);
  });

  it('ferme dès qu’UNE des voix en jeu n’y a pas droit', async () => {
    const prisma = makePrisma({ a: { birthDate: ADULT }, m: { birthDate: MINOR } });
    expect(await voiceCloningAllowedFor(prisma, ['a', 'm'])).toBe(false);
  });

  it('ferme sans identité, ou sur un compte introuvable', async () => {
    const prisma = makePrisma({ a: { birthDate: ADULT } });
    expect(await voiceCloningAllowedFor(prisma, [])).toBe(false);
    expect(await voiceCloningAllowedFor(prisma, ['a', null])).toBe(false);
    expect(await voiceCloningAllowedFor(prisma, ['ghost'])).toBe(false);
  });
});

describe('gatedVoiceClone (#17309)', () => {
  it('un clone laissé au défaut n’est servi qu’à une voix admise', async () => {
    const prisma = makePrisma({ a: { birthDate: ADULT }, m: { birthDate: MINOR } });
    expect(await gatedVoiceClone(prisma, { requested: undefined, voiceOwnerUserIds: ['a'] })).toBe(true);
    expect(await gatedVoiceClone(prisma, { requested: undefined, voiceOwnerUserIds: ['m'] })).toBe(false);
  });

  it('un clone refusé par l’appelant reste refusé, sans lecture', async () => {
    const prisma = makePrisma({ a: { birthDate: ADULT } });
    expect(await gatedVoiceClone(prisma, { requested: false, voiceOwnerUserIds: ['a'] })).toBe(false);
    expect((prisma as unknown as { user: { findUnique: jest.Mock } }).user.findUnique).not.toHaveBeenCalled();
  });
});

describe('userIdOfParticipant', () => {
  it('rend le compte derrière un participant, null pour un invité ou un inconnu', async () => {
    const prisma = makePrisma({}, { p1: 'u1', guest: null });
    expect(await userIdOfParticipant(prisma, 'p1')).toBe('u1');
    expect(await userIdOfParticipant(prisma, 'guest')).toBeNull();
    expect(await userIdOfParticipant(prisma, 'nope')).toBeNull();
    expect(await userIdOfParticipant(prisma, null)).toBeNull();
  });
});

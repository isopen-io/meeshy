/**
 * #14107 (PRE-07) — « Ne pas déranger » se voit dès Connaissance : le lecteur
 * apprend que la personne est indisponible, jamais sa fenêtre ni ses jours.
 * Sous Connaissance, bloqué, ou présence masquée par la cible : `false`, comme
 * pour quelqu'un qui n'est pas en Ne pas déranger — rien ne se distingue.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { servedDoNotDisturb } from '../../../../services/relations/doNotDisturbVisibility';
import { ADULT_BIRTH, messagingWorld, table } from '../../../helpers/messaging-circle-world';

const LECTEUR = '6500000000000000000000a1';
const CONNAISSANCE_EN_DND = '6500000000000000000000a2';
const INCONNU_EN_DND = '6500000000000000000000a3';
const CONNAISSANCE_DISPONIBLE = '6500000000000000000000a4';
const CONNAISSANCE_DISCRETE = '6500000000000000000000a5';

const NOW = new Date('2026-11-02T23:30:00.000Z');
const DND_NIGHT = { dndEnabled: true, dndStartTime: '22:00', dndEndTime: '08:00', dndDays: [], dndUtcOffsetMinutes: 0 };

function monde() {
  const world = messagingWorld({
    links: [
      [LECTEUR, CONNAISSANCE_EN_DND, 'ACQUAINTANCE'],
      [LECTEUR, CONNAISSANCE_DISPONIBLE, 'ACQUAINTANCE'],
      [LECTEUR, CONNAISSANCE_DISCRETE, 'FRIEND'],
    ],
    users: [LECTEUR, CONNAISSANCE_EN_DND, INCONNU_EN_DND, CONNAISSANCE_DISPONIBLE, CONNAISSANCE_DISCRETE].map((id) => ({ id, birthDate: ADULT_BIRTH })),
  });
  const userPreferences = table([
    { userId: CONNAISSANCE_EN_DND, notification: DND_NIGHT, privacy: { showOnlineStatus: true } },
    { userId: INCONNU_EN_DND, notification: DND_NIGHT, privacy: { showOnlineStatus: true } },
    { userId: CONNAISSANCE_DISPONIBLE, notification: { dndEnabled: false }, privacy: { showOnlineStatus: true } },
    { userId: CONNAISSANCE_DISCRETE, notification: DND_NIGHT, privacy: { showOnlineStatus: false } },
  ]);
  return { ...world.prisma, userPreferences } as unknown as PrismaClient;
}

describe('servedDoNotDisturb', () => {
  it('une Connaissance en Ne pas déranger se voit indisponible', async () => {
    const served = await servedDoNotDisturb(monde(), { viewerId: LECTEUR, targetIds: [CONNAISSANCE_EN_DND], now: NOW });
    expect(served.get(CONNAISSANCE_EN_DND)).toBe(true);
  });

  it('un inconnu en Ne pas déranger se sert comme quelqu\'un de disponible', async () => {
    const served = await servedDoNotDisturb(monde(), { viewerId: LECTEUR, targetIds: [INCONNU_EN_DND], now: NOW });
    expect(served.get(INCONNU_EN_DND)).toBe(false);
  });

  it('hors de la fenêtre, personne n\'est indisponible', async () => {
    const served = await servedDoNotDisturb(monde(), { viewerId: LECTEUR, targetIds: [CONNAISSANCE_EN_DND, CONNAISSANCE_DISPONIBLE], now: new Date('2026-11-02T12:00:00.000Z') });
    expect([...served.values()]).toEqual([false, false]);
  });

  it('une cible qui masque sa présence masque aussi son Ne pas déranger', async () => {
    const served = await servedDoNotDisturb(monde(), { viewerId: LECTEUR, targetIds: [CONNAISSANCE_DISCRETE], now: NOW });
    expect(served.get(CONNAISSANCE_DISCRETE)).toBe(false);
  });

  it('un lecteur sans compte ne voit rien, sans aucune lecture', async () => {
    const served = await servedDoNotDisturb(monde(), { viewerId: null, targetIds: [CONNAISSANCE_EN_DND], now: NOW });
    expect(served.get(CONNAISSANCE_EN_DND)).toBe(false);
  });
});

/**
 * #14110 (MIN-04) — un signalement qui implique un mineur déclaré, une position
 * ou un lien Sang passe en tête de la file de modération.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { assessReportPriority } from '../../../../services/reports/reportPriority';
import { ADULT_BIRTH, MINOR_BIRTH, messagingWorld, table } from '../../../helpers/messaging-circle-world';

const SIGNALANT = '6a00000000000000000000a1';
const ADULTE = '6a00000000000000000000a2';
const MINEUR = '6a00000000000000000000a3';
const SANG = '6a00000000000000000000a4';
const MSG_POSITION = '6a00000000000000000000b1';
const MSG_TEXTE = '6a00000000000000000000b2';
const NOW = new Date('2026-11-02T12:00:00.000Z');

function monde(): PrismaClient {
  const world = messagingWorld({
    links: [[SIGNALANT, SANG, 'BLOOD']],
    users: [
      { id: SIGNALANT, birthDate: ADULT_BIRTH },
      { id: ADULTE, birthDate: ADULT_BIRTH },
      { id: MINEUR, birthDate: MINOR_BIRTH },
      { id: SANG, birthDate: ADULT_BIRTH },
    ],
    participants: [
      { id: 'p-adulte', userId: ADULTE },
      { id: 'p-mineur', userId: MINEUR },
    ],
  });
  const message = table([
    { id: MSG_POSITION, senderId: 'p-adulte', messageType: 'location' },
    { id: MSG_TEXTE, senderId: 'p-adulte', messageType: 'text' },
  ]);
  return { ...world.prisma, message, post: table([]), postComment: table([]), sound: table([]) } as unknown as PrismaClient;
}

const assess = (reportedType: string, reportedEntityId: string, reporterId: string | null = SIGNALANT) =>
  assessReportPriority(monde(), { reportedType, reportedEntityId, reporterId, now: NOW });

describe('assessReportPriority', () => {
  it('un signalement ordinaire reste en file', async () => {
    await expect(assess('user', ADULTE)).resolves.toEqual({ priority: 0, priorityReasons: [] });
  });

  it('un mineur signalé passe en tête', async () => {
    await expect(assess('user', MINEUR)).resolves.toEqual({ priority: 1, priorityReasons: ['minor'] });
  });

  it('un mineur qui signale passe en tête', async () => {
    await expect(assess('user', ADULTE, MINEUR)).resolves.toEqual({ priority: 1, priorityReasons: ['minor'] });
  });

  it('une position signalée passe en tête', async () => {
    await expect(assess('message', MSG_POSITION)).resolves.toEqual({ priority: 1, priorityReasons: ['location'] });
    await expect(assess('message', MSG_TEXTE)).resolves.toEqual({ priority: 0, priorityReasons: [] });
  });

  it('un lien Sang entre le signalant et le signalé passe en tête', async () => {
    await expect(assess('user', SANG)).resolves.toEqual({ priority: 1, priorityReasons: ['blood'] });
  });

  it('un signalant anonyme ne casse rien', async () => {
    await expect(assess('user', MINEUR, null)).resolves.toEqual({ priority: 1, priorityReasons: ['minor'] });
  });
});

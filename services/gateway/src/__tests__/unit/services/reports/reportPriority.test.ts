/**
 * #14110 (MIN-04) — un signalement qui implique un mineur déclaré, une position
 * ou un lien Sang passe en tête de la file de modération.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

const warn = jest.fn();
jest.mock('../../../../utils/logger', () => ({ logger: { warn: (...a: unknown[]) => warn(...a), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { assessReportPriority, minorBirthDateFloor } from '../../../../services/reports/reportPriority';
import { declaredAgeClass } from '@meeshy/shared/utils/age';
import { ADULT_BIRTH, MINOR_BIRTH, messagingWorld, table, type Row } from '../../../helpers/messaging-circle-world';

const SIGNALANT = '6a00000000000000000000a1';
const ADULTE = '6a00000000000000000000a2';
const MINEUR = '6a00000000000000000000a3';
const SANG = '6a00000000000000000000a4';
const MSG_POSITION = '6a00000000000000000000b1';
const MSG_TEXTE = '6a00000000000000000000b2';
const NOW = new Date('2026-11-02T12:00:00.000Z');
const GROUPE = '6a00000000000000000000c1';
const MSG_GROUPE = '6a00000000000000000000b3';
const ANCIEN_SANG = '6a00000000000000000000a5';
const DAYS = 86_400_000;
const SALON = '6a00000000000000000000c2';
const MSG_SALON = '6a00000000000000000000b4';

function monde(extra: { links?: readonly Row[]; signalantBloque?: readonly string[]; salonType?: string } = {}): PrismaClient {
  const world = messagingWorld({
    links: [[SIGNALANT, SANG, 'BLOOD']],
    users: [
      { id: SIGNALANT, birthDate: ADULT_BIRTH, blockedUserIds: [...(extra.signalantBloque ?? [])] },
      { id: ANCIEN_SANG, birthDate: ADULT_BIRTH },
      { id: ADULTE, birthDate: ADULT_BIRTH },
      { id: MINEUR, birthDate: MINOR_BIRTH },
      { id: SANG, birthDate: ADULT_BIRTH },
    ],
    participants: [
      { id: 'p-adulte', userId: ADULTE },
      { id: 'p-mineur', userId: MINEUR },
      { id: 'g-adulte', userId: ADULTE, conversationId: GROUPE, isActive: true },
      { id: 'g-signalant', userId: SIGNALANT, conversationId: GROUPE, isActive: true },
      { id: 'g-mineur', userId: MINEUR, conversationId: GROUPE, isActive: true },
      { id: 's-adulte', userId: ADULTE, conversationId: SALON, isActive: true },
      { id: 's-mineur', userId: MINEUR, conversationId: SALON, isActive: true },
    ],
  });
  for (const link of extra.links ?? []) void world.relations.prisma.userRelation.create({ data: link } as never);
  const message = table([
    { id: MSG_POSITION, senderId: 'p-adulte', messageType: 'location' },
    { id: MSG_TEXTE, senderId: 'p-adulte', messageType: 'text' },
    { id: MSG_GROUPE, senderId: 'g-adulte', messageType: 'text', conversationId: GROUPE },
    { id: MSG_SALON, senderId: 's-adulte', messageType: 'text', conversationId: SALON },
  ]);
  const conversation = table([{ id: GROUPE, type: 'group' }, { id: SALON, type: extra.salonType ?? 'direct' }]);
  const floorOf = (where: { user?: { is?: { birthDate?: { gte?: Date } } } }) => where.user?.is?.birthDate?.gte ?? new Date(0);
  const participant = {
    ...world.participant,
    count: async ({ where }: { where: { conversationId: string; isActive: boolean; user?: { is?: { birthDate?: { gte?: Date } } } } }) =>
      world.participant.rows.filter((p) => p.conversationId === where.conversationId && p.isActive === where.isActive)
        .filter((p) => { const birth = world.users.rows.find((u) => u.id === p.userId)?.birthDate as Date | null | undefined; return birth instanceof Date && birth >= floorOf(where); }).length,
  };
  return { ...world.prisma, participant, message, conversation, post: table([]), postComment: table([]), sound: table([]) } as unknown as PrismaClient;
}

const assess = (reportedType: string, reportedEntityId: string, reporterId: string | null = SIGNALANT, prisma: PrismaClient = monde()) =>
  assessReportPriority(prisma, { reportedType, reportedEntityId, reporterId, now: NOW });

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

  it('un message adressé à un mineur dans un groupe passe en tête, même signalé par un majeur sur un auteur majeur (audit M2)', async () => {
    await expect(assess('message', MSG_GROUPE)).resolves.toEqual({ priority: 1, priorityReasons: ['minor'] });
  });

  it('une conversation dont un membre est mineur passe en tête (audit M2)', async () => {
    await expect(assess('conversation', GROUPE)).resolves.toEqual({ priority: 1, priorityReasons: ['minor'] });
  });

  it('le Sang se lit sur le lien enregistré : bloquer avant de signaler ne l\'efface pas (audit M3)', async () => {
    await expect(assess('user', SANG, SIGNALANT, monde({ signalantBloque: [SANG] }))).resolves.toEqual({ priority: 1, priorityReasons: ['blood'] });
  });

  it('un lien quitté le Sang depuis moins de trente jours qualifie encore ; au-delà, non (audit M3)', async () => {
    const [low, high] = [SIGNALANT, ANCIEN_SANG].sort();
    const baisse = (daysAgo: number): Row => ({ id: 'ab-ancien', userLowId: low, userHighId: high, grantedByLow: 'CLOSE', grantedByHigh: 'CLOSE',
      transitions: [{ actorId: SIGNALANT, from: 'BLOOD', to: 'CLOSE', at: new Date(NOW.getTime() - daysAgo * DAYS) }] });
    await expect(assess('user', ANCIEN_SANG, SIGNALANT, monde({ links: [baisse(5)] }))).resolves.toEqual({ priority: 1, priorityReasons: ['blood'] });
    await expect(assess('user', ANCIEN_SANG, SIGNALANT, monde({ links: [baisse(45)] }))).resolves.toEqual({ priority: 0, priorityReasons: [] });
  });

  it('une lecture qui échoue retombe à l\'ordinaire ET le dit au journal, sans rien d\'identifiant (audit m1)', async () => {
    const enPanne = { user: { findMany: async () => { throw new Error('db down'); } } } as unknown as PrismaClient;
    await expect(assess('user', MINEUR, SIGNALANT, enPanne)).resolves.toEqual({ priority: 0, priorityReasons: [] });
    expect(warn).toHaveBeenCalledWith(expect.any(String), { reportedType: 'user' });
  });

  it.each(['global', 'public', 'broadcast'])('l\'audience d\'un salon %s ne se compte pas, ni par son message ni par le salon lui-même (#14627, audit 3 M2)', async (salonType) => {
    const prisma = monde({ salonType });
    await expect(assess('message', MSG_SALON, SIGNALANT, prisma)).resolves.toEqual({ priority: 0, priorityReasons: [] });
    await expect(assess('conversation', SALON, SIGNALANT, prisma)).resolves.toEqual({ priority: 0, priorityReasons: [] });
  });

  it('dans un salon global, un signalant mineur garde la priorité (#14627)', async () => {
    await expect(assess('message', MSG_SALON, MINEUR, monde({ salonType: 'global' }))).resolves.toEqual({ priority: 1, priorityReasons: ['minor'] });
  });

  it.each(['direct', 'group'])('l\'audience d\'une conversation %s se compte toujours (#14627)', async (salonType) => {
    await expect(assess('message', MSG_SALON, SIGNALANT, monde({ salonType }))).resolves.toEqual({ priority: 1, priorityReasons: ['minor'] });
  });

  it('la frontière du count d\'audience est celle de declaredAgeClass, chaque jour de quatre ans, 29 février compris (#14627, audit 3 m1)', () => {
    const start = Date.UTC(2023, 0, 1);
    const days = Array.from({ length: 4 * 366 }, (_, i) => new Date(start + i * DAYS + 12 * 3_600_000));
    const disagreements = days.flatMap((now) => {
      const floor = minorBirthDateFloor(now).getTime();
      return [-2, -1, 0, 1, 2].map((offset) => new Date(floor + offset * DAYS))
        .filter((birth) => (birth.getTime() >= floor) !== (declaredAgeClass(birth, now) === 'minor'))
        .map((birth) => `${now.toISOString().slice(0, 10)} / ${birth.toISOString().slice(0, 10)}`);
    });
    expect(disagreements).toEqual([]);
  });

  it('la frontière du count d\'audience est celle de declaredAgeClass : 18 ans le jour même (contre-audit N4)', () => {
    const floor = minorBirthDateFloor(NOW);
    const births = ['2008-11-01', '2008-11-02', '2008-11-03', '2008-11-04'].map((d) => new Date(`${d}T00:00:00.000Z`));
    expect(births.map((b) => b >= floor)).toEqual(births.map((b) => declaredAgeClass(b, NOW) === 'minor'));
    expect(births.map((b) => b >= floor)).toEqual([false, false, true, true]);
  });
});

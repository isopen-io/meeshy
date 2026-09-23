import { describe, it, expect, jest } from '@jest/globals';
import { loadListEphemeralExpiries } from '../list-ephemeral-expiry';

const INTERNAL_DESTRUCTION = new Date('2026-09-30T12:00:00Z');
const BOB_DEADLINE = new Date('2026-09-23T12:04:00Z');
const CAROL_DEADLINE = new Date('2026-09-23T12:06:00Z');

const makePrisma = () => ({
  messageStatusEntry: {
    findMany: jest.fn(async (_args: unknown) => [
      { messageId: 'm-eph', participantId: 'p-bob', ephemeralExpiresAt: BOB_DEADLINE },
      { messageId: 'm-eph', participantId: 'p-carol', ephemeralExpiresAt: CAROL_DEADLINE },
    ]),
  },
});

const rows = [
  { conversationId: 'c-eph', message: { id: 'm-eph', senderId: 'p-alice', ephemeralDuration: 240, expiresAt: INTERNAL_DESTRUCTION } },
  { conversationId: 'c-plain', message: { id: 'm-plain', senderId: 'p-alice', ephemeralDuration: null, expiresAt: null } },
];

describe('loadListEphemeralExpiries (#7451 × #7545)', () => {
  it('un destinataire reçoit SA propre échéance, jamais la colonne interne de destruction', async () => {
    const served = await loadListEphemeralExpiries(makePrisma() as never, rows, () => 'p-bob');
    expect(served.get('m-eph')).toEqual(BOB_DEADLINE);
  });

  it("l'expéditeur reçoit la plus tardive des échéances de ses destinataires", async () => {
    const served = await loadListEphemeralExpiries(makePrisma() as never, rows, () => 'p-alice');
    expect(served.get('m-eph')).toEqual(CAROL_DEADLINE);
  });

  it("un lecteur qui n'a pas encore reçu n'a pas d'échéance", async () => {
    const served = await loadListEphemeralExpiries(makePrisma() as never, rows, () => 'p-dave');
    expect(served.get('m-eph')).toBeNull();
  });

  it("aucune lecture pour une page sans éphémère", async () => {
    const prisma = makePrisma();
    const served = await loadListEphemeralExpiries(prisma as never, [rows[1]], () => 'p-bob');
    expect(prisma.messageStatusEntry.findMany).not.toHaveBeenCalled();
    expect(served.has('m-plain')).toBe(false);
  });
});

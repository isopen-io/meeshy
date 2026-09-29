import { describe, it, expect, jest } from '@jest/globals';
import { loadListEphemeralExpiries, loadListInheritedExpiries } from '../list-ephemeral-expiry';
import { resolvePreviewProtection } from '../last-message-nature';

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

/**
 * #8630 — le dernier message d'une ligne est une RÉPONSE à une flamme-œil que
 * ce lecteur a consommée : la réponse est morte pour lui, et l'aperçu le dit
 * (« expiré ») au lieu de republier son texte.
 */
describe('loadListInheritedExpiries (#8630)', () => {
  const CONSUMED = new Date('2026-09-29T10:00:00Z');
  const prisma = () => ({
    message: {
      findMany: jest.fn(async ({ where }: any) =>
        where?.id?.in?.includes('m-flamme')
          ? [{ id: 'm-flamme', replyToId: null, senderId: 'p-alice', ephemeralDuration: null, effectFlags: 9, expiresAt: null }]
          : [],
      ),
    },
    messageStatusEntry: {
      findMany: jest.fn(async () => [{ messageId: 'm-flamme', participantId: 'p-bob', ephemeralExpiresAt: CONSUMED }]),
    },
  });
  const replyRows = [{ conversationId: 'c-1', message: { id: 'm-reply', replyToId: 'm-flamme', senderId: 'p-carol' } }];

  it('sert au lecteur échu la mort de ce que le dernier message cite', async () => {
    const inherited = await loadListInheritedExpiries(prisma() as never, replyRows, () => 'p-bob');
    expect(inherited.get('m-reply')).toEqual(CONSUMED);
  });

  it("ne sert rien à qui n'a pas consommé la flamme-œil", async () => {
    const inherited = await loadListInheritedExpiries(prisma() as never, replyRows, () => 'p-dave');
    expect(inherited.has('m-reply')).toBe(false);
  });

  it("l'aperçu d'une réponse non éphémère passe à « expiré » quand ce qu'elle cite est mort", () => {
    const after = new Date(CONSUMED.getTime() + 1000);
    expect(resolvePreviewProtection({ quotedDeathAt: CONSUMED }, after)).toBe('expired');
    expect(resolvePreviewProtection({ quotedDeathAt: null }, after)).toBeNull();
  });
});

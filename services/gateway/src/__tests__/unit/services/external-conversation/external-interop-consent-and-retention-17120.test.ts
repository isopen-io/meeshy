/**
 * #17120 (chantier #17007) — la conformité de l'interopérabilité WhatsApp,
 * côté passerelle :
 *  - aucune conversation externe ne s'ouvre sans un consentement ENREGISTRÉ
 *    sous la version EN VIGUEUR de l'information sur ce qui part chez Meta ;
 *  - la durée de conservation du numéro de l'ami vient d'UNE configuration,
 *    bornée, et une tâche planifiée efface les adresses échues (le filet de
 *    l'index TTL, qui n'existe que si la migration nommée a tourné).
 *
 * Aucune donnée personnelle réelle : numéros fictifs de la plage de fiction.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXTERNAL_PEER_HANDLE_RETENTION_DAYS,
  EXTERNAL_PEER_HANDLE_RETENTION_MAX_DAYS,
} from '@meeshy/shared/types/external-conversation';
import { EXTERNAL_INTEROP_NOTICE_VERSION } from '@meeshy/shared/types/external-interop-compliance';
import { openExternalConversation } from '../../../../services/external-conversation/open-external-conversation';
import {
  EXTERNAL_PEER_RETENTION_ENV,
  externalPeerRetentionDays,
  purgeExpiredExternalPeers,
} from '../../../../services/external-conversation/peer-retention';

const ALICE = '507f1f77bcf86cd799439a01';
const CONVERSATION = '507f1f77bcf86cd799439c01';
const FRIEND = '+33612345678';
const NOW = new Date('2026-11-10T09:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

type Consent = { readonly at: Date | null; readonly version: string | null };

const prismaFor = (consent: Consent) => {
  const created: Array<{ data: { externalPeer: { create: { purgeAfter: Date } } } }> = [];
  return {
    created,
    prisma: {
      user: {
        findUnique: jest.fn(async () => ({
          id: ALICE,
          phoneVerifiedAt: new Date('2026-10-01T00:00:00Z'),
          role: 'ANALYST',
          displayName: 'Alice',
          username: 'alice',
          whatsappInteropConsentAt: consent.at,
          whatsappInteropNoticeVersion: consent.version,
        })),
      },
      externalConversationPeer: {
        findUnique: jest.fn(async () => null),
        update: jest.fn(async () => ({ id: 'peer-0' })),
        deleteMany: jest.fn(async () => ({ count: 0 })),
        count: jest.fn(async () => 0),
      },
      conversation: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async (args: { data: { id: string; externalPeer: { create: { purgeAfter: Date } } } }) => {
          created.push(args);
          return { id: args.data.id };
        }),
      },
    },
  };
};

const regime = { newConversationId: () => CONVERSATION, now: () => NOW, serverKeyIdFor: async () => 'never' };

const open = (consent: Consent, retentionDays?: number) => {
  const world = prismaFor(consent);
  const opening = openExternalConversation(
    { prisma: world.prisma as never, regime, ...(retentionDays === undefined ? {} : { retentionDays }) },
    { userId: ALICE, network: 'whatsapp', handle: FRIEND },
  );
  return { world, opening };
};

const CURRENT: Consent = { at: new Date('2026-11-09T00:00:00Z'), version: EXTERNAL_INTEROP_NOTICE_VERSION };

describe('ouvrir une conversation externe exige le consentement enregistré (#17120)', () => {
  it('sans consentement : refus consent-required, rien n’est créé', async () => {
    const { world, opening } = open({ at: null, version: null });

    await expect(opening).resolves.toEqual({ kind: 'refused', refusal: 'consent-required' });
    expect(world.created).toHaveLength(0);
  });

  it('un consentement donné sous une information PÉRIMÉE ne vaut pas : refus consent-required', async () => {
    const { world, opening } = open({ at: new Date('2026-11-01T00:00:00Z'), version: '2026-01-01' });

    await expect(opening).resolves.toEqual({ kind: 'refused', refusal: 'consent-required' });
    expect(world.created).toHaveLength(0);
  });

  it('un consentement sans date (retiré) ne vaut pas, même sous la bonne version', async () => {
    const { opening } = open({ at: null, version: EXTERNAL_INTEROP_NOTICE_VERSION });

    await expect(opening).resolves.toEqual({ kind: 'refused', refusal: 'consent-required' });
  });

  it('consentement sous la version en vigueur : la conversation s’ouvre', async () => {
    const { world, opening } = open(CURRENT);

    await expect(opening).resolves.toMatchObject({ kind: 'opened', created: true, conversationId: CONVERSATION });
    expect(world.created).toHaveLength(1);
  });
});

describe('la durée de conservation du numéro vient d’UNE configuration (#17120)', () => {
  it('l’échéance posée à l’ouverture suit la durée configurée', async () => {
    const { opening } = open(CURRENT, 30);

    const result = await opening;
    expect(result).toMatchObject({ kind: 'opened' });
    expect((result as { purgeAfter: Date }).purgeAfter.getTime()).toBe(NOW.getTime() + 30 * DAY_MS);
  });

  it('sans configuration, la durée provisoire partagée s’applique', async () => {
    const { world, opening } = open(CURRENT);

    await opening;
    expect(world.created[0].data.externalPeer.create.purgeAfter.getTime()).toBe(
      NOW.getTime() + EXTERNAL_PEER_HANDLE_RETENTION_DAYS * DAY_MS,
    );
  });

  it.each([
    [undefined, EXTERNAL_PEER_HANDLE_RETENTION_DAYS],
    ['30', 30],
    ['1', 1],
    [String(EXTERNAL_PEER_HANDLE_RETENTION_MAX_DAYS), EXTERNAL_PEER_HANDLE_RETENTION_MAX_DAYS],
    ['9999', EXTERNAL_PEER_HANDLE_RETENTION_MAX_DAYS],
    ['0', EXTERNAL_PEER_HANDLE_RETENTION_DAYS],
    ['-5', EXTERNAL_PEER_HANDLE_RETENTION_DAYS],
    ['30.5', EXTERNAL_PEER_HANDLE_RETENTION_DAYS],
    ['trente', EXTERNAL_PEER_HANDLE_RETENTION_DAYS],
    ['', EXTERNAL_PEER_HANDLE_RETENTION_DAYS],
  ])('%s ⇒ %d jours (jamais au-delà de la borne dure)', (raw, expected) => {
    expect(externalPeerRetentionDays({ [EXTERNAL_PEER_RETENTION_ENV]: raw })).toBe(expected);
  });
});

describe('la tâche planifiée efface les adresses échues (#17120)', () => {
  it('efface exactement les adresses dont l’échéance est passée, et rend leur nombre', async () => {
    const deleteMany = jest.fn(async (_args: unknown) => ({ count: 3 }));

    const purged = await purgeExpiredExternalPeers({ externalConversationPeer: { deleteMany } } as never, NOW);

    expect(purged).toBe(3);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { purgeAfter: { lte: NOW } } });
  });

  it('est armée par le gestionnaire des tâches de fond, à intervalle régulier, là seulement où le drapeau l’admet (jamais en production)', () => {
    const jobs = readFileSync(join(__dirname, '../../../../jobs/index.ts'), 'utf8');

    expect(jobs).toContain('purgeExpiredExternalPeers(');
    expect(jobs).toMatch(/name: 'external-peer-retention-sweep'/);
    expect(jobs).toMatch(/if \(externalConversationsEnabled\(process\.env\)\) \{\s*balayerLesNumerosEchus\(\);/);
  });
});

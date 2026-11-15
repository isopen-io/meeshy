/**
 * `admitLinkEntry` — la loi d'admission UNIQUE d'un lien de partage (#4167).
 *
 * Chaque témoin porte les DEUX identités quand la règle doit s'appliquer aux
 * deux : c'est le point même de #4167 — une loi écrite à deux endroits est une
 * loi dont la version la plus permissive décide.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  admitLinkEntry,
  type LinkAdmissionShareLink,
  type LinkAdmissionIdentity,
} from '../../../../services/conversations/linkAdmission';
import type { ConversationEntryReader } from '../../../../services/conversations/conversationEntryAdmission';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const LINK_ID = '507f1f77bcf86cd799439099';

const OPEN_CONVERSATION = { isActive: true, closedAt: null };
const GUEST: LinkAdmissionIdentity = { kind: 'guest' };
const REGISTERED: LinkAdmissionIdentity = { kind: 'registered', userId: USER_ID };
const HERE = { ip: '203.0.113.10' };

/** Un lien sans AUCUNE restriction — chaque témoin surcharge ce qu'il teste. */
const openLink = (overrides: Partial<LinkAdmissionShareLink> = {}): LinkAdmissionShareLink => ({
  id: LINK_ID,
  conversationId: CONV_ID,
  isActive: true,
  expiresAt: null,
  maxUses: null,
  currentUses: 0,
  maxConcurrentUsers: null,
  currentConcurrentUsers: 0,
  maxUniqueSessions: null,
  currentUniqueSessions: 0,
  allowedIpRanges: [],
  requireAccount: false,
  ...overrides,
});

/**
 * Double structural de `resolveConversationEntry` : `findMany` rend les
 * lignes fournies, et compte ses appels — un invité ne doit JAMAIS
 * l'atteindre (aucun `User.id` à chercher).
 */
function readerOf(rows: Array<{ id: string; isActive?: boolean | null; bannedAt?: Date | null; joinedAt?: Date | null }>): ConversationEntryReader & { findManyCalls: number } {
  const reader = {
    findManyCalls: 0,
    participant: {
      findMany: jest.fn(async () => {
        reader.findManyCalls += 1;
        return rows;
      }) as unknown as ConversationEntryReader['participant']['findMany'],
    },
  };
  return reader;
}

describe.each([
  ['invité', GUEST],
  ['inscrit', REGISTERED],
])('admitLinkEntry — %s', (_label, identity) => {
  it('refuse 410 LINK_EXPIRED quand le lien est inactif', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([]),
      link: openLink({ isActive: false }),
      conversation: OPEN_CONVERSATION,
      identity,
      request: HERE,
    });
    expect(verdict).toEqual({ granted: false, status: 410, code: 'LINK_EXPIRED', message: expect.any(String) });
  });

  it('refuse 410 LINK_EXPIRED quand `expiresAt` est passé', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([]),
      link: openLink({ expiresAt: new Date('2020-01-01') }),
      conversation: OPEN_CONVERSATION,
      identity,
      request: HERE,
    });
    expect(verdict).toEqual({ granted: false, status: 410, code: 'LINK_EXPIRED', message: expect.any(String) });
  });

  it('refuse 410 CONVERSATION_CLOSED quand le fil est terminé, même si le lien est valide', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([]),
      link: openLink(),
      conversation: { isActive: false, closedAt: new Date('2026-01-01') },
      identity,
      request: HERE,
    });
    expect(verdict).toEqual({ granted: false, status: 410, code: 'CONVERSATION_CLOSED', message: expect.any(String) });
  });

  it('refuse 409 LINK_EXHAUSTED quand `maxUses` est atteint', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([]),
      link: openLink({ maxUses: 1, currentUses: 1 }),
      conversation: OPEN_CONVERSATION,
      identity,
      request: HERE,
    });
    expect(verdict).toEqual({ granted: false, status: 409, code: 'LINK_EXHAUSTED', message: expect.any(String) });
  });

  it('refuse 409 LINK_EXHAUSTED quand `maxConcurrentUsers` est atteint', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([]),
      link: openLink({ maxConcurrentUsers: 10, currentConcurrentUsers: 10 }),
      conversation: OPEN_CONVERSATION,
      identity,
      request: HERE,
    });
    expect(verdict).toEqual({ granted: false, status: 409, code: 'LINK_EXHAUSTED', message: expect.any(String) });
  });

  it('refuse 409 LINK_EXHAUSTED quand `maxUniqueSessions` est atteint', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([]),
      link: openLink({ maxUniqueSessions: 3, currentUniqueSessions: 3 }),
      conversation: OPEN_CONVERSATION,
      identity,
      request: HERE,
    });
    expect(verdict).toEqual({ granted: false, status: 409, code: 'LINK_EXHAUSTED', message: expect.any(String) });
  });

  it('refuse 403 REGION_NOT_ALLOWED quand l\'IP n\'est dans aucune plage autorisée', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([]),
      link: openLink({ allowedIpRanges: ['192.168.1.0/24'] }),
      conversation: OPEN_CONVERSATION,
      identity,
      request: { ip: '203.0.113.10' },
    });
    expect(verdict).toEqual({ granted: false, status: 403, code: 'REGION_NOT_ALLOWED', message: expect.any(String) });
  });

  it('admet quand l\'IP tombe dans une plage autorisée', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([]),
      link: openLink({ allowedIpRanges: ['192.168.1.0/24'] }),
      conversation: OPEN_CONVERSATION,
      identity,
      request: { ip: '192.168.1.42' },
    });
    expect(verdict.granted).toBe(true);
  });
});

// `LinkAdmissionShareLink` ne déclare pas `allowedCountries` — le type ne
// permet même pas de le lire (preuve au compilateur, pas au runtime) : c'est
// la décision du 2026-08-29, critère 5 de #4167 (voir le doc-tête du module).
// Un lien qui porte des `allowedCountries` en base continue de les IGNORER.
describe('admitLinkEntry — un lien restreint par pays est admis quand même (allowedCountries non appliqué)', () => {
  it('admet sans jamais regarder un éventuel `allowedCountries` du lien', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([]),
      link: openLink(), // le type n'a pas de champ `allowedCountries` à surcharger
      conversation: OPEN_CONVERSATION,
      identity: GUEST,
      request: HERE,
    });
    expect(verdict.granted).toBe(true);
  });
});

describe('admitLinkEntry — requireAccount ne ferme la porte qu\'à un invité', () => {
  it('refuse 403 ACCOUNT_REQUIRED un invité sur un lien qui exige un compte', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([]),
      link: openLink({ requireAccount: true }),
      conversation: OPEN_CONVERSATION,
      identity: GUEST,
      request: HERE,
    });
    expect(verdict).toEqual({ granted: false, status: 403, code: 'ACCOUNT_REQUIRED', message: expect.any(String) });
  });

  it('admet un inscrit sur le même lien — il a déjà un compte', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([]),
      link: openLink({ requireAccount: true }),
      conversation: OPEN_CONVERSATION,
      identity: REGISTERED,
      request: HERE,
    });
    expect(verdict.granted).toBe(true);
  });
});

describe('admitLinkEntry — invité : toujours `create`, jamais de lecture `Participant`', () => {
  it('rend `{outcome:\'create\'}` sans appeler `resolveConversationEntry`', async () => {
    const reader = readerOf([{ id: 'somebody', isActive: true, bannedAt: null }]);
    const verdict = await admitLinkEntry({
      prisma: reader,
      link: openLink(),
      conversation: OPEN_CONVERSATION,
      identity: GUEST,
      request: HERE,
    });
    expect(verdict).toEqual({ granted: true, entry: { outcome: 'create' } });
    expect(reader.findManyCalls).toBe(0);
  });
});

describe('admitLinkEntry — inscrit : la question passe par `resolveConversationEntry`', () => {
  it('refuse 403 BANNED quand une ligne bannie existe', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([{ id: 'p-banned', isActive: false, bannedAt: new Date('2026-01-01') }]),
      link: openLink(),
      conversation: OPEN_CONVERSATION,
      identity: REGISTERED,
      request: HERE,
    });
    expect(verdict).toEqual({ granted: false, status: 403, code: 'BANNED', message: expect.any(String) });
  });

  it('admet en `already-member` quand une ligne active existe', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([{ id: 'p-active', isActive: true, bannedAt: null }]),
      link: openLink(),
      conversation: OPEN_CONVERSATION,
      identity: REGISTERED,
      request: HERE,
    });
    expect(verdict).toEqual({ granted: true, entry: { outcome: 'already-member', participantId: 'p-active' } });
  });

  it('admet en `rejoin` quand seule une ligne inactive existe', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([{ id: 'p-left', isActive: false, bannedAt: null, joinedAt: new Date('2026-01-01') }]),
      link: openLink(),
      conversation: OPEN_CONVERSATION,
      identity: REGISTERED,
      request: HERE,
    });
    expect(verdict).toEqual({ granted: true, entry: { outcome: 'rejoin', participantId: 'p-left' } });
  });

  it('admet en `create` quand aucune ligne n\'existe', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([]),
      link: openLink(),
      conversation: OPEN_CONVERSATION,
      identity: REGISTERED,
      request: HERE,
    });
    expect(verdict).toEqual({ granted: true, entry: { outcome: 'create' } });
  });
});

// Le bug de tête de #4167 : « un lien à usage unique est réutilisable
// indéfiniment par un compte inscrit ». Posé explicitement côté INSCRIT — la
// porte anonyme le gardait déjà, ce témoin ne prouverait rien posé là.
describe('admitLinkEntry — le bug de tête de #4167', () => {
  it('un lien `maxUses:1, currentUses:1` refuse un INSCRIT distinct (409 LINK_EXHAUSTED)', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([]),
      link: openLink({ maxUses: 1, currentUses: 1 }),
      conversation: OPEN_CONVERSATION,
      identity: REGISTERED,
      request: HERE,
    });
    expect(verdict).toEqual({ granted: false, status: 409, code: 'LINK_EXHAUSTED', message: expect.any(String) });
  });
});

describe('admitLinkEntry — ordre : la clôture prime sur tout ce qui vient après elle', () => {
  it('rend CONVERSATION_CLOSED plutôt que LINK_EXHAUSTED quand les deux sont vrais', async () => {
    const verdict = await admitLinkEntry({
      prisma: readerOf([]),
      link: openLink({ maxUses: 1, currentUses: 1 }),
      conversation: { isActive: false, closedAt: new Date('2026-01-01') },
      identity: REGISTERED,
      request: HERE,
    });
    expect(verdict).toMatchObject({ code: 'CONVERSATION_CLOSED' });
  });
});

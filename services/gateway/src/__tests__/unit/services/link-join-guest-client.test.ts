/**
 * #10102 — le POSTE d'un invité, relevé à son entrée par lien et RÉDUIT : un
 * nom et une version majeure pour le navigateur et le système, la famille
 * d'appareil. Jamais la chaîne User-Agent, ni le modèle, ni le fabricant.
 *
 * Le cœur `performLinkJoin` est exercé tel quel.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

import { performLinkJoin } from '../../../routes/conversations/link-admission';
import { describeGuestClient } from '../../../services/conversations/guestClient';
import { executeurImmediat } from '../../helpers/after-response';

const LINK_ID = 'mshy_link_abc123';
const CONV_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439044';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.90 Safari/537.36';

const shareLinkRow = () => ({
  id: '507f1f77bcf86cd799439011', linkId: LINK_ID, identifier: 'mshy_world',
  conversationId: CONV_ID, isActive: true, expiresAt: null, maxUses: null,
  currentUses: 0, maxConcurrentUsers: null, currentConcurrentUsers: 0,
  maxUniqueSessions: null, currentUniqueSessions: 0,
  requireAccount: false, requireNickname: false, requireEmail: false, requireBirthday: false,
  allowedCountries: [], allowedLanguages: [], allowedIpRanges: [],
  allowAnonymousMessages: true, allowAnonymousFiles: false, allowAnonymousImages: false,
  allowViewHistory: true,
  conversation: { id: CONV_ID, title: 'World Wide', type: 'global', isActive: true, closedAt: null },
});

function fakePrisma() {
  return {
    conversationShareLink: {
      findFirst: jest.fn(async () => shareLinkRow()),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: { findUnique: jest.fn(async () => ({ displayName: 'Ana', username: 'ana' })) },
    participant: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'participant-1', avatar: null, ...data })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'participant-1', ...data })),
    },
    message: { create: jest.fn(async () => ({ id: 'msg-1' })) },
    conversation: { update: jest.fn(async () => ({})) },
  };
}

async function join(params: { readonly userAgent: string | null; readonly registered?: boolean }) {
  const executeur = executeurImmediat();
  const prisma = fakePrisma();
  const outcome = await performLinkJoin({
    prisma: prisma as never,
    key: LINK_ID,
    authContext: params.registered
      ? ({ type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID } as never)
      : undefined,
    requestIp: '203.0.113.7',
    requestUserAgent: params.userAgent,
    profile: { firstName: 'Nova', lastName: '', requestedUsername: 'nova', language: 'pt' },
    afterResponse: executeur.afterResponse,
    lookupCountry: async () => null,
  });
  await executeur.settle();
  const created = prisma.participant.create.mock.calls.map(([arg]) => arg.data);
  const databaseCalls = Object.values(prisma)
    .flatMap((delegate) => Object.values(delegate as Record<string, jest.Mock>))
    .flatMap((method) => method.mock.calls);
  return { outcome, created, databaseCalls };
}

describe('describeGuestClient — le poste réduit', () => {
  it('un iPhone : Safari mobile 17 sur iOS 17, mobile', () => {
    expect(describeGuestClient(IPHONE_UA)).toEqual({
      browser: 'Mobile Safari', browserVersion: '17', os: 'iOS', osVersion: '17', deviceType: 'mobile',
    });
  });

  it('un poste de bureau : Chrome 129 sur Windows 10, desktop', () => {
    expect(describeGuestClient(DESKTOP_UA)).toEqual({
      browser: 'Chrome', browserVersion: '129', os: 'Windows', osVersion: '10', deviceType: 'desktop',
    });
  });

  it('rien à lire ⇒ null', () => {
    expect(describeGuestClient(null)).toBeNull();
    expect(describeGuestClient('')).toBeNull();
  });

  it('une chaîne illisible ne rend que des champs vides, jamais la chaîne', () => {
    const described = describeGuestClient('zzz');
    expect(JSON.stringify(described)).not.toContain('zzz');
  });
});

describe('le poste d’un invité est relevé à son entrée par lien', () => {
  it('la session anonyme porte le poste réduit', async () => {
    const { outcome, created } = await join({ userAgent: IPHONE_UA });

    expect(outcome.kind).toBe('joined');
    expect(created).toHaveLength(1);
    const session = (created[0].anonymousSession as { session: Record<string, unknown> }).session;
    expect(session.client).toEqual({
      browser: 'Mobile Safari', browserVersion: '17', os: 'iOS', osVersion: '17', deviceType: 'mobile',
    });
  });

  it('la chaîne User-Agent brute n’est écrite nulle part', async () => {
    const { databaseCalls } = await join({ userAgent: IPHONE_UA });

    expect(databaseCalls.length).toBeGreaterThan(0);
    expect(JSON.stringify(databaseCalls)).not.toContain('AppleWebKit');
    expect(JSON.stringify(databaseCalls)).not.toContain('17_4_1');
  });

  it('sans User-Agent : aucun poste, et l’entrée réussit', async () => {
    const { outcome, created } = await join({ userAgent: null });

    expect(outcome.kind).toBe('joined');
    const session = (created[0].anonymousSession as { session: Record<string, unknown> }).session;
    expect(session.client).toBeNull();
  });

  it('un compte n’a pas de session anonyme : rien n’est relevé sur sa participation', async () => {
    const { created } = await join({ userAgent: IPHONE_UA, registered: true });

    expect(JSON.stringify(created)).not.toContain('Mobile Safari');
  });
});

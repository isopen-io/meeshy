/**
 * Le PAYS d'une arrivée par lien d'invitation (#7797) — dérivé de l'IP de la
 * requête de jointure, enregistré sur le participant, jamais l'IP elle-même.
 *
 * Le cœur `performLinkJoin` est exercé tel quel, pour les deux identités
 * (invité et compte) : la loi d'admission, la création du participant et le
 * message système sont les vrais.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

import { performLinkJoin } from '../../../routes/conversations/link-admission';
import { arrivalCountryFromGeo } from '../../../services/conversations/arrivalCountry';
import { executeurImmediat } from '../../helpers/after-response';

const LINK_ID = 'mshy_link_abc123';
const SHARE_LINK_DB_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439044';
const ARRIVAL_IP = '203.0.113.7';

const shareLinkRow = () => ({
  id: SHARE_LINK_DB_ID, linkId: LINK_ID, identifier: 'invitation',
  conversationId: CONV_ID, isActive: true, expiresAt: null, maxUses: null,
  currentUses: 0, maxConcurrentUsers: null, currentConcurrentUsers: 0,
  maxUniqueSessions: null, currentUniqueSessions: 0,
  requireAccount: false, requireNickname: false, requireEmail: false, requireBirthday: false,
  allowedCountries: [], allowedLanguages: [], allowedIpRanges: [],
  allowAnonymousMessages: true, allowAnonymousFiles: false, allowAnonymousImages: true,
  allowViewHistory: true,
  conversation: { id: CONV_ID, title: 'Équipe', type: 'group', isActive: true, closedAt: null },
});

function fakePrisma(options: { readonly existingMembership?: { id: string; isActive: boolean } } = {}) {
  const participantUpdate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'participant-1', avatar: null, ...data }));
  const prisma = {
    conversationShareLink: {
      findFirst: jest.fn(async () => shareLinkRow()),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: { findUnique: jest.fn(async () => ({ displayName: 'Ana', username: 'ana' })) },
    participant: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => (options.existingMembership ? { id: options.existingMembership.id, avatar: null, permissions: {} } : null)),
      findMany: jest.fn(async () => (options.existingMembership
        ? [{ id: options.existingMembership.id, isActive: options.existingMembership.isActive, bannedAt: null, leftAt: null, userId: USER_ID }]
        : [])),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'participant-1', avatar: null, ...data })),
      update: participantUpdate,
    },
    message: { create: jest.fn(async () => ({ id: 'msg-1' })) },
    conversation: { update: jest.fn(async () => ({})) },
  };
  return { prisma, participantUpdate };
}

const guestProfile = { firstName: 'Nova', lastName: '', requestedUsername: 'nova', language: 'fr' };

async function join(params: {
  readonly registered?: boolean;
  readonly country?: string | null;
  readonly existingMembership?: { id: string; isActive: boolean };
}) {
  const executeur = executeurImmediat();
  const { prisma, participantUpdate } = fakePrisma({ existingMembership: params.existingMembership });
  const lookupCountry = jest.fn(async (_ip: string): Promise<string | null> => params.country ?? null);
  const outcome = await performLinkJoin({
    prisma: prisma as never,
    key: LINK_ID,
    authContext: params.registered
      ? ({ type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID } as never)
      : undefined,
    requestIp: ARRIVAL_IP,
    profile: guestProfile,
    afterResponse: executeur.afterResponse,
    lookupCountry,
  });
  await executeur.settle();
  const countryWrites = participantUpdate.mock.calls
    .map(([arg]) => arg)
    .filter((arg) => 'joinCountry' in arg.data);
  return { outcome, lookupCountry, countryWrites, labels: executeur.labels };
}

describe('pays d’une arrivée par lien d’invitation', () => {
  it('un invité : le pays de son IP est enregistré sur son participant', async () => {
    const { outcome, lookupCountry, countryWrites } = await join({ country: 'FR' });

    expect(outcome.kind).toBe('joined');
    expect(lookupCountry).toHaveBeenCalledWith(ARRIVAL_IP);
    expect(countryWrites).toEqual([{ where: { id: 'participant-1' }, data: { joinCountry: 'FR' } }]);
  });

  it('un compte : le pays de son IP est enregistré aussi', async () => {
    const { outcome, countryWrites } = await join({ registered: true, country: 'SN' });

    expect(outcome.kind).toBe('joined');
    expect(countryWrites).toEqual([{ where: { id: 'participant-1' }, data: { joinCountry: 'SN' } }]);
  });

  it('l’IP elle-même n’est jamais écrite sur le participant', async () => {
    const { countryWrites } = await join({ country: 'FR' });

    expect(JSON.stringify(countryWrites)).not.toContain(ARRIVAL_IP);
  });

  it('la géolocalisation part APRÈS la réponse — jamais sur le chemin de la jointure', async () => {
    const { labels } = await join({ country: 'FR' });

    expect(labels).toContain('link-arrival-country');
  });

  it('un pays inconnu n’écrit rien', async () => {
    const { countryWrites } = await join({ country: null });

    expect(countryWrites).toEqual([]);
  });

  it('un compte déjà membre n’est pas une arrivée : rien n’est géolocalisé', async () => {
    const { outcome, lookupCountry } = await join({ registered: true, country: 'FR', existingMembership: { id: 'participant-9', isActive: true } });

    expect(outcome).toMatchObject({ kind: 'joined', outcome: 'already-member' });
    expect(lookupCountry).not.toHaveBeenCalled();
  });
});

describe('pays servi depuis la géolocalisation', () => {
  it.each([
    ['fr', 'FR'],
    [' us ', 'US'],
    ['FRA', null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('« %s » devient %s', (country, expected) => {
    expect(arrivalCountryFromGeo(country === undefined ? null : { country })).toBe(expected);
  });
});

/**
 * Rejoindre par lien met les sockets DÉJÀ CONNECTÉES du compte dans la room de
 * la conversation.
 *
 * `message:new` part sur la room de conversation SEULE
 * (`socketio/messageNewEmission.ts` : `io.to(room).except([...])`) ; les rooms
 * personnelles n'y servent que l'expéditeur et les lecteurs masqués. Un compte
 * dont la socket vivait déjà au moment de la jointure n'était donc dans AUCUNE
 * audience du fil qu'il venait de rejoindre — et pour toute la durée de cette
 * socket, puisque les rooms de participation ne se rejoignent qu'à
 * l'authentification (`AuthHandler._joinUserConversations`).
 *
 * Il était dans l'état que `AuthHandler` nomme lui-même le pire : « this
 * recipient now looks online but is absent from these rooms — a message sent to
 * them lands nowhere (no live emit, no offline enqueue) » — `connectedUsers` le
 * dit joignable, donc tout expéditeur SAUTE la file hors ligne pour lui.
 *
 * La porte DÉPRÉCIÉE (`POST /conversations/join/:linkId`) faisait le geste
 * depuis le 2026-08-30, sous le commentaire « mirrors POST
 * /conversations/:id/participants » ; la porte CANONIQUE
 * (`POST /links/:key/members`), celle que le web appelle, ne l'avait jamais eu.
 * Les deux appellent le MÊME `performLinkJoin` : la loi vit désormais là, et
 * aucune troisième porte ne peut l'oublier.
 *
 * Un INVITÉ n'est pas concerné : il n'a pas de socket au moment où il rejoint
 * (son jeton de session naît de cette réponse), et celle qu'il ouvrira ensuite
 * rejoindra ses rooms à son authentification.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join as join_ } from 'path';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

import { performLinkJoin } from '../../../routes/conversations/link-admission';
import { executeurImmediat } from '../../helpers/after-response';

const LINK_ID = 'mshy_link_room01';
const SHARE_LINK_DB_ID = '507f1f77bcf86cd799439111';
const CONV_ID = '507f1f77bcf86cd799439122';
const USER_ID = '507f1f77bcf86cd799439144';

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
  return {
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
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'participant-1', avatar: null, ...data })),
    },
    message: { create: jest.fn(async () => ({ id: 'msg-1' })) },
    conversation: { update: jest.fn(async () => ({})) },
  };
}

type RoomJoin = { readonly userId: string; readonly conversationId: string };

async function join(params: {
  readonly registered?: boolean;
  readonly rooms?: boolean;
  readonly throws?: boolean;
  readonly existingMembership?: { id: string; isActive: boolean };
}) {
  const executeur = executeurImmediat();
  const joined: RoomJoin[] = [];
  const outcome = await performLinkJoin({
    prisma: fakePrisma({ existingMembership: params.existingMembership }) as never,
    key: LINK_ID,
    authContext: params.registered
      ? ({ type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID } as never)
      : undefined,
    requestIp: '203.0.113.9',
    profile: { firstName: 'Nova', lastName: '', requestedUsername: 'nova', language: 'fr' },
    afterResponse: executeur.afterResponse,
    lookupCountry: async () => null,
    ...(params.rooms === false
      ? {}
      : {
          arrivalRooms: {
            joinUserToConversationRoom: async (userId: string, conversationId: string) => {
              if (params.throws) throw new Error('adapter down');
              joined.push({ userId, conversationId });
            },
          },
        }),
  });
  await executeur.settle();
  return { outcome, joined };
}

describe('la jointure par lien admet le compte dans la room du fil', () => {
  it('un COMPTE qui rejoint : ses sockets vivantes entrent dans la room de la conversation', async () => {
    const { outcome, joined } = await join({ registered: true });

    expect(outcome.kind).toBe('joined');
    expect(joined).toEqual([{ userId: USER_ID, conversationId: CONV_ID }]);
  });

  it('un INVITÉ : rien à joindre — sa socket naît APRÈS cette réponse', async () => {
    const { outcome, joined } = await join({});

    expect(outcome.kind).toBe('joined');
    expect(joined).toEqual([]);
  });

  it('« déjà membre » ne rejoint rien : ses rooms ont été prises à son authentification', async () => {
    const { outcome, joined } = await join({
      registered: true,
      existingMembership: { id: 'participant-1', isActive: true },
    });

    expect(outcome.kind).toBe('joined');
    expect(joined).toEqual([]);
  });

  it('un adaptateur en panne ne fait pas échouer la jointure, déjà persistée', async () => {
    const { outcome, joined } = await join({ registered: true, throws: true });

    expect(outcome.kind).toBe('joined');
    expect(joined).toEqual([]);
  });

  it('aucune capacité de room fournie : la jointure aboutit quand même', async () => {
    const { outcome } = await join({ registered: true, rooms: false });
    expect(outcome.kind).toBe('joined');
  });
});

describe('la loi vit dans le cœur partagé, plus chez une seule porte', () => {
  const read = (path: string) => readFileSync(join_(__dirname, '..', '..', '..', path), 'utf8');

  it('les DEUX portes passent leur capacité de room au cœur', () => {
    for (const door of ['routes/conversations/link-admission.ts', 'routes/conversations/sharing.ts']) {
      expect(read(door)).toContain('arrivalRooms');
    }
  });

  it('la porte dépréciée n’en garde plus de copie locale', () => {
    // Un deuxième exemplaire de la règle est exactement ce qui a laissé la
    // porte canonique sans elle pendant toute sa vie.
    expect(read('routes/conversations/sharing.ts')).not.toContain('joinUserToConversationRoom(');
  });
});

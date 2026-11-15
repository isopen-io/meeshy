/**
 * #14107 (MSG-05, RG-22) — « en train d'écrire » n'atteint que les membres
 * inscrits au moins CONNAISSANCE de celui qui écrit, dans un tête-à-tête comme
 * dans un groupe : un groupe ne débloque rien. Le blocage reste exclu. Un invité
 * de lien (sans compte) garde la règle d'avant : il n'a pas de cercle.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { StatusHandler, type StatusHandlerDependencies } from '../../../socketio/handlers/StatusHandler';
import { ADULT_BIRTH, messagingWorld, type CircleLink } from '../../helpers/messaging-circle-world';

const CONV = 'cccccc000000000000000099';
const TYPER = '6400000000000000000000a1';
const CONNAISSANCE = '6400000000000000000000a2';
const INCONNU = '6400000000000000000000a3';
const AMI_BLOQUEUR = '6400000000000000000000a4';
const SOCKET = 'socket-typer';

const socketsOf: Record<string, string> = { [CONNAISSANCE]: 's-connaissance', [INCONNU]: 's-inconnu', [AMI_BLOQUEUR]: 's-bloqueur' };

function setup(options: { anonymousTyper?: boolean; links?: readonly CircleLink[] } = {}) {
  const members = [TYPER, CONNAISSANCE, INCONNU, AMI_BLOQUEUR];
  const world = messagingWorld({
    links: options.links ?? [
      [TYPER, CONNAISSANCE, 'ACQUAINTANCE'],
      [TYPER, AMI_BLOQUEUR, 'FRIEND'],
    ],
    users: members.map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      username: id,
      displayName: id,
      blockedUserIds: id === AMI_BLOQUEUR ? [TYPER] : [],
    })),
    participants: members
      .filter((id) => !(options.anonymousTyper && id === TYPER))
      .map((id, index) => ({ id: `p${index}`, conversationId: CONV, userId: id, isActive: true })),
  });
  const prisma = {
    ...world.prisma,
    conversation: {
      findUnique: jest.fn(async () => ({ id: CONV, identifier: 'grp', encryptionMode: null })),
    },
    participant: {
      ...world.prisma.participant,
      findFirst: jest.fn(async () => ({ id: 'p-typer', displayName: 'Typer', nickname: null, isActive: true, bannedAt: null })),
      findUnique: jest.fn(async () => ({ id: TYPER, displayName: 'Invité', nickname: null })),
    },
  };
  const excepted: string[][] = [];
  const emitted: string[] = [];
  const socket = {
    id: SOCKET,
    to: jest.fn(() => ({
      emit: (event: string) => emitted.push(event),
      except: (ids: string[]) => {
        excepted.push(ids);
        return { emit: (event: string) => emitted.push(event) };
      },
    })),
  };
  const deps: StatusHandlerDependencies = {
    prisma: prisma as never,
    statusService: { updateLastSeen: jest.fn() } as never,
    privacyPreferencesService: { shouldShowTypingIndicator: jest.fn(async () => true) } as never,
    connectedUsers: new Map(members.map((id) => [id, { id, isAnonymous: id === TYPER && Boolean(options.anonymousTyper), language: 'fr' }])) as never,
    socketToUser: new Map([[SOCKET, TYPER]]),
    userSockets: new Map(Object.entries(socketsOf).map(([id, s]) => [id, new Set([s])])),
  };
  return { handler: new StatusHandler(deps), socket, excepted, emitted };
}

describe('typing:start — la frappe suit le cercle (#14107)', () => {
  it('exclut l\'inconnu et le bloqueur, garde la Connaissance', async () => {
    const { handler, socket, excepted, emitted } = setup();
    await handler.handleTypingStart(socket as never, { conversationId: CONV });
    expect(emitted).toEqual(['typing:start']);
    expect([...(excepted[0] ?? [])].sort()).toEqual(['s-bloqueur', 's-inconnu']);
  });

  it('personne n\'est exclu quand tous sont au moins Connaissance', async () => {
    const { handler, socket, excepted } = setup({
      links: [
        [TYPER, CONNAISSANCE, 'ACQUAINTANCE'],
        [TYPER, INCONNU, 'CLOSE'],
      ],
    });
    await handler.handleTypingStart(socket as never, { conversationId: CONV });
    expect(excepted).toEqual([['s-bloqueur']]);
  });

  it('un invité de lien qui écrit garde la règle d\'avant : seul le blocage l\'exclut', async () => {
    const { handler, socket, excepted, emitted } = setup({ anonymousTyper: true });
    await handler.handleTypingStart(socket as never, { conversationId: CONV });
    expect(emitted).toEqual(['typing:start']);
    expect(excepted).toEqual([['s-bloqueur']]);
  });
});

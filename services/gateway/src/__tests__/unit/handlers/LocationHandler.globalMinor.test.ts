/**
 * Un mineur lit Global sans pouvoir y écrire (#9927) — et partager sa position
 * EN DIRECT est y écrire : l'épingle apparaît à tout le salon.
 *
 * Le départ (`location:live-start`) refuse ; une mise à jour d'une session que
 * le registre ne connaît pas (redémarrage de la passerelle, ou client qui
 * n'a jamais démarré) n'est relayée qu'après la même vérification. Une
 * session CONNUE a déjà passé la garde au départ : ses mises à jour ne
 * coûtent aucune lecture.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { LocationHandler } from '../../../socketio/handlers/LocationHandler';
import type { SocketUser } from '../../../socketio/utils/socket-helpers';

const USER_ID = 'user-teen';
const SOCKET_ID = 'socket-teen';
const CONVERSATION_ID = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-10-10T12:00:00.000Z');

function setup(params: { readonly type: string; readonly birthDate: Date | null }) {
  const account: { birthDate: Date | null } = { birthDate: params.birthDate };
  const prisma = {
    participant: { findFirst: jest.fn(async () => ({ id: 'participant-teen' })) },
    conversation: { findUnique: jest.fn(async () => ({ isActive: true, closedAt: null, type: params.type })) },
    user: { findUnique: jest.fn(async () => ({ birthDate: account.birthDate })) },
  };
  const user: SocketUser = {
    id: USER_ID,
    socketId: SOCKET_ID,
    isAnonymous: false,
    language: 'fr',
    resolvedLanguages: [],
    userId: USER_ID,
    displayName: 'Teen',
  };
  const ioEmit = jest.fn();
  const handler = new LocationHandler({
    io: { to: jest.fn(() => ({ emit: ioEmit })) } as never,
    prisma: prisma as never,
    connectedUsers: new Map([[USER_ID, user]]),
    socketToUser: new Map([[SOCKET_ID, USER_ID]]),
    normalizeConversationId: async (id: string) => id,
    engagement: null,
    now: () => NOW,
  });
  const emit = jest.fn();
  const socket = { id: SOCKET_ID, to: jest.fn(() => ({ emit })), emit: jest.fn() };
  return { handler, prisma, socket, emit, account, ioEmit };
}

const start = { conversationId: CONVERSATION_ID, latitude: 48.85, longitude: 2.35, durationMinutes: 15 };
const update = { conversationId: CONVERSATION_ID, latitude: 48.86, longitude: 2.36 };

describe('LocationHandler — la position partagée d’un mineur ne paraît pas dans Global (#9927)', () => {
  it('refuse le départ d’un partage en direct, avec le code GLOBAL_ADULTS_ONLY', async () => {
    const { handler, socket, emit } = setup({ type: 'global', birthDate: new Date('2010-06-01T00:00:00.000Z') });
    const callback = jest.fn();

    await handler.handleLiveLocationStart(socket as never, start as never, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'GLOBAL_ADULTS_ONLY' }));
    expect(emit).not.toHaveBeenCalled();
  });

  it('ne relaie pas la mise à jour d’une session inconnue du registre', async () => {
    const { handler, socket, emit } = setup({ type: 'global', birthDate: new Date('2010-06-01T00:00:00.000Z') });

    await handler.handleLiveLocationUpdate(socket as never, update as never);

    expect(emit).not.toHaveBeenCalledWith(SERVER_EVENTS.LOCATION_LIVE_UPDATED, expect.anything());
  });

  it('admet le départ d’un compte de 18 ans révolus', async () => {
    const { handler, socket, emit } = setup({ type: 'global', birthDate: new Date('2008-10-10T00:00:00.000Z') });
    const callback = jest.fn();

    await handler.handleLiveLocationStart(socket as never, start as never, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(emit).toHaveBeenCalledWith(SERVER_EVENTS.LOCATION_LIVE_STARTED, expect.anything());
  });

  it('laisse un mineur partager sa position hors de Global, sans lire sa date de naissance', async () => {
    const { handler, prisma, socket } = setup({ type: 'group', birthDate: new Date('2010-06-01T00:00:00.000Z') });
    const callback = jest.fn();

    await handler.handleLiveLocationStart(socket as never, start as never, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('une session CONNUE relaie ses mises à jour sans relire la base', async () => {
    const { handler, prisma, socket, emit } = setup({ type: 'group', birthDate: null });
    await handler.handleLiveLocationStart(socket as never, start as never, jest.fn());
    prisma.conversation.findUnique.mockClear();

    await handler.handleLiveLocationUpdate(socket as never, update as never);

    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(SERVER_EVENTS.LOCATION_LIVE_UPDATED, expect.anything());
  });

  it('une session ouverte dans Global AVANT la déclaration de minorité s’éteint à la mise à jour suivante', async () => {
    const { handler, socket, emit, account, ioEmit } = setup({ type: 'global', birthDate: null });
    await handler.handleLiveLocationStart(socket as never, start as never, jest.fn());
    emit.mockClear();
    account.birthDate = new Date('2011-06-01T00:00:00.000Z');

    await handler.handleLiveLocationUpdate(socket as never, update as never);

    expect(emit).not.toHaveBeenCalledWith(SERVER_EVENTS.LOCATION_LIVE_UPDATED, expect.anything());
    expect(ioEmit).toHaveBeenCalledWith(SERVER_EVENTS.LOCATION_LIVE_STOPPED, expect.objectContaining({ userId: USER_ID }));
    handler.dispose();
  });

  it('une session ouverte dans Global par un compte resté sans restriction continue de relayer', async () => {
    const { handler, socket, emit } = setup({ type: 'global', birthDate: null });
    await handler.handleLiveLocationStart(socket as never, start as never, jest.fn());
    emit.mockClear();

    await handler.handleLiveLocationUpdate(socket as never, update as never);

    expect(emit).toHaveBeenCalledWith(SERVER_EVENTS.LOCATION_LIVE_UPDATED, expect.anything());
    handler.dispose();
  });
});

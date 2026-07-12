/**
 * Harnais e2e multi-client du système d'appels (audit appels 2026-07-11,
 * reco structurante #3) — la « device-test jamais faite », côté serveur.
 *
 * Trois VRAIES sockets Socket.IO (client + serveur réels, validation Zod
 * réelle, rooms réelles, rate-limiter réel) pilotent le scénario
 * « 2 devices du callee, un seul répond » :
 *
 *   A (appelant) ──initiate──▶ gateway ──call:initiated──▶ B1 + B2
 *   B1 ──join (ACK)──▶ gateway ──call:already-answered──▶ B2 (dismiss)
 *   B1 ──signal answer──▶ gateway ──relais ciblé──▶ A (et A seul)
 *
 * Seule la couche métier (CallService/Prisma) est stubée — le WebRTC est
 * « mocké » par construction (le SDP transite, personne ne l'exécute).
 * Couvre la chaîne des findings #1/#3 (dismiss multi-device) et le ciblage
 * du relais de signaux au niveau où les tests unitaires ne peuvent pas :
 * le fanout de rooms réel entre plusieurs connexions simultanées.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createServer, Server as HTTPServer } from 'http';
import { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { CallEventsHandler } from '../CallEventsHandler';
import { getSocketRateLimiter } from '../../utils/socket-rate-limiter';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallService } from '../../services/CallService';

const CALL_ID = '507f1f77bcf86cd799439031';
const CONV_ID = '507f1f77bcf86cd799439032';
const USER_A = 'user-alice';
const USER_B = 'user-bob';

const VALID_SDP = 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111';

function makeParticipant(id: string, participantId: string, userId: string, name: string) {
  return {
    id,
    callSessionId: CALL_ID,
    participantId,
    role: 'participant',
    joinedAt: new Date(),
    leftAt: null,
    isAudioEnabled: true,
    isVideoEnabled: false,
    connectionQuality: null,
    participant: {
      userId,
      displayName: name,
      user: { username: name.toLowerCase(), displayName: name, avatar: null },
    },
  };
}

const session = {
  id: CALL_ID,
  conversationId: CONV_ID,
  mode: 'p2p',
  status: 'ringing',
  metadata: { type: 'audio' },
  initiatorId: USER_A,
  answeredAt: null,
  initiator: { id: USER_A, username: 'alice', displayName: 'Alice', avatar: null },
  participants: [
    makeParticipant('cp-a', 'pa', USER_A, 'Alice'),
    makeParticipant('cp-b', 'pb', USER_B, 'Bob'),
  ],
};

/** Chaque flip de statut demandé au service — le harnais y lit l'effet
 * observable du round-trip reconnecting/reconnected et de son autorisation. */
const statusUpdates: Array<{ callId: string; status: string }> = [];

const callServiceStub = {
  initiateCall: async () => session,
  joinCall: async () => ({ callSession: session, iceServers: [] }),
  // Statut DYNAMIQUE : la garde FSM du handler reconnected exige que le
  // statut courant soit reconnecting|active — un stub figé sur ringing
  // ferait mentir le harnais (le serveur ignorerait, à raison, le retour).
  getCallSession: async () => ({
    ...session,
    status: statusUpdates.at(-1)?.status ?? session.status,
  }),
  generateIceServers: () => [],
  getIceServerTtl: () => 86400,
  scheduleRingingTimeout: () => undefined,
  clearRingingTimeout: () => undefined,
  updateCallStatus: async (callId: string, status: string) => {
    statusUpdates.push({ callId, status });
  },
  createCallSummaryMessage: async () => null,
  createLiveCallMessage: async () => null,
  endCall: async () => ({ ...session, status: 'ended', endReason: 'completed', duration: 30 }),
  persistCallStats: async () => undefined,
} as unknown as CallService;

const prismaStub = {
  participant: {
    findFirst: async () => ({ id: 'pa' }),
    findMany: async () => [{ userId: USER_B }],
  },
  callSession: {
    findUnique: async () => ({ conversationId: CONV_ID }),
  },
  user: {
    findMany: async () => [],
  },
} as unknown as PrismaClient;

/** Résout au prochain `event` reçu par `socket`, ou rejette après 5 s. */
function nextEvent<T = unknown>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      5_000
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connectClient(port: number, userId: string): Promise<ClientSocket> {
  const socket = ioClient(`http://localhost:${port}`, {
    transports: ['websocket'],
    auth: { userId },
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), 5_000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
  });
}

describe('Appels — e2e 2 sockets « deux devices, un répond »', () => {
  let httpServer: HTTPServer;
  let io: SocketIOServer;
  let handler: CallEventsHandler;
  let port: number;
  let clientA: ClientSocket;
  let clientB1: ClientSocket;
  let clientB2: ClientSocket;

  beforeAll(async () => {
    httpServer = createServer();
    io = new SocketIOServer(httpServer);
    handler = new CallEventsHandler(prismaStub, callServiceStub);

    // Miroir minimal de la couche auth de MeeshySocketIOManager : chaque
    // connexion rejoint sa user room et enregistre les handlers d'appel.
    const userBySocket = new Map<string, string>();
    io.on('connection', (socket) => {
      const userId = socket.handshake.auth.userId as string;
      userBySocket.set(socket.id, userId);
      void socket.join(ROOMS.user(userId));
      handler.setupCallEvents(socket, io, (socketId) => userBySocket.get(socketId));
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as AddressInfo).port;
        resolve();
      });
    });

    clientA = await connectClient(port, USER_A);
    clientB1 = await connectClient(port, USER_B);
    clientB2 = await connectClient(port, USER_B);
  });

  afterAll(async () => {
    for (const c of [clientA, clientB1, clientB2]) c?.disconnect();
    handler?.destroy();
    getSocketRateLimiter().destroy();
    io?.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('propage initiate → ring multi-device → dismiss already-answered → relais answer ciblé', async () => {
    // --- 1. A initie : l'ACK mint le callId, B1 ET B2 sonnent -------------
    const ringB1 = nextEvent<{ callId: string }>(clientB1, CALL_EVENTS.INITIATED);
    const ringB2 = nextEvent<{ callId: string }>(clientB2, CALL_EVENTS.INITIATED);

    const initiateAck = await new Promise<{ success: boolean; data?: { callId: string } }>(
      (resolve) => {
        clientA.emit(
          CALL_EVENTS.INITIATE,
          { conversationId: CONV_ID, type: 'audio' },
          resolve
        );
      }
    );
    expect(initiateAck.success).toBe(true);
    expect(initiateAck.data?.callId).toBe(CALL_ID);

    expect((await ringB1).callId).toBe(CALL_ID);
    expect((await ringB2).callId).toBe(CALL_ID);

    // --- 2. B1 répond (join) : B2 — et B2 seul — reçoit already-answered --
    const dismissB2 = nextEvent<{ callId: string }>(clientB2, CALL_EVENTS.ALREADY_ANSWERED);
    let dismissedB1 = false;
    clientB1.once(CALL_EVENTS.ALREADY_ANSWERED, () => {
      dismissedB1 = true;
    });
    const participantJoinedA = nextEvent<{ callId: string }>(
      clientA,
      CALL_EVENTS.PARTICIPANT_JOINED
    );

    const joinAck = await new Promise<{ success: boolean }>((resolve) => {
      clientB1.emit(CALL_EVENTS.JOIN, { callId: CALL_ID }, resolve);
    });
    expect(joinAck.success).toBe(true);

    expect((await dismissB2).callId).toBe(CALL_ID);
    expect((await participantJoinedA).callId).toBe(CALL_ID);
    // Le device qui a répondu ne doit JAMAIS recevoir son propre dismiss.
    expect(dismissedB1).toBe(false);

    // --- 3. B1 envoie l'answer : relais ciblé vers A (et A seul) ----------
    const answerAtA = nextEvent<{ callId: string; signal: { type: string; from: string } }>(
      clientA,
      CALL_EVENTS.SIGNAL
    );
    let signalLeakedToB2 = false;
    clientB2.once(CALL_EVENTS.SIGNAL, () => {
      signalLeakedToB2 = true;
    });

    const signalAck = await new Promise<{ success: boolean }>((resolve) => {
      clientB1.emit(
        CALL_EVENTS.SIGNAL,
        {
          callId: CALL_ID,
          signal: { type: 'answer', from: USER_B, to: USER_A, sdp: VALID_SDP },
        },
        resolve
      );
    });
    expect(signalAck.success).toBe(true);

    const relayed = await answerAtA;
    expect(relayed.callId).toBe(CALL_ID);
    expect(relayed.signal.type).toBe('answer');
    expect(relayed.signal.from).toBe(USER_B);
    // Le signal est ciblé : l'autre device du callee ne doit rien recevoir.
    expect(signalLeakedToB2).toBe(false);
  }, 20_000);

  // Les scénarios suivants RÉUTILISENT l'état du premier (A et B1 membres de
  // la call room après initiate/join) — c'est un déroulé séquentiel, comme un
  // vrai appel. Ils verrouillent le contrat des side-channels que les 3
  // plateformes consomment/émettent désormais (parité livrée post-audit).

  it('relaie screen-capture-detected avec le participantId résolu SERVEUR (anti-usurpation)', async () => {
    const alertAtA = nextEvent<{ callId: string; participantId: string; isCapturing: boolean }>(
      clientA,
      CALL_EVENTS.SCREEN_CAPTURE_ALERT
    );
    let echoedToReporter = false;
    clientB1.once(CALL_EVENTS.SCREEN_CAPTURE_ALERT, () => {
      echoedToReporter = true;
    });

    // B1 tente d'usurper l'identité de son pair dans le payload — le serveur
    // doit relayer avec le participantId RÉSOLU depuis la socket authentifiée.
    clientB1.emit(CALL_EVENTS.SCREEN_CAPTURE_DETECTED, {
      callId: CALL_ID,
      participantId: 'pa-forge',
      isCapturing: true,
    });

    const alert = await alertAtA;
    expect(alert.callId).toBe(CALL_ID);
    expect(alert.participantId).toBe('pb');
    expect(alert.isCapturing).toBe(true);
    // Le reporter ne reçoit jamais sa propre alerte (socket.to, pas io.to).
    expect(echoedToReporter).toBe(false);
  }, 20_000);

  it('émet quality-alert au pair — et au pair seul — après 2 rapports dégradés soutenus', async () => {
    const alertAtA = nextEvent<{ callId: string; metric: string; participantId: string }>(
      clientA,
      CALL_EVENTS.QUALITY_ALERT
    );
    let alertedReporter = false;
    clientB1.once(CALL_EVENTS.QUALITY_ALERT, () => {
      alertedReporter = true;
    });
    let alertedIdleDevice = false;
    clientB2.once(CALL_EVENTS.QUALITY_ALERT, () => {
      alertedIdleDevice = true;
    });

    const degradedStats = { rtt: 420, packetLoss: 1, level: 'poor' as const };
    clientB1.emit(CALL_EVENTS.QUALITY_REPORT, { callId: CALL_ID, stats: degradedStats });
    clientB1.emit(CALL_EVENTS.QUALITY_REPORT, { callId: CALL_ID, stats: degradedStats });

    const alert = await alertAtA;
    expect(alert.callId).toBe(CALL_ID);
    expect(alert.metric).toBe('rtt');
    expect(alert.participantId).toBe('pb');
    // Le reporter garde sa pill locale ; l'alerter aussi serait contradictoire.
    expect(alertedReporter).toBe(false);
    // B2 n'a jamais rejoint la call room : le fanout ne doit pas fuiter.
    expect(alertedIdleDevice).toBe(false);
  }, 20_000);

  it('accepte le payload call:analytics complet (fire-and-forget, validé Zod)', async () => {
    clientB1.emit(CALL_EVENTS.ANALYTICS, {
      callId: CALL_ID,
      setupTimeMs: 3200,
      durationSeconds: 42,
      reconnectionCount: 1,
      networkTransitions: 0,
      averageRtt: 180.5,
      averagePacketLoss: 0.8,
      maxPacketLoss: 4.2,
      codec: 'unknown',
      effectsUsed: [],
      filtersUsed: false,
      transcriptionUsed: false,
      qualityDistribution: { excellent: 0.7, good: 0.2, fair: 0.1, poor: 0 },
      platform: 'android',
      deviceModel: 'Pixel 8',
      isVideo: false,
      endReason: 'local',
    });

    // Fire-and-forget : le seul effet observable est le log structuré du
    // gateway (le logger est mocké en tête de fichier).
    const { logger } = jest.requireMock('../../utils/logger') as {
      logger: { info: jest.Mock };
    };
    await expect(
      waitUntil(() =>
        logger.info.mock.calls.some(
          ([message]) => typeof message === 'string' && message.includes('call:analytics received')
        )
      )
    ).resolves.toBe(true);
  }, 20_000);

  it('round-trip reconnecting/reconnected : statut flippé pour un participant, REJETÉ pour un tiers', async () => {
    // Les 3 plateformes émettent désormais ces signaux : l'autorisation
    // (audit P1-21 — participant ACTIF seul) est un contrat de sécurité à
    // verrouiller au niveau du fil, pas seulement en unitaire.
    statusUpdates.length = 0;

    clientB1.emit(CALL_EVENTS.RECONNECTING, {
      callId: CALL_ID,
      participantId: USER_B,
      attempt: 1,
    });
    await expect(
      waitUntil(() => statusUpdates.some((u) => u.callId === CALL_ID && u.status === 'reconnecting'))
    ).resolves.toBe(true);

    clientB1.emit(CALL_EVENTS.RECONNECTED, { callId: CALL_ID, participantId: USER_B });
    await expect(
      waitUntil(() => statusUpdates.some((u) => u.callId === CALL_ID && u.status === 'active'))
    ).resolves.toBe(true);

    // Un utilisateur authentifié mais NON participant ne peut pas basculer
    // le statut d'un appel arbitraire.
    statusUpdates.length = 0;
    const intruder = await connectClient(port, 'user-charlie');
    try {
      intruder.emit(CALL_EVENTS.RECONNECTING, {
        callId: CALL_ID,
        participantId: 'user-charlie',
        attempt: 1,
      });
      // Fenêtre d'observation : l'absence d'effet est le contrat.
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(statusUpdates).toHaveLength(0);
    } finally {
      intruder.disconnect();
    }
  }, 20_000);

  // Message d'appel VIVANT (feature 2026-07-11) — cycle complet sur vraies
  // sockets : l'initiate poste le message kind:'call-live' via le broadcaster
  // message:new (fire-and-forget, après l'ack), puis le terminal l'édite
  // in-place via le broadcaster message:edited (upsert {kind:'updated'}).
  // Clôt aussi le déroulé séquentiel : l'appel des scénarios précédents finit
  // par un vrai call:end.
  it('cycle du message vivant : initiate → broadcast live (message:new) → end → broadcast édité (message:edited)', async () => {
    const liveMessage = {
      id: 'msg-call-1',
      conversationId: CONV_ID,
      content: 'Appel audio en cours',
      metadata: { kind: 'call-live', callId: CALL_ID, initiatorId: USER_A, callType: 'audio' },
    };
    const terminalMessage = {
      id: 'msg-call-1',
      conversationId: CONV_ID,
      content: 'Appel audio · 00:30',
      metadata: { kind: 'call', callId: CALL_ID, initiatorId: USER_A, callType: 'audio', outcome: 'completed' },
    };
    (callServiceStub as { createLiveCallMessage: unknown }).createLiveCallMessage =
      async () => liveMessage;
    (callServiceStub as { createCallSummaryMessage: unknown }).createCallSummaryMessage =
      async () => ({ kind: 'updated', message: terminalMessage });

    const newBroadcasts: Array<{ metadata: { kind: string } }> = [];
    const editBroadcasts: Array<{ metadata: { kind: string } }> = [];
    handler.setMessageBroadcaster(async (message) => {
      newBroadcasts.push(message as { metadata: { kind: string } });
    });
    handler.setMessageUpdateBroadcaster(async (message) => {
      editBroadcasts.push(message as { metadata: { kind: string } });
    });

    // A (ré)initie — l'ack ne doit jamais être gaté par le message vivant.
    const initiateAck = await new Promise<{ success: boolean }>((resolve) => {
      clientA.emit(CALL_EVENTS.INITIATE, { conversationId: CONV_ID, type: 'audio' }, resolve);
    });
    expect(initiateAck.success).toBe(true);

    await expect(waitUntil(() => newBroadcasts.length === 1)).resolves.toBe(true);
    expect(newBroadcasts[0].metadata.kind).toBe('call-live');
    expect(editBroadcasts).toHaveLength(0);

    // A raccroche : le terminal édite le MÊME message (jamais un second post).
    const endAck = await new Promise<{ success: boolean }>((resolve) => {
      clientA.emit(CALL_EVENTS.END, { callId: CALL_ID }, resolve);
    });
    expect(endAck.success).toBe(true);

    await expect(waitUntil(() => editBroadcasts.length === 1)).resolves.toBe(true);
    expect(editBroadcasts[0].metadata.kind).toBe('call');
    expect((editBroadcasts[0] as { id?: string }).id).toBe('msg-call-1');
    // Un seul message par appel : le terminal n'a rien posté via message:new.
    expect(newBroadcasts).toHaveLength(1);
  }, 20_000);
});

/** Boucle jusqu'à ce que [condition] soit vraie, ou échoue après ~5 s. */
async function waitUntil(condition: () => boolean): Promise<boolean> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return condition();
}

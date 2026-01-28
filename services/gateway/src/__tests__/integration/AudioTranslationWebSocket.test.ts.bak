/**
 * Test WebSocket - Notifications Audio Translation vers Webapp
 *
 * Vérifie que les événements audioTranslationReady sont bien diffusés
 * aux clients Socket.IO connectés dans la bonne room de conversation
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { EventEmitter } from 'events';
import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient();

// Mock du MeeshySocketIOManager pour tester les notifications
class MockSocketIOManager extends EventEmitter {
  public io: SocketIOServer;
  private prisma: PrismaClient;

  constructor(io: SocketIOServer, prisma: PrismaClient) {
    super();
    this.io = io;
    this.prisma = prisma;
  }

  async handleAudioTranslationReady(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    transcription?: {
      text: string;
      language: string;
      confidence?: number;
      segments?: Array<{ text: string; startMs: number; endMs: number }>;
    };
    translatedAudios: Array<{
      targetLanguage: string;
      translatedText: string;
      audioUrl: string;
      durationMs?: number;
      voiceCloned: boolean;
    }>;
    processingTimeMs?: number;
  }) {
    // Récupérer la conversation du message
    const msg = await this.prisma.message.findUnique({
      where: { id: data.messageId },
      select: { conversationId: true }
    });

    const conversationId = msg?.conversationId;

    if (!conversationId) {
      console.warn(`⚠️ Aucune conversation trouvée pour le message ${data.messageId}`);
      return;
    }

    const roomName = `conversation_${conversationId}`;

    // Préparer les données
    const audioTranslationData = {
      messageId: data.messageId,
      attachmentId: data.attachmentId,
      conversationId: conversationId,
      transcription: data.transcription,
      translatedAudios: data.translatedAudios,
      processingTimeMs: data.processingTimeMs
    };

    // Diffuser dans la room de conversation
    this.io.to(roomName).emit('AUDIO_TRANSLATION_READY', audioTranslationData);
  }
}

describe('Audio Translation WebSocket Notifications', () => {
  let ioServer: SocketIOServer;
  let socketManager: MockSocketIOManager;
  let testPort: number;
  let testUserId: string;
  let testConversationId: string;
  let testMessageId: string;
  let testAttachmentId: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Trouver un port libre
    testPort = 3000 + Math.floor(Math.random() * 1000);

    // Créer serveur Socket.IO
    ioServer = new SocketIOServer(testPort, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    socketManager = new MockSocketIOManager(ioServer, prisma);

    // Créer données de test
    testUserId = `test_user_ws_${Date.now()}`;

    const user = await prisma.user.create({
      data: {
        id: testUserId,
        username: `testuser_ws_${Date.now()}`,
        email: `test_ws_${Date.now()}@example.com`,
        passwordHash: 'fake_hash',
        displayName: 'Test WS User'
      }
    });

    testConversationId = `test_conv_ws_${Date.now()}`;
    await prisma.conversation.create({
      data: {
        id: testConversationId,
        conversationType: 'DIRECT',
        participants: {
          create: {
            userId: user.id,
            role: 'MEMBER'
          }
        }
      }
    });

    testMessageId = `test_msg_ws_${Date.now()}`;
    await prisma.message.create({
      data: {
        id: testMessageId,
        conversationId: testConversationId,
        senderId: user.id,
        content: 'Test audio',
        messageType: 'AUDIO',
        originalLanguage: 'en'
      }
    });

    testAttachmentId = `test_att_ws_${Date.now()}`;
    await prisma.messageAttachment.create({
      data: {
        id: testAttachmentId,
        messageId: testMessageId,
        attachmentType: 'AUDIO',
        fileUrl: '/fake/audio.mp3',
        filePath: '/fake/audio.mp3',
        duration: 5000
      }
    });
  });

  afterEach(async () => {
    // Fermer serveur Socket.IO
    await new Promise<void>((resolve) => {
      ioServer.close(() => resolve());
    });

    // Nettoyer DB
    await prisma.messageAttachment.deleteMany({ where: { id: testAttachmentId } });
    await prisma.message.deleteMany({ where: { id: testMessageId } });
    await prisma.conversationParticipant.deleteMany({ where: { conversationId: testConversationId } });
    await prisma.conversation.deleteMany({ where: { id: testConversationId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  describe('Diffusion Événement dans Room Conversation', () => {
    it('devrait diffuser AUDIO_TRANSLATION_READY aux clients dans la room', async () => {
      // ARRANGE
      const client1: ClientSocket = ioClient(`http://localhost:${testPort}`, {
        transports: ['websocket']
      });

      const client2: ClientSocket = ioClient(`http://localhost:${testPort}`, {
        transports: ['websocket']
      });

      // Attendre connexion
      await Promise.all([
        new Promise<void>((resolve) => client1.on('connect', () => resolve())),
        new Promise<void>((resolve) => client2.on('connect', () => resolve()))
      ]);

      // Rejoindre la room de conversation
      const roomName = `conversation_${testConversationId}`;
      client1.emit('join', roomName);
      client2.emit('join', roomName);

      await new Promise(resolve => setTimeout(resolve, 100)); // Attendre join

      // Setup listeners
      const client1Events: any[] = [];
      const client2Events: any[] = [];

      client1.on('AUDIO_TRANSLATION_READY', (data) => {
        client1Events.push(data);
      });

      client2.on('AUDIO_TRANSLATION_READY', (data) => {
        client2Events.push(data);
      });

      // ACT - Émettre événement de traduction
      const audioData = {
        taskId: 'task_ws_001',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Hello world',
          language: 'en',
          confidence: 0.95,
          segments: [
            { text: 'Hello', startMs: 0, endMs: 500 },
            { text: 'world', startMs: 500, endMs: 1000 }
          ]
        },
        translatedAudios: [
          {
            targetLanguage: 'fr',
            translatedText: 'Bonjour le monde',
            audioUrl: '/api/v1/attachments/file/translated/att_123_fr.mp3',
            durationMs: 1200,
            voiceCloned: true
          }
        ],
        processingTimeMs: 2500
      };

      await socketManager.handleAudioTranslationReady(audioData);

      // Attendre réception
      await new Promise(resolve => setTimeout(resolve, 200));

      // ASSERT
      expect(client1Events).toHaveLength(1);
      expect(client2Events).toHaveLength(1);

      // Vérifier contenu
      const receivedData1 = client1Events[0];
      expect(receivedData1.messageId).toBe(testMessageId);
      expect(receivedData1.attachmentId).toBe(testAttachmentId);
      expect(receivedData1.conversationId).toBe(testConversationId);
      expect(receivedData1.transcription.text).toBe('Hello world');
      expect(receivedData1.transcription.segments).toHaveLength(2);
      expect(receivedData1.translatedAudios).toHaveLength(1);
      expect(receivedData1.translatedAudios[0].targetLanguage).toBe('fr');
      expect(receivedData1.processingTimeMs).toBe(2500);

      // Cleanup
      client1.disconnect();
      client2.disconnect();
    });

    it('ne devrait PAS diffuser aux clients hors de la room', async () => {
      // ARRANGE
      const clientInRoom: ClientSocket = ioClient(`http://localhost:${testPort}`, {
        transports: ['websocket']
      });

      const clientOutRoom: ClientSocket = ioClient(`http://localhost:${testPort}`, {
        transports: ['websocket']
      });

      await Promise.all([
        new Promise<void>((resolve) => clientInRoom.on('connect', () => resolve())),
        new Promise<void>((resolve) => clientOutRoom.on('connect', () => resolve()))
      ]);

      // Seul clientInRoom rejoint la room
      const roomName = `conversation_${testConversationId}`;
      clientInRoom.emit('join', roomName);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Setup listeners
      const eventsInRoom: any[] = [];
      const eventsOutRoom: any[] = [];

      clientInRoom.on('AUDIO_TRANSLATION_READY', (data) => {
        eventsInRoom.push(data);
      });

      clientOutRoom.on('AUDIO_TRANSLATION_READY', (data) => {
        eventsOutRoom.push(data);
      });

      // ACT
      await socketManager.handleAudioTranslationReady({
        taskId: 'task_ws_002',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Test isolation',
          language: 'en'
        },
        translatedAudios: [],
        processingTimeMs: 1000
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // ASSERT
      expect(eventsInRoom).toHaveLength(1);
      expect(eventsOutRoom).toHaveLength(0); // N'a rien reçu

      // Cleanup
      clientInRoom.disconnect();
      clientOutRoom.disconnect();
    });
  });

  describe('Structure Données Transcription avec Segments', () => {
    it('devrait inclure les segments détaillés dans la transcription', async () => {
      // ARRANGE
      const client: ClientSocket = ioClient(`http://localhost:${testPort}`, {
        transports: ['websocket']
      });

      await new Promise<void>((resolve) => client.on('connect', () => resolve()));

      const roomName = `conversation_${testConversationId}`;
      client.emit('join', roomName);
      await new Promise(resolve => setTimeout(resolve, 100));

      const receivedEvents: any[] = [];
      client.on('AUDIO_TRANSLATION_READY', (data) => {
        receivedEvents.push(data);
      });

      // ACT
      const segments = [
        { text: 'Bonjour,', startMs: 0, endMs: 600 },
        { text: 'comment', startMs: 600, endMs: 1000 },
        { text: 'allez-vous', startMs: 1000, endMs: 1500 },
        { text: 'aujourd\'hui?', startMs: 1500, endMs: 2200 }
      ];

      await socketManager.handleAudioTranslationReady({
        taskId: 'task_ws_003',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Bonjour, comment allez-vous aujourd\'hui?',
          language: 'fr',
          confidence: 0.97,
          segments: segments
        },
        translatedAudios: [
          {
            targetLanguage: 'en',
            translatedText: 'Hello, how are you today?',
            audioUrl: '/api/v1/attachments/file/translated/att_456_en.mp3',
            durationMs: 2300,
            voiceCloned: true
          }
        ],
        processingTimeMs: 3200
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // ASSERT
      expect(receivedEvents).toHaveLength(1);
      const data = receivedEvents[0];

      expect(data.transcription.segments).toHaveLength(4);
      expect(data.transcription.segments).toEqual(segments);

      // Vérifier chaque segment
      expect(data.transcription.segments[0].text).toBe('Bonjour,');
      expect(data.transcription.segments[0].startMs).toBe(0);
      expect(data.transcription.segments[0].endMs).toBe(600);

      // Cleanup
      client.disconnect();
    });
  });

  describe('Multiples Audios Traduits', () => {
    it('devrait diffuser 5 audios traduits avec URLs accessibles', async () => {
      // ARRANGE
      const client: ClientSocket = ioClient(`http://localhost:${testPort}`, {
        transports: ['websocket']
      });

      await new Promise<void>((resolve) => client.on('connect', () => resolve()));

      const roomName = `conversation_${testConversationId}`;
      client.emit('join', roomName);
      await new Promise(resolve => setTimeout(resolve, 100));

      const receivedEvents: any[] = [];
      client.on('AUDIO_TRANSLATION_READY', (data) => {
        receivedEvents.push(data);
      });

      // ACT
      const translatedAudios = [
        {
          targetLanguage: 'en',
          translatedText: 'Hello everyone',
          audioUrl: '/api/v1/attachments/file/translated/att_789_en.mp3',
          durationMs: 1500,
          voiceCloned: true
        },
        {
          targetLanguage: 'fr',
          translatedText: 'Bonjour tout le monde',
          audioUrl: '/api/v1/attachments/file/translated/att_789_fr.mp3',
          durationMs: 1800,
          voiceCloned: true
        },
        {
          targetLanguage: 'es',
          translatedText: 'Hola a todos',
          audioUrl: '/api/v1/attachments/file/translated/att_789_es.mp3',
          durationMs: 1600,
          voiceCloned: true
        },
        {
          targetLanguage: 'de',
          translatedText: 'Hallo zusammen',
          audioUrl: '/api/v1/attachments/file/translated/att_789_de.mp3',
          durationMs: 1700,
          voiceCloned: true
        },
        {
          targetLanguage: 'it',
          translatedText: 'Ciao a tutti',
          audioUrl: '/api/v1/attachments/file/translated/att_789_it.mp3',
          durationMs: 1550,
          voiceCloned: true
        }
      ];

      await socketManager.handleAudioTranslationReady({
        taskId: 'task_ws_004',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Hello everyone',
          language: 'en',
          confidence: 0.96
        },
        translatedAudios: translatedAudios,
        processingTimeMs: 5500
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // ASSERT
      expect(receivedEvents).toHaveLength(1);
      const data = receivedEvents[0];

      expect(data.translatedAudios).toHaveLength(5);
      expect(data.translatedAudios.map((a: any) => a.targetLanguage).sort()).toEqual(['de', 'en', 'es', 'fr', 'it']);

      // Vérifier URLs
      data.translatedAudios.forEach((audio: any) => {
        expect(audio.audioUrl).toContain('/api/v1/attachments/file/translated/');
        expect(audio.audioUrl).toContain(`.mp3`);
      });

      // Cleanup
      client.disconnect();
    });
  });

  describe('Temps de Traitement', () => {
    it('devrait inclure processingTimeMs dans l\'événement', async () => {
      // ARRANGE
      const client: ClientSocket = ioClient(`http://localhost:${testPort}`, {
        transports: ['websocket']
      });

      await new Promise<void>((resolve) => client.on('connect', () => resolve()));

      const roomName = `conversation_${testConversationId}`;
      client.emit('join', roomName);
      await new Promise(resolve => setTimeout(resolve, 100));

      const receivedEvents: any[] = [];
      client.on('AUDIO_TRANSLATION_READY', (data) => {
        receivedEvents.push(data);
      });

      // ACT
      await socketManager.handleAudioTranslationReady({
        taskId: 'task_ws_005',
        messageId: testMessageId,
        attachmentId: testAttachmentId,
        transcription: {
          text: 'Processing time test',
          language: 'en'
        },
        translatedAudios: [],
        processingTimeMs: 4250 // 4.25 secondes
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // ASSERT
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].processingTimeMs).toBe(4250);

      // Cleanup
      client.disconnect();
    });
  });
});

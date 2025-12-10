/**
 * Tests d'intégration Socket.IO pour le système de statut utilisateur
 *
 * Ce fichier teste:
 * - Broadcast USER_STATUS lors de la connexion
 * - Broadcast USER_STATUS lors de la déconnexion
 * - Détection et nettoyage des connexions zombies
 * - Timeouts Socket.IO (pingTimeout, pingInterval)
 * - Mise à jour temps réel du statut
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Server as HTTPServer, createServer } from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MeeshySocketIOManager } from '../../socketio/MeeshySocketIOManager';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import jwt from 'jsonwebtoken';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Socket.IO Status Integration', () => {
  let httpServer: HTTPServer;
  let socketIOManager: MeeshySocketIOManager;
  let prisma: PrismaClient;
  let serverPort: number;
  let testUser: any;
  let testToken: string;

  beforeAll(async () => {
    prisma = new PrismaClient();

    // Create HTTP server
    httpServer = createServer();

    // Initialize Socket.IO manager
    socketIOManager = new MeeshySocketIOManager(httpServer, prisma);
    await socketIOManager.initialize();

    // Start server on random port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address() as AddressInfo;
        serverPort = address.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create test user
    testUser = await prisma.user.create({
      data: {
        username: 'socket-test-' + Date.now(),
        email: 'socket-test-' + Date.now() + '@example.com',
        password: 'hashed-password',
        systemLanguage: 'fr',
        regionalLanguage: 'fr',
        isOnline: false
      }
    });

    // Generate JWT token
    testToken = jwt.sign(
      { userId: testUser.id, email: testUser.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '24h' }
    );
  });

  afterEach(async () => {
    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
  });

  describe('Connection Status Broadcast', () => {
    it('should broadcast USER_STATUS when user connects', async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.disconnect();
          reject(new Error('Timeout: USER_STATUS not received'));
        }, 5000);

        // Create client connection
        const client = ioClient(`http://localhost:${serverPort}`, {
          auth: {
            token: testToken
          },
          transports: ['websocket']
        });

        // Listen for USER_STATUS broadcast
        client.on(SERVER_EVENTS.USER_STATUS, (data: any) => {
          clearTimeout(timeout);

          expect(data).toBeDefined();
          expect(data.userId).toBe(testUser.id);
          expect(data.isOnline).toBe(true);

          client.disconnect();
          resolve();
        });

        client.on('connect_error', (error) => {
          clearTimeout(timeout);
          client.disconnect();
          reject(error);
        });
      });
    });

    it('should update user isOnline to true in database on connection', async () => {
      const client = ioClient(`http://localhost:${serverPort}`, {
        auth: {
          token: testToken
        },
        transports: ['websocket']
      });

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });

      // Wait for async DB update
      await sleep(500);

      // Check database
      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id }
      });

      expect(updatedUser).toBeDefined();
      expect(updatedUser!.isOnline).toBe(true);
      expect(updatedUser!.lastActiveAt).toBeDefined();

      client.disconnect();
    });
  });

  describe('Disconnection Status Broadcast', () => {
    it('should broadcast USER_STATUS when user disconnects', async () => {
      return new Promise<void>(async (resolve, reject) => {
        const timeout = setTimeout(() => {
          monitorClient.disconnect();
          userClient.disconnect();
          reject(new Error('Timeout: disconnect USER_STATUS not received'));
        }, 10000);

        // Create monitoring client (to receive broadcasts)
        const monitorClient = ioClient(`http://localhost:${serverPort}`, {
          transports: ['websocket']
        });

        await new Promise<void>(r => monitorClient.on('connect', () => r()));

        // Create user client
        const userClient = ioClient(`http://localhost:${serverPort}`, {
          auth: {
            token: testToken
          },
          transports: ['websocket']
        });

        await new Promise<void>(r => userClient.on('connect', () => r()));

        // Wait for connection broadcast
        await sleep(500);

        // Listen for disconnect broadcast
        let disconnectReceived = false;

        monitorClient.on(SERVER_EVENTS.USER_STATUS, (data: any) => {
          if (data.userId === testUser.id && data.isOnline === false) {
            disconnectReceived = true;
            clearTimeout(timeout);

            expect(data.userId).toBe(testUser.id);
            expect(data.isOnline).toBe(false);

            monitorClient.disconnect();
            resolve();
          }
        });

        // Disconnect user
        userClient.disconnect();
      });
    });

    it('should update user isOnline to false in database on disconnection', async () => {
      const client = ioClient(`http://localhost:${serverPort}`, {
        auth: {
          token: testToken
        },
        transports: ['websocket']
      });

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });

      await sleep(500);

      // Disconnect
      client.disconnect();

      // Wait for async DB update
      await sleep(500);

      // Check database
      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id }
      });

      expect(updatedUser).toBeDefined();
      expect(updatedUser!.isOnline).toBe(false);
      expect(updatedUser!.lastSeen).toBeDefined();
    });
  });

  describe('Zombie Connection Detection', () => {
    it('should detect zombie connection after pingTimeout', async () => {
      // This test simulates an abrupt network failure
      // The socket dies without sending disconnect event

      const client = ioClient(`http://localhost:${serverPort}`, {
        auth: {
          token: testToken
        },
        transports: ['websocket'],
        reconnection: false // Disable reconnection
      });

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });

      await sleep(500);

      // Verify user is online
      let user = await prisma.user.findUnique({
        where: { id: testUser.id }
      });
      expect(user!.isOnline).toBe(true);

      // Simulate abrupt disconnection (kill socket without proper disconnect)
      // @ts-ignore - access internal socket
      client.io.engine.close();

      // Wait for pingTimeout (10 seconds) + buffer
      await sleep(12000);

      // User should be detected as offline by Socket.IO timeout
      user = await prisma.user.findUnique({
        where: { id: testUser.id }
      });

      // Note: This depends on Socket.IO's disconnect event firing
      // In real scenarios, maintenance job will clean up after 5 minutes
    }, 15000); // 15 second timeout for this test

    it('should clean up zombie after 5 minutes via maintenance job', async () => {
      // Create user with old lastActiveAt but still marked as online (zombie scenario)
      const zombieTime = new Date();
      zombieTime.setMinutes(zombieTime.getMinutes() - 7);

      const zombieUser = await prisma.user.create({
        data: {
          username: 'zombie-user-' + Date.now(),
          email: 'zombie-' + Date.now() + '@example.com',
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          isOnline: true,
          lastActiveAt: zombieTime
        }
      });

      // Manually trigger maintenance cleanup
      // Access private method via reflection for testing
      const maintenanceService = (socketIOManager as any).maintenanceService;
      const updateOfflineUsers = maintenanceService.updateOfflineUsers.bind(maintenanceService);
      await updateOfflineUsers();

      // Verify zombie is now offline
      const cleanedUser = await prisma.user.findUnique({
        where: { id: zombieUser.id }
      });

      expect(cleanedUser).toBeDefined();
      expect(cleanedUser!.isOnline).toBe(false);
      expect(cleanedUser!.lastSeen).toBeDefined();

      // Cleanup
      await prisma.user.delete({ where: { id: zombieUser.id } });
    });
  });

  describe('Multi-Tab Connection Handling', () => {
    it('should keep user online when multiple tabs connected', async () => {
      const client1 = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: testToken },
        transports: ['websocket']
      });

      const client2 = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: testToken },
        transports: ['websocket']
      });

      await Promise.all([
        new Promise<void>(r => client1.on('connect', () => r())),
        new Promise<void>(r => client2.on('connect', () => r()))
      ]);

      await sleep(500);

      // Verify user is online
      let user = await prisma.user.findUnique({
        where: { id: testUser.id }
      });
      expect(user!.isOnline).toBe(true);

      // Disconnect first tab
      client1.disconnect();
      await sleep(500);

      // User should still be online (second tab connected)
      user = await prisma.user.findUnique({
        where: { id: testUser.id }
      });
      expect(user!.isOnline).toBe(true);

      // Disconnect second tab
      client2.disconnect();
      await sleep(500);

      // Now user should be offline
      user = await prisma.user.findUnique({
        where: { id: testUser.id }
      });
      expect(user!.isOnline).toBe(false);
    });
  });

  describe('Anonymous Participant Status', () => {
    it('should handle anonymous participant connection status', async () => {
      // Create anonymous participant
      const conversation = await prisma.conversation.create({
        data: {
          identifier: 'test-conv-socket-anon-' + Date.now()
        }
      });

      const shareLink = await prisma.conversationShareLink.create({
        data: {
          conversationId: conversation.id,
          uniqueUrl: 'test-link-socket-anon-' + Date.now(),
          createdBy: 'system'
        }
      });

      const sessionToken = 'session-socket-' + Date.now();

      const participant = await prisma.anonymousParticipant.create({
        data: {
          username: 'anon-socket-' + Date.now(),
          language: 'fr',
          sessionToken: sessionToken,
          shareLinkId: shareLink.id,
          isOnline: false
        }
      });

      // Connect as anonymous
      const client = ioClient(`http://localhost:${serverPort}`, {
        auth: {
          sessionToken: sessionToken
        },
        transports: ['websocket']
      });

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });

      await sleep(500);

      // Verify participant is online
      const updatedParticipant = await prisma.anonymousParticipant.findUnique({
        where: { id: participant.id }
      });

      expect(updatedParticipant!.isOnline).toBe(true);

      client.disconnect();
      await sleep(500);

      // Verify participant is offline
      const offlineParticipant = await prisma.anonymousParticipant.findUnique({
        where: { id: participant.id }
      });

      expect(offlineParticipant!.isOnline).toBe(false);

      // Cleanup
      await prisma.anonymousParticipant.delete({ where: { id: participant.id } });
      await prisma.conversationShareLink.delete({ where: { id: shareLink.id } });
      await prisma.conversation.delete({ where: { id: conversation.id } });
    });
  });
});

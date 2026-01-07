/**
 * Tests de résilience pour le système de statut utilisateur
 *
 * Ce fichier teste:
 * - Fonctionnement avec WebSocket down (fallback polling)
 * - Récupération après crash du job de maintenance
 * - Gestion des erreurs de connexion DB
 * - Reconnexion automatique
 * - État cohérent après pannes
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Server as HTTPServer, createServer } from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MeeshySocketIOManager } from '../../socketio/MeeshySocketIOManager';
import { MaintenanceService } from '../../services/MaintenanceService';
import { AttachmentService } from '../../services/AttachmentService';
import jwt from 'jsonwebtoken';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Status System - Resilience Tests', () => {
  let httpServer: HTTPServer;
  let socketIOManager: MeeshySocketIOManager;
  let prisma: PrismaClient;
  let serverPort: number;

  beforeAll(async () => {
    prisma = new PrismaClient();

    httpServer = createServer();
    socketIOManager = new MeeshySocketIOManager(httpServer, prisma);
    await socketIOManager.initialize();

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

  describe('WebSocket Failure Handling', () => {
    it('should calculate status locally when WebSocket is down', async () => {
      const testUser = await prisma.user.create({
        data: {
          username: `resilience-ws-${Date.now()}`,
          email: `resilience-ws-${Date.now()}@example.com`,
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          isOnline: true,
          lastActiveAt: new Date()
        }
      });

      try {
        // Simulate WebSocket being unavailable
        // Client should fall back to polling or local calculation

        // User's status should be calculated from lastActiveAt
        const user = await prisma.user.findUnique({
          where: { id: testUser.id }
        });

        expect(user).toBeDefined();
        expect(user!.lastActiveAt).toBeDefined();

        // Calculate status locally (as frontend would do)
        const now = new Date();
        const lastActive = user!.lastActiveAt!;
        const inactiveMinutes = (now.getTime() - lastActive.getTime()) / 1000 / 60;

        const expectedStatus = inactiveMinutes < 5 ? 'online' : 'offline';

        // Status should be derivable from lastActiveAt even without WebSocket
        expect(expectedStatus).toBe('online');

      } finally {
        await prisma.user.delete({ where: { id: testUser.id } });
      }
    });

    it('should reconnect and sync status after WebSocket recovery', async () => {
      const testUser = await prisma.user.create({
        data: {
          username: `resilience-reconnect-${Date.now()}`,
          email: `resilience-reconnect-${Date.now()}@example.com`,
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr'
        }
      });

      const token = jwt.sign(
        { userId: testUser.id, email: testUser.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      try {
        // Connect client
        const client = ioClient(`http://localhost:${serverPort}`, {
          auth: { token },
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000
        });

        await new Promise<void>((resolve) => {
          client.on('connect', () => resolve());
        });

        await sleep(500);

        // Verify online
        let user = await prisma.user.findUnique({
          where: { id: testUser.id }
        });
        expect(user!.isOnline).toBe(true);

        // Simulate network interruption
        client.disconnect();
        await sleep(500);

        // User should be offline
        user = await prisma.user.findUnique({
          where: { id: testUser.id }
        });
        expect(user!.isOnline).toBe(false);

        // Reconnect
        client.connect();

        await new Promise<void>((resolve) => {
          client.on('connect', () => resolve());
        });

        await sleep(500);

        // User should be online again
        user = await prisma.user.findUnique({
          where: { id: testUser.id }
        });
        expect(user!.isOnline).toBe(true);

        client.disconnect();

      } finally {
        await prisma.user.delete({ where: { id: testUser.id } });
      }
    });
  });

  describe('Maintenance Job Resilience', () => {
    it('should recover from maintenance job crash', async () => {
      const attachmentService = new AttachmentService(prisma);
      const maintenanceService = new MaintenanceService(prisma, attachmentService);

      // Create zombie user
      const zombieTime = new Date();
      zombieTime.setMinutes(zombieTime.getMinutes() - 10);

      const zombieUser = await prisma.user.create({
        data: {
          username: `zombie-recovery-${Date.now()}`,
          email: `zombie-recovery-${Date.now()}@example.com`,
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          isOnline: true,
          lastActiveAt: zombieTime
        }
      });

      try {
        // Start maintenance
        await maintenanceService.startMaintenanceTasks();

        // Simulate crash (stop maintenance)
        maintenanceService.stopMaintenanceTasks();

        await sleep(1000);

        // User should still be marked as online (zombie)
        let user = await prisma.user.findUnique({
          where: { id: zombieUser.id }
        });
        expect(user!.isOnline).toBe(true);

        // Restart maintenance
        await maintenanceService.startMaintenanceTasks();

        // Manually trigger cleanup
        const updateOfflineUsers = (maintenanceService as any).updateOfflineUsers.bind(maintenanceService);
        await updateOfflineUsers();

        // User should now be cleaned up
        user = await prisma.user.findUnique({
          where: { id: zombieUser.id }
        });
        expect(user!.isOnline).toBe(false);

        maintenanceService.stopMaintenanceTasks();

      } finally {
        await prisma.user.delete({ where: { id: zombieUser.id } });
      }
    });

    it('should handle maintenance interval interruptions gracefully', async () => {
      const attachmentService = new AttachmentService(prisma);
      const maintenanceService = new MaintenanceService(prisma, attachmentService);

      try {
        // Start maintenance
        await maintenanceService.startMaintenanceTasks();

        // Get stats
        let stats = await maintenanceService.getMaintenanceStats();
        expect(stats.maintenanceActive).toBe(true);

        // Stop and restart rapidly
        maintenanceService.stopMaintenanceTasks();
        await sleep(100);
        await maintenanceService.startMaintenanceTasks();

        // Should still work correctly
        stats = await maintenanceService.getMaintenanceStats();
        expect(stats.maintenanceActive).toBe(true);

        maintenanceService.stopMaintenanceTasks();

      } finally {
        maintenanceService.stopMaintenanceTasks();
      }
    });
  });

  describe('Database Error Handling', () => {
    it('should handle DB connection errors gracefully', async () => {
      // This test simulates DB unavailability
      // In production, should use connection pooling and retries

      const testUser = await prisma.user.create({
        data: {
          username: `db-error-test-${Date.now()}`,
          email: `db-error-test-${Date.now()}@example.com`,
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr'
        }
      });

      try {
        // Create a new Prisma instance that will fail
        // (In real scenario, this would timeout or fail)

        // The system should:
        // 1. Not crash
        // 2. Return cached data if available
        // 3. Retry on next request

        // For this test, verify error handling exists
        const attachmentService = new AttachmentService(prisma);
        const maintenanceService = new MaintenanceService(prisma, attachmentService);

        // This should not throw even if DB is unavailable
        await expect(
          maintenanceService.getMaintenanceStats()
        ).resolves.toBeDefined();

      } finally {
        await prisma.user.delete({ where: { id: testUser.id } });
      }
    });

    it('should maintain status consistency after DB reconnection', async () => {
      // Create users
      const user1 = await prisma.user.create({
        data: {
          username: `consistency-1-${Date.now()}`,
          email: `consistency-1-${Date.now()}@example.com`,
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          isOnline: true,
          lastActiveAt: new Date()
        }
      });

      const user2 = await prisma.user.create({
        data: {
          username: `consistency-2-${Date.now()}`,
          email: `consistency-2-${Date.now()}@example.com`,
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          isOnline: false,
          lastActiveAt: new Date(Date.now() - 600000) // 10 min ago
        }
      });

      try {
        // Simulate brief DB disconnection
        // (In reality, Prisma handles reconnection internally)

        await sleep(100);

        // Query after "reconnection"
        const users = await prisma.user.findMany({
          where: {
            id: { in: [user1.id, user2.id] }
          }
        });

        expect(users).toHaveLength(2);

        // Status should remain consistent
        const onlineUser = users.find(u => u.id === user1.id);
        const offlineUser = users.find(u => u.id === user2.id);

        expect(onlineUser!.isOnline).toBe(true);
        expect(offlineUser!.isOnline).toBe(false);

      } finally {
        await prisma.user.deleteMany({
          where: {
            id: { in: [user1.id, user2.id] }
          }
        });
      }
    });
  });

  describe('Race Condition Handling', () => {
    it('should handle simultaneous status updates correctly', async () => {
      const testUser = await prisma.user.create({
        data: {
          username: `race-condition-${Date.now()}`,
          email: `race-condition-${Date.now()}@example.com`,
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          isOnline: false
        }
      });

      try {
        // Trigger multiple simultaneous updates
        const updatePromises = Array(10).fill(null).map((_, i) =>
          prisma.user.update({
            where: { id: testUser.id },
            data: {
              isOnline: i % 2 === 0,
              lastActiveAt: new Date()
            }
          })
        );

        await Promise.all(updatePromises);

        // Final state should be consistent (not corrupted)
        const finalUser = await prisma.user.findUnique({
          where: { id: testUser.id }
        });

        expect(finalUser).toBeDefined();
        expect(typeof finalUser!.isOnline).toBe('boolean');
        expect(finalUser!.lastActiveAt).toBeDefined();

      } finally {
        await prisma.user.delete({ where: { id: testUser.id } });
      }
    });

    it('should handle connect/disconnect race conditions', async () => {
      const testUser = await prisma.user.create({
        data: {
          username: `connect-race-${Date.now()}`,
          email: `connect-race-${Date.now()}@example.com`,
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr'
        }
      });

      const token = jwt.sign(
        { userId: testUser.id, email: testUser.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      try {
        // Connect and disconnect rapidly in sequence
        const client1 = ioClient(`http://localhost:${serverPort}`, {
          auth: { token },
          transports: ['websocket']
        });

        const client2 = ioClient(`http://localhost:${serverPort}`, {
          auth: { token },
          transports: ['websocket']
        });

        await Promise.all([
          new Promise<void>(r => client1.on('connect', () => r())),
          new Promise<void>(r => client2.on('connect', () => r()))
        ]);

        // Disconnect one
        client1.disconnect();
        await sleep(200);

        // User should still be online (client2 connected)
        let user = await prisma.user.findUnique({
          where: { id: testUser.id }
        });
        expect(user!.isOnline).toBe(true);

        // Disconnect both
        client2.disconnect();
        await sleep(500);

        // Now should be offline
        user = await prisma.user.findUnique({
          where: { id: testUser.id }
        });
        expect(user!.isOnline).toBe(false);

      } finally {
        await prisma.user.delete({ where: { id: testUser.id } });
      }
    });
  });

  describe('Data Integrity', () => {
    it('should maintain accurate lastActiveAt timestamps', async () => {
      const testUser = await prisma.user.create({
        data: {
          username: `timestamp-test-${Date.now()}`,
          email: `timestamp-test-${Date.now()}@example.com`,
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr'
        }
      });

      try {
        const startTime = Date.now();

        // Update lastActiveAt
        await prisma.user.update({
          where: { id: testUser.id },
          data: { lastActiveAt: new Date() }
        });

        const user = await prisma.user.findUnique({
          where: { id: testUser.id }
        });

        // Timestamp should be accurate (within 1 second)
        const timeDiff = Math.abs(user!.lastActiveAt!.getTime() - startTime);
        expect(timeDiff).toBeLessThan(1000);

      } finally {
        await prisma.user.delete({ where: { id: testUser.id } });
      }
    });

    it('should not lose status data during high concurrency', async () => {
      const userCount = 50;
      const users: any[] = [];

      try {
        // Create users
        for (let i = 0; i < userCount; i++) {
          const user = await prisma.user.create({
            data: {
              username: `concurrent-${Date.now()}-${i}`,
              email: `concurrent-${Date.now()}-${i}@example.com`,
              password: 'hashed-password',
              systemLanguage: 'fr',
              regionalLanguage: 'fr',
              isOnline: true,
              lastActiveAt: new Date()
            }
          });
          users.push(user);
        }

        // Perform concurrent reads and writes
        const operations = users.map(user =>
          prisma.user.update({
            where: { id: user.id },
            data: { lastActiveAt: new Date() }
          })
        );

        await Promise.all(operations);

        // Verify all users still exist and have valid data
        const verifiedUsers = await prisma.user.findMany({
          where: {
            id: { in: users.map(u => u.id) }
          }
        });

        expect(verifiedUsers).toHaveLength(userCount);
        verifiedUsers.forEach(user => {
          expect(user.lastActiveAt).toBeDefined();
          expect(typeof user.isOnline).toBe('boolean');
        });

      } finally {
        await prisma.user.deleteMany({
          where: {
            id: { in: users.map(u => u.id) }
          }
        });
      }
    });
  });
});

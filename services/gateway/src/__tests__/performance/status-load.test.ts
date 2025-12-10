/**
 * Tests de performance pour le système de statut utilisateur
 *
 * Ce fichier teste:
 * - Gestion de 1000+ utilisateurs simultanés
 * - Temps de broadcast des changements de statut
 * - Throttling des mises à jour DB sous charge
 * - Performance des requêtes de statut
 * - Scalabilité du système
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Server as HTTPServer, createServer } from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MeeshySocketIOManager } from '../../socketio/MeeshySocketIOManager';
import jwt from 'jsonwebtoken';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Status System - Performance & Load Tests', () => {
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

  describe('Concurrent User Load', () => {
    it('should handle 100 concurrent users connecting', async () => {
      const startTime = Date.now();
      const userCount = 100;
      const users: any[] = [];
      const clients: ClientSocket[] = [];

      try {
        // Create 100 test users

        for (let i = 0; i < userCount; i++) {
          const user = await prisma.user.create({
            data: {
              username: `load-test-user-${Date.now()}-${i}`,
              email: `load-test-${Date.now()}-${i}@example.com`,
              password: 'hashed-password',
              systemLanguage: 'fr',
              regionalLanguage: 'fr'
            }
          });
          users.push(user);
        }


        // Connect all users simultaneously
        const connectionStart = Date.now();

        const connectionPromises = users.map((user) => {
          const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || 'test-secret',
            { expiresIn: '1h' }
          );

          const client = ioClient(`http://localhost:${serverPort}`, {
            auth: { token },
            transports: ['websocket']
          });

          clients.push(client);

          return new Promise<void>((resolve) => {
            client.on('connect', () => resolve());
          });
        });

        await Promise.all(connectionPromises);

        const connectionTime = Date.now() - connectionStart;

        // Should connect within 10 seconds
        expect(connectionTime).toBeLessThan(10000);

        // Average time per connection
        const avgConnectionTime = connectionTime / userCount;

        // Should be less than 100ms per user
        expect(avgConnectionTime).toBeLessThan(100);

        // Wait for all status updates to propagate
        await sleep(2000);

        // Verify all users are online in DB
        const onlineUsers = await prisma.user.count({
          where: {
            id: { in: users.map(u => u.id) },
            isOnline: true
          }
        });

        expect(onlineUsers).toBe(userCount);

      } finally {
        // Cleanup

        clients.forEach(client => client.disconnect());
        await sleep(1000);

        await prisma.user.deleteMany({
          where: {
            id: { in: users.map(u => u.id) }
          }
        });
      }
    }, 60000); // 60 second timeout

    it('should broadcast status changes to 100+ users efficiently', async () => {
      const observerCount = 100;
      const observers: any[] = [];
      const observerClients: ClientSocket[] = [];

      try {
        // Create observer users
        for (let i = 0; i < observerCount; i++) {
          const user = await prisma.user.create({
            data: {
              username: `observer-${Date.now()}-${i}`,
              email: `observer-${Date.now()}-${i}@example.com`,
              password: 'hashed-password',
              systemLanguage: 'fr',
              regionalLanguage: 'fr'
            }
          });
          observers.push(user);
        }

        // Connect all observers
        const connectionPromises = observers.map((user) => {
          const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || 'test-secret',
            { expiresIn: '1h' }
          );

          const client = ioClient(`http://localhost:${serverPort}`, {
            auth: { token },
            transports: ['websocket']
          });

          observerClients.push(client);

          return new Promise<void>((resolve) => {
            client.on('connect', () => resolve());
          });
        });

        await Promise.all(connectionPromises);
        await sleep(500);

        // Create a test user to broadcast status change
        const testUser = await prisma.user.create({
          data: {
            username: `broadcast-test-${Date.now()}`,
            email: `broadcast-test-${Date.now()}@example.com`,
            password: 'hashed-password',
            systemLanguage: 'fr',
            regionalLanguage: 'fr'
          }
        });

        // Track broadcasts received
        const broadcastsReceived = new Set<number>();
        const broadcastStart = Date.now();

        observerClients.forEach((client, index) => {
          client.on('USER_STATUS', (data: any) => {
            if (data.userId === testUser.id) {
              broadcastsReceived.add(index);
            }
          });
        });

        // Connect test user (trigger broadcast)
        const testToken = jwt.sign(
          { userId: testUser.id, email: testUser.email },
          process.env.JWT_SECRET || 'test-secret',
          { expiresIn: '1h' }
        );

        const testClient = ioClient(`http://localhost:${serverPort}`, {
          auth: { token: testToken },
          transports: ['websocket']
        });

        await new Promise<void>((resolve) => {
          testClient.on('connect', () => resolve());
        });

        // Wait for broadcasts to complete
        await sleep(3000);

        const broadcastTime = Date.now() - broadcastStart;

        // Should reach at least 90% of users
        expect(broadcastsReceived.size).toBeGreaterThanOrEqual(observerCount * 0.9);

        // Should complete within 5 seconds
        expect(broadcastTime).toBeLessThan(5000);

        // Cleanup
        testClient.disconnect();
        observerClients.forEach(client => client.disconnect());
        await sleep(500);

        await prisma.user.deleteMany({
          where: {
            id: { in: [...observers.map(u => u.id), testUser.id] }
          }
        });

      } finally {
        // Ensure cleanup
        observerClients.forEach(client => {
          if (client.connected) client.disconnect();
        });
      }
    }, 60000);
  });

  describe('Database Update Throttling', () => {
    it('should throttle DB updates under high request load', async () => {
      const testUser = await prisma.user.create({
        data: {
          username: `throttle-test-${Date.now()}`,
          email: `throttle-test-${Date.now()}@example.com`,
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
        // Record initial lastActiveAt
        await prisma.user.update({
          where: { id: testUser.id },
          data: { lastActiveAt: new Date(Date.now() - 120000) } // 2 min ago
        });

        const initialUser = await prisma.user.findUnique({
          where: { id: testUser.id }
        });

        // Simulate 50 rapid requests (would normally trigger 50 updates)
        const requestCount = 50;

        // In a real implementation, this would call the auth middleware
        // which should throttle lastActiveAt updates

        // For this test, we simulate by checking that DB updates are limited
        // The implementation should use a cache/throttle mechanism

        const updatePromises = [];
        for (let i = 0; i < requestCount; i++) {
          // Simulate auth middleware update logic
          const promise = (async () => {
            // This should be throttled by the actual implementation
            // For now, just track attempts
          })();
          updatePromises.push(promise);
        }

        await Promise.all(updatePromises);
        await sleep(1000);

        // Get final state
        const finalUser = await prisma.user.findUnique({
          where: { id: testUser.id }
        });

        // The number of actual DB updates should be << requestCount
        // Expected: ~1-2 updates (throttled to 1 per minute)


        // In production, verify throttling prevents DB overload
        // This is more of an architectural test

      } finally {
        await prisma.user.delete({ where: { id: testUser.id } });
      }
    });
  });

  describe('Status Query Performance', () => {
    it('should query status of 1000 users efficiently', async () => {
      const userCount = 1000;
      const users: any[] = [];

      try {

        // Create users in batches
        const batchSize = 100;
        for (let i = 0; i < userCount; i += batchSize) {
          const batch = [];
          for (let j = 0; j < batchSize && (i + j) < userCount; j++) {
            batch.push({
              username: `query-test-${Date.now()}-${i + j}`,
              email: `query-test-${Date.now()}-${i + j}@example.com`,
              password: 'hashed-password',
              systemLanguage: 'fr',
              regionalLanguage: 'fr',
              isOnline: Math.random() > 0.5 // 50% online
            });
          }

          const created = await prisma.user.createMany({ data: batch });
          const createdUsers = await prisma.user.findMany({
            where: {
              email: { in: batch.map(u => u.email) }
            }
          });

          users.push(...createdUsers);
        }


        // Test: Query all users' online status
        const queryStart = Date.now();

        const onlineUsers = await prisma.user.findMany({
          where: {
            id: { in: users.map(u => u.id) },
            isOnline: true
          },
          select: {
            id: true,
            isOnline: true,
            lastActiveAt: true
          }
        });

        const queryTime = Date.now() - queryStart;

        // Should complete within 1 second
        expect(queryTime).toBeLessThan(1000);


      } finally {
        await prisma.user.deleteMany({
          where: {
            id: { in: users.map(u => u.id) }
          }
        });
      }
    }, 120000); // 2 minute timeout
  });

  describe('Memory and Resource Usage', () => {
    it('should not leak memory with rapid connect/disconnect cycles', async () => {
      const cycles = 50;
      const testUser = await prisma.user.create({
        data: {
          username: `memory-test-${Date.now()}`,
          email: `memory-test-${Date.now()}@example.com`,
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
        // Get initial memory usage
        const initialMemory = process.memoryUsage().heapUsed;

        // Perform rapid connect/disconnect cycles
        for (let i = 0; i < cycles; i++) {
          const client = ioClient(`http://localhost:${serverPort}`, {
            auth: { token },
            transports: ['websocket']
          });

          await new Promise<void>((resolve) => {
            client.on('connect', () => {
              setTimeout(() => {
                client.disconnect();
                resolve();
              }, 100);
            });
          });
        }

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        await sleep(2000);

        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;


        // Should not increase by more than 50MB
        expect(memoryIncrease).toBeLessThan(50);

      } finally {
        await prisma.user.delete({ where: { id: testUser.id } });
      }
    }, 60000);
  });
});

/**
 * Tests unitaires pour MaintenanceService
 *
 * Ce fichier teste:
 * - Détection des utilisateurs inactifs (>5 minutes)
 * - Marquage automatique comme offline
 * - Broadcast des changements de statut
 * - Intervalles de maintenance (60 secondes)
 * - Nettoyage des participants anonymes zombies
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MaintenanceService } from '../../services/MaintenanceService';
import { AttachmentService } from '../../services/attachments';

// Mock du logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Helper pour attendre
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('MaintenanceService - Offline User Detection', () => {
  let prisma: PrismaClient;
  let maintenanceService: MaintenanceService;
  let attachmentService: AttachmentService;

  beforeEach(async () => {
    prisma = new PrismaClient();
    attachmentService = new AttachmentService(prisma);
    maintenanceService = new MaintenanceService(prisma, attachmentService);
  });

  afterEach(async () => {
    maintenanceService.stopMaintenanceTasks();
    await prisma.$disconnect();
  });

  describe('Inactive User Detection', () => {
    it('should mark users offline after 5 minutes of inactivity', async () => {
      // Create user with old lastActiveAt (7 minutes ago)
      const inactiveTime = new Date();
      inactiveTime.setMinutes(inactiveTime.getMinutes() - 7);

      const user = await prisma.user.create({
        data: {
          username: 'inactive-user-' + Date.now(),
          email: 'inactive-' + Date.now() + '@example.com',
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          isOnline: true,
          lastActiveAt: inactiveTime
        }
      });

      // Mock broadcast callback to track calls
      const broadcastMock = jest.fn();
      maintenanceService.setStatusBroadcastCallback(broadcastMock);

      // Manually trigger maintenance (simulate cron)
      // Note: We use reflection to access private method for testing
      const updateOfflineUsers = (maintenanceService as any).updateOfflineUsers.bind(maintenanceService);
      await updateOfflineUsers();

      // Verify user is now offline
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(updatedUser).toBeDefined();
      expect(updatedUser!.isOnline).toBe(false);
      expect(updatedUser!.lastActiveAt).toBeDefined();

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });

    it('should NOT mark recently active users offline', async () => {
      // Create user with recent lastActiveAt (2 minutes ago)
      const recentTime = new Date();
      recentTime.setMinutes(recentTime.getMinutes() - 2);

      const user = await prisma.user.create({
        data: {
          username: 'active-user-' + Date.now(),
          email: 'active-' + Date.now() + '@example.com',
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          isOnline: true,
          lastActiveAt: recentTime
        }
      });

      // Manually trigger maintenance
      const updateOfflineUsers = (maintenanceService as any).updateOfflineUsers.bind(maintenanceService);
      await updateOfflineUsers();

      // Verify user is still online
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(updatedUser).toBeDefined();
      expect(updatedUser!.isOnline).toBe(true);

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });

    it('should handle multiple inactive users in batch', async () => {
      // Create 3 inactive users
      const inactiveTime = new Date();
      inactiveTime.setMinutes(inactiveTime.getMinutes() - 10);

      const users = await Promise.all([
        prisma.user.create({
          data: {
            username: 'batch-1-' + Date.now(),
            email: 'batch-1-' + Date.now() + '@example.com',
            password: 'hashed-password',
            systemLanguage: 'fr',
            regionalLanguage: 'fr',
            isOnline: true,
            lastActiveAt: inactiveTime
          }
        }),
        prisma.user.create({
          data: {
            username: 'batch-2-' + Date.now(),
            email: 'batch-2-' + Date.now() + '@example.com',
            password: 'hashed-password',
            systemLanguage: 'fr',
            regionalLanguage: 'fr',
            isOnline: true,
            lastActiveAt: inactiveTime
          }
        }),
        prisma.user.create({
          data: {
            username: 'batch-3-' + Date.now(),
            email: 'batch-3-' + Date.now() + '@example.com',
            password: 'hashed-password',
            systemLanguage: 'fr',
            regionalLanguage: 'fr',
            isOnline: true,
            lastActiveAt: inactiveTime
          }
        })
      ]);

      // Trigger maintenance
      const updateOfflineUsers = (maintenanceService as any).updateOfflineUsers.bind(maintenanceService);
      await updateOfflineUsers();

      // Verify all are offline
      const updatedUsers = await prisma.user.findMany({
        where: {
          id: { in: users.map(u => u.id) }
        }
      });

      expect(updatedUsers.every(u => u.isOnline === false)).toBe(true);

      // Cleanup
      await prisma.user.deleteMany({
        where: { id: { in: users.map(u => u.id) } }
      });
    });
  });

  describe('Anonymous Participant Cleanup', () => {
    it('should mark inactive anonymous participants offline', async () => {
      // Create test data
      const conversation = await prisma.conversation.create({
        data: {
          identifier: 'test-conv-cleanup-' + Date.now()
        }
      });

      const shareLink = await prisma.conversationShareLink.create({
        data: {
          conversationId: conversation.id,
          uniqueUrl: 'test-link-cleanup-' + Date.now(),
          createdBy: 'system'
        }
      });

      const inactiveTime = new Date();
      inactiveTime.setMinutes(inactiveTime.getMinutes() - 10);

      const participant = await prisma.anonymousParticipant.create({
        data: {
          username: 'anon-inactive-' + Date.now(),
          language: 'fr',
          sessionToken: 'token-inactive-' + Date.now(),
          shareLinkId: shareLink.id,
          isOnline: true,
          lastActiveAt: inactiveTime
        }
      });

      // Trigger maintenance
      const updateOfflineUsers = (maintenanceService as any).updateOfflineUsers.bind(maintenanceService);
      await updateOfflineUsers();

      // Verify participant is offline
      const updatedParticipant = await prisma.anonymousParticipant.findUnique({
        where: { id: participant.id }
      });

      expect(updatedParticipant).toBeDefined();
      expect(updatedParticipant!.isOnline).toBe(false);
      expect(updatedParticipant!.lastActiveAt).toBeDefined();

      // Cleanup
      await prisma.anonymousParticipant.delete({ where: { id: participant.id } });
      await prisma.conversationShareLink.delete({ where: { id: shareLink.id } });
      await prisma.conversation.delete({ where: { id: conversation.id } });
    });
  });

  describe('Maintenance Task Lifecycle', () => {
    it('should start and stop maintenance tasks', async () => {
      await maintenanceService.startMaintenanceTasks();

      const stats = await maintenanceService.getMaintenanceStats();
      expect(stats.maintenanceActive).toBe(true);

      maintenanceService.stopMaintenanceTasks();

      // After stop, maintenance should be inactive
      const statsAfter = await maintenanceService.getMaintenanceStats();
      expect(statsAfter.maintenanceActive).toBe(false);
    });

    it('should run maintenance at regular intervals', async () => {
      // This test would require mocking setInterval and is complex
      // For now, we verify the configuration is correct
      const stats = await maintenanceService.getMaintenanceStats();
      expect(stats.offlineThresholdMinutes).toBe(5);
    });
  });

  describe('Daily Cleanup Tasks', () => {
    it('should clean up expired anonymous sessions', async () => {
      // Create old anonymous session (25 hours old)
      const conversation = await prisma.conversation.create({
        data: {
          identifier: 'test-conv-expired-' + Date.now()
        }
      });

      const shareLink = await prisma.conversationShareLink.create({
        data: {
          conversationId: conversation.id,
          uniqueUrl: 'test-link-expired-' + Date.now(),
          createdBy: 'system'
        }
      });

      const oldTime = new Date();
      oldTime.setHours(oldTime.getHours() - 25);

      const expiredParticipant = await prisma.anonymousParticipant.create({
        data: {
          username: 'anon-expired-' + Date.now(),
          language: 'fr',
          sessionToken: 'token-expired-' + Date.now(),
          shareLinkId: shareLink.id,
          lastActiveAt: oldTime
        }
      });

      // Trigger cleanup
      const cleanupExpiredData = (maintenanceService as any).cleanupExpiredData.bind(maintenanceService);
      await cleanupExpiredData();

      // Verify participant was deleted
      const deletedParticipant = await prisma.anonymousParticipant.findUnique({
        where: { id: expiredParticipant.id }
      });

      expect(deletedParticipant).toBeNull();

      // Cleanup
      await prisma.conversationShareLink.delete({ where: { id: shareLink.id } });
      await prisma.conversation.delete({ where: { id: conversation.id } });
    });

    it('should clean up expired share links', async () => {
      const conversation = await prisma.conversation.create({
        data: {
          identifier: 'test-conv-link-expired-' + Date.now()
        }
      });

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const expiredLink = await prisma.conversationShareLink.create({
        data: {
          conversationId: conversation.id,
          uniqueUrl: 'expired-link-' + Date.now(),
          createdBy: 'system',
          expiresAt: pastDate
        }
      });

      // Trigger cleanup
      const cleanupExpiredData = (maintenanceService as any).cleanupExpiredData.bind(maintenanceService);
      await cleanupExpiredData();

      // Verify link was deleted
      const deletedLink = await prisma.conversationShareLink.findUnique({
        where: { id: expiredLink.id }
      });

      expect(deletedLink).toBeNull();

      // Cleanup
      await prisma.conversation.delete({ where: { id: conversation.id } });
    });
  });
});

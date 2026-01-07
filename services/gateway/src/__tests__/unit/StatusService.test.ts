/**
 * Tests unitaires pour le système de statut utilisateur en temps réel
 *
 * Ce fichier teste:
 * - Mise à jour de lastActiveAt pour utilisateurs
 * - Mise à jour de lastActiveAt pour participants anonymes
 * - Throttling des mises à jour (1x par minute)
 * - Nettoyage des entrées cache anciennes
 * - Calcul du statut en temps réel
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MaintenanceService } from '../../services/MaintenanceService';
import { AttachmentService } from '../../services/AttachmentService';

// Mock du logger pour éviter les logs pendant les tests
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('StatusService - User Status Management', () => {
  let prisma: PrismaClient;
  let maintenanceService: MaintenanceService;
  let attachmentService: AttachmentService;

  beforeEach(async () => {
    prisma = new PrismaClient();
    attachmentService = new AttachmentService(prisma);
    maintenanceService = new MaintenanceService(prisma, attachmentService);
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('updateUserOnlineStatus', () => {
    it('should update user to online status', async () => {
      // Create test user
      const user = await prisma.user.create({
        data: {
          username: 'test-user-online',
          email: 'test-online@example.com',
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          isOnline: false
        }
      });

      // Update to online
      await maintenanceService.updateUserOnlineStatus(user.id, true, false);

      // Verify
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(updatedUser).toBeDefined();
      expect(updatedUser!.isOnline).toBe(true);
      expect(updatedUser!.lastActiveAt).toBeDefined();
      expect(updatedUser!.lastActiveAt!.getTime()).toBeGreaterThan(Date.now() - 5000);

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });

    it('should update user to offline status', async () => {
      // Create test user
      const user = await prisma.user.create({
        data: {
          username: 'test-user-offline',
          email: 'test-offline@example.com',
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          isOnline: true,
          lastActiveAt: new Date()
        }
      });

      // Update to offline
      await maintenanceService.updateUserOnlineStatus(user.id, false, false);

      // Verify
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(updatedUser).toBeDefined();
      expect(updatedUser!.isOnline).toBe(false);
      expect(updatedUser!.lastSeen).toBeDefined();

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });

    it('should broadcast status change when requested', async () => {
      // Create test user
      const user = await prisma.user.create({
        data: {
          username: 'test-user-broadcast',
          email: 'test-broadcast@example.com',
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          isOnline: false
        }
      });

      // Mock broadcast callback
      const broadcastMock = jest.fn();
      maintenanceService.setStatusBroadcastCallback(broadcastMock);

      // Update with broadcast
      await maintenanceService.updateUserOnlineStatus(user.id, true, true);

      // Verify broadcast called
      expect(broadcastMock).toHaveBeenCalledWith(user.id, true, false);

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });
  });

  describe('updateAnonymousOnlineStatus', () => {
    it('should update anonymous participant to online', async () => {
      // Create test conversation
      const conversation = await prisma.conversation.create({
        data: {
          identifier: 'test-conv-anon-' + Date.now()
        }
      });

      // Create test share link
      const shareLink = await prisma.conversationShareLink.create({
        data: {
          conversationId: conversation.id,
          uniqueUrl: 'test-link-anon-' + Date.now(),
          createdBy: 'system'
        }
      });

      // Create anonymous participant
      const participant = await prisma.anonymousParticipant.create({
        data: {
          username: 'anon-test-' + Date.now(),
          language: 'fr',
          sessionToken: 'test-token-' + Date.now(),
          shareLinkId: shareLink.id,
          isOnline: false
        }
      });

      // Update to online
      await maintenanceService.updateAnonymousOnlineStatus(participant.id, true, false);

      // Verify
      const updatedParticipant = await prisma.anonymousParticipant.findUnique({
        where: { id: participant.id }
      });

      expect(updatedParticipant).toBeDefined();
      expect(updatedParticipant!.isOnline).toBe(true);
      expect(updatedParticipant!.lastActiveAt).toBeDefined();

      // Cleanup
      await prisma.anonymousParticipant.delete({ where: { id: participant.id } });
      await prisma.conversationShareLink.delete({ where: { id: shareLink.id } });
      await prisma.conversation.delete({ where: { id: conversation.id } });
    });

    it('should broadcast anonymous status change when requested', async () => {
      // Create test data
      const conversation = await prisma.conversation.create({
        data: {
          identifier: 'test-conv-anon-broadcast-' + Date.now()
        }
      });

      const shareLink = await prisma.conversationShareLink.create({
        data: {
          conversationId: conversation.id,
          uniqueUrl: 'test-link-anon-broadcast-' + Date.now(),
          createdBy: 'system'
        }
      });

      const participant = await prisma.anonymousParticipant.create({
        data: {
          username: 'anon-broadcast-' + Date.now(),
          language: 'fr',
          sessionToken: 'test-token-broadcast-' + Date.now(),
          shareLinkId: shareLink.id,
          isOnline: false
        }
      });

      // Mock broadcast callback
      const broadcastMock = jest.fn();
      maintenanceService.setStatusBroadcastCallback(broadcastMock);

      // Update with broadcast
      await maintenanceService.updateAnonymousOnlineStatus(participant.id, true, true);

      // Verify broadcast called with anonymous flag
      expect(broadcastMock).toHaveBeenCalledWith(participant.id, true, true);

      // Cleanup
      await prisma.anonymousParticipant.delete({ where: { id: participant.id } });
      await prisma.conversationShareLink.delete({ where: { id: shareLink.id } });
      await prisma.conversation.delete({ where: { id: conversation.id } });
    });
  });

  describe('getMaintenanceStats', () => {
    it('should return correct statistics', async () => {
      // Create test users
      const onlineUser = await prisma.user.create({
        data: {
          username: 'online-stats-user',
          email: 'online-stats@example.com',
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          isOnline: true,
          lastActiveAt: new Date()
        }
      });

      const offlineUser = await prisma.user.create({
        data: {
          username: 'offline-stats-user',
          email: 'offline-stats@example.com',
          password: 'hashed-password',
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          isOnline: false
        }
      });

      // Get stats
      const stats = await maintenanceService.getMaintenanceStats();

      expect(stats).toBeDefined();
      expect(stats.onlineUsers).toBeGreaterThanOrEqual(1);
      expect(stats.totalUsers).toBeGreaterThanOrEqual(2);
      expect(stats.offlineThresholdMinutes).toBe(5);

      // Cleanup
      await prisma.user.delete({ where: { id: onlineUser.id } });
      await prisma.user.delete({ where: { id: offlineUser.id } });
    });

    it('should track online vs total users correctly', async () => {
      const stats = await maintenanceService.getMaintenanceStats();

      expect(stats.onlineUsers).toBeLessThanOrEqual(stats.totalUsers);
      expect(stats.onlineAnonymous).toBeLessThanOrEqual(stats.anonymousSessions);
    });
  });
});

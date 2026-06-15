/**
 * Tests — LOT 7 : résolution de cible typée d'un token /l/<token>.
 * `TrackingLinkService.resolveTarget` tente d'abord un TrackingLink, puis
 * tombe en fallback sur un ConversationShareLink (invitation). Un lien expiré
 * ou inactif est résolu mais marqué `isActive: false`.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TrackingLinkService } from '../services/TrackingLinkService';

const buildPrisma = () => {
  const trackingLink = {
    findUnique: jest.fn<(arg?: unknown) => Promise<Record<string, unknown> | null>>().mockResolvedValue(null),
  };
  const conversationShareLink = {
    findFirst: jest.fn<(arg?: unknown) => Promise<Record<string, unknown> | null>>().mockResolvedValue(null),
  };
  const prisma: unknown = { trackingLink, conversationShareLink };
  return prisma as ConstructorParameters<typeof TrackingLinkService>[0] & {
    trackingLink: typeof trackingLink;
    conversationShareLink: typeof conversationShareLink;
  };
};

describe('TrackingLinkService.resolveTarget', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: TrackingLinkService;
  beforeEach(() => { prisma = buildPrisma(); service = new TrackingLinkService(prisma); });

  it('resolves a tracking link to its typed target (kind=tracking) without touching conversations', async () => {
    prisma.trackingLink.findUnique.mockResolvedValueOnce({
      token: 'abc123', targetType: 'REEL', targetId: 'post1',
      originalUrl: 'https://meeshy.me/l/abc123', createdBy: 'sharerX',
      isActive: true, expiresAt: null,
    });
    const r = await service.resolveTarget('abc123');
    expect(r).toMatchObject({
      kind: 'tracking', targetType: 'REEL', targetId: 'post1',
      originalUrl: 'https://meeshy.me/l/abc123', sharerId: 'sharerX',
      isActive: true, expiresAt: null,
    });
    expect(prisma.conversationShareLink.findFirst).not.toHaveBeenCalled();
  });

  it('marks an expired tracking link inactive (isActive=false)', async () => {
    prisma.trackingLink.findUnique.mockResolvedValueOnce({
      token: 'old', targetType: 'POST', targetId: 'p', originalUrl: 'u', createdBy: 's',
      isActive: true, expiresAt: new Date('2000-01-01T00:00:00.000Z'),
    });
    const r = await service.resolveTarget('old');
    expect(r!.isActive).toBe(false);
  });

  it('marks a deactivated tracking link inactive even if not expired', async () => {
    prisma.trackingLink.findUnique.mockResolvedValueOnce({
      token: 'off', targetType: 'POST', targetId: 'p', originalUrl: 'u', createdBy: 's',
      isActive: false, expiresAt: null,
    });
    const r = await service.resolveTarget('off');
    expect(r!.isActive).toBe(false);
  });

  it('falls back to a conversation share link (kind=conversation) when no tracking link matches', async () => {
    prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      linkId: 'mshy_x', identifier: 'mshy_x', conversationId: 'conv1',
      createdBy: 'inviter', isActive: true, expiresAt: null,
    });
    const r = await service.resolveTarget('mshy_x');
    expect(r).toMatchObject({
      kind: 'conversation', targetType: 'CONVERSATION', targetId: 'conv1',
      sharerId: 'inviter', isActive: true,
    });
    // looked up by linkId OR identifier
    const where = (prisma.conversationShareLink.findFirst.mock.calls[0][0] as { where?: unknown }).where;
    expect(where).toMatchObject({ OR: [{ linkId: 'mshy_x' }, { identifier: 'mshy_x' }] });
  });

  it('returns null for an unknown token (neither tracking nor invitation)', async () => {
    const r = await service.resolveTarget('nope');
    expect(r).toBeNull();
  });
});

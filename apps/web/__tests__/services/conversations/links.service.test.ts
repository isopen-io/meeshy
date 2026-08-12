/**
 * Tests for LinksService
 *
 * Tests createInviteLink (auto-name generation, auth manager, 403/404/other errors)
 * and createConversationWithLink (link creation with defaults).
 */

import { LinksService } from '@/services/conversations/links.service';
import { apiService } from '@/services/api.service';
import { conversationsCrudService } from '@/services/conversations/crud.service';
import { generateLinkName } from '@/utils/link-name-generator';
import { authManager } from '@/services/auth-manager.service';
import type { Conversation } from '@meeshy/shared/types';

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('@/services/conversations/crud.service', () => ({
  conversationsCrudService: {
    getConversation: jest.fn(),
  },
}));

jest.mock('@/utils/link-name-generator', () => ({
  generateLinkName: jest.fn(() => 'Generated Link Name'),
}));

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getCurrentUser: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;
const mockCrudService = conversationsCrudService as jest.Mocked<typeof conversationsCrudService>;
const mockGenerateLinkName = generateLinkName as jest.MockedFunction<typeof generateLinkName>;
const mockAuthManager = authManager as jest.Mocked<typeof authManager>;

const makeConversation = (overrides = {}): Conversation =>
  ({ id: 'conv-1', title: 'Test Group', type: 'group', ...overrides } as unknown as Conversation);

const makeSuccessLinkResponse = (link = 'https://meeshy.me/join/link-123') => ({
  data: { success: true, data: { link, code: 'abc123', shareLink: null } },
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('LinksService', () => {
  let svc: LinksService;

  beforeEach(() => {
    jest.resetAllMocks();
    svc = new LinksService();
    // Default: no authenticated user
    mockAuthManager.getCurrentUser.mockReturnValue(null);
    // Default: return a non-empty generated name
    mockGenerateLinkName.mockReturnValue('Generated Link Name');
  });

  // ── createInviteLink ──────────────────────────────────────────────────────

  describe('createInviteLink', () => {
    it('uses provided linkData.name directly (skips auto-generation)', async () => {
      mockApi.post.mockResolvedValue(makeSuccessLinkResponse() as any);

      const result = await svc.createInviteLink('conv-1', { name: 'My Custom Link' });

      expect(mockCrudService.getConversation).not.toHaveBeenCalled();
      expect(mockGenerateLinkName).not.toHaveBeenCalled();
      expect(mockApi.post).toHaveBeenCalledWith(
        '/conversations/conv-1/new-link',
        expect.objectContaining({ name: 'My Custom Link' }),
      );
      expect(result).toBe('https://meeshy.me/join/link-123');
    });

    it('auto-generates link name using conversation title and authManager language', async () => {
      mockCrudService.getConversation.mockResolvedValue(makeConversation({ title: 'Tech Channel' }));
      mockAuthManager.getCurrentUser.mockReturnValue({ systemLanguage: 'en' } as any);
      mockApi.post.mockResolvedValue(makeSuccessLinkResponse() as any);

      await svc.createInviteLink('conv-1');

      expect(mockCrudService.getConversation).toHaveBeenCalledWith('conv-1');
      expect(mockGenerateLinkName).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationTitle: 'Tech Channel',
          language: 'en',
        }),
      );
      expect(mockApi.post).toHaveBeenCalledWith(
        '/conversations/conv-1/new-link',
        expect.objectContaining({ name: 'Generated Link Name' }),
      );
    });

    it('defaults to language=fr when authManager returns null', async () => {
      mockCrudService.getConversation.mockResolvedValue(makeConversation({ title: 'Chan' }));
      mockAuthManager.getCurrentUser.mockReturnValue(null);
      mockApi.post.mockResolvedValue(makeSuccessLinkResponse() as any);

      await svc.createInviteLink('conv-1');

      expect(mockGenerateLinkName).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'fr' }),
      );
    });

    it('uses Conversation.title="Conversation" fallback when title is empty', async () => {
      mockCrudService.getConversation.mockResolvedValue(makeConversation({ title: '' }));
      mockApi.post.mockResolvedValue(makeSuccessLinkResponse() as any);

      await svc.createInviteLink('conv-1');

      expect(mockGenerateLinkName).toHaveBeenCalledWith(
        expect.objectContaining({ conversationTitle: 'Conversation' }),
      );
    });

    it('computes durationDays from expiresAt', async () => {
      mockCrudService.getConversation.mockResolvedValue(makeConversation());

      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      mockApi.post.mockResolvedValue(makeSuccessLinkResponse() as any);

      await svc.createInviteLink('conv-1', { expiresAt: future });

      expect(mockGenerateLinkName).toHaveBeenCalledWith(
        expect.objectContaining({ durationDays: expect.any(Number) }),
      );
    });

    it('falls back to default link name when getConversation throws', async () => {
      mockCrudService.getConversation.mockRejectedValue(new Error('Not found'));
      mockApi.post.mockResolvedValue(makeSuccessLinkResponse() as any);

      await svc.createInviteLink('conv-1');

      expect(mockApi.post).toHaveBeenCalledWith(
        '/conversations/conv-1/new-link',
        expect.objectContaining({ name: "Lien d'invitation" }),
      );
    });

    it('propagates allowAnonymousMessages and other link options to API', async () => {
      mockApi.post.mockResolvedValue(makeSuccessLinkResponse() as any);

      await svc.createInviteLink('conv-1', {
        name: 'Link',
        maxUses: 100,
        expiresAt: '2026-12-31T00:00:00.000Z',
        allowAnonymousMessages: false,
        allowAnonymousFiles: true,
        allowAnonymousImages: false,
        allowViewHistory: false,
        requireNickname: false,
        requireEmail: true,
      });

      expect(mockApi.post).toHaveBeenCalledWith(
        '/conversations/conv-1/new-link',
        expect.objectContaining({
          maxUses: 100,
          expiresAt: '2026-12-31T00:00:00.000Z',
          allowAnonymousMessages: false,
          allowAnonymousFiles: true,
          allowAnonymousImages: false,
          allowViewHistory: false,
          requireNickname: false,
          requireEmail: true,
        }),
      );
    });

    it('uses default values when link options are not provided', async () => {
      mockApi.post.mockResolvedValue(makeSuccessLinkResponse() as any);

      await svc.createInviteLink('conv-1', { name: 'Link' });

      expect(mockApi.post).toHaveBeenCalledWith(
        '/conversations/conv-1/new-link',
        expect.objectContaining({
          allowAnonymousMessages: true,
          allowAnonymousFiles: false,
          allowAnonymousImages: true,
          allowViewHistory: true,
          requireNickname: true,
          requireEmail: false,
        }),
      );
    });

    it('throws a specific error when API returns link=undefined', async () => {
      mockApi.post.mockResolvedValue({ data: { data: { link: undefined } } } as any);

      await expect(svc.createInviteLink('conv-1', { name: 'Link' })).rejects.toThrow(
        'Erreur lors de la création du lien',
      );
    });

    it('throws 403 "non-membre" error for Accès non autorisé', async () => {
      const err = Object.assign(new Error('Accès non autorisé à cette conversation'), { status: 403 });
      mockApi.post.mockRejectedValue(err);

      await expect(svc.createInviteLink('conv-1', { name: 'L' })).rejects.toThrow(
        'Vous n\'êtes pas membre de cette conversation',
      );
    });

    it('throws 403 "admins only" error for Seuls les administrateurs', async () => {
      const err = Object.assign(new Error('Seuls les administrateurs peuvent faire cela'), { status: 403 });
      mockApi.post.mockRejectedValue(err);

      await expect(svc.createInviteLink('conv-1', { name: 'L' })).rejects.toThrow(
        'Seuls les administrateurs et modérateurs',
      );
    });

    it('throws generic 403 error for other 403 messages', async () => {
      const err = Object.assign(new Error('Forbidden'), { status: 403 });
      mockApi.post.mockRejectedValue(err);

      await expect(svc.createInviteLink('conv-1', { name: 'L' })).rejects.toThrow(
        'Vous n\'avez pas les permissions nécessaires',
      );
    });

    it('throws 404 error', async () => {
      const err = Object.assign(new Error('Not Found'), { status: 404 });
      mockApi.post.mockRejectedValue(err);

      await expect(svc.createInviteLink('conv-1', { name: 'L' })).rejects.toThrow(
        'Conversation non trouvée.',
      );
    });

    it('throws generic error for other HTTP statuses', async () => {
      const err = Object.assign(new Error('Internal Server Error'), { status: 500 });
      mockApi.post.mockRejectedValue(err);

      await expect(svc.createInviteLink('conv-1', { name: 'L' })).rejects.toThrow(
        'Erreur lors de la création du lien de partage',
      );
    });
  });

  // ── createConversationWithLink ────────────────────────────────────────────

  describe('createConversationWithLink', () => {
    it('returns the join URL from the API response', async () => {
      mockApi.post.mockResolvedValue({
        data: { success: true, data: { linkId: 'link-456', conversationId: 'conv-new', shareLink: null } },
      } as any);

      const result = await svc.createConversationWithLink({ name: 'My Link' });

      expect(mockApi.post).toHaveBeenCalledWith('/api/links', expect.objectContaining({ name: 'My Link' }));
      expect(result).toContain('/join/link-456');
    });

    it('uses default values when linkData is not provided', async () => {
      mockApi.post.mockResolvedValue({
        data: { data: { linkId: 'link-default', conversationId: 'conv-x', shareLink: null } },
      } as any);

      await svc.createConversationWithLink();

      expect(mockApi.post).toHaveBeenCalledWith(
        '/api/links',
        expect.objectContaining({
          name: 'Nouvelle conversation',
          description: 'Rejoignez cette conversation',
          allowAnonymousMessages: true,
          allowAnonymousFiles: false,
          allowAnonymousImages: true,
          allowViewHistory: true,
          requireNickname: true,
          requireEmail: false,
        }),
      );
    });

    it('uses NEXT_PUBLIC_FRONTEND_URL env var when set', async () => {
      const original = process.env.NEXT_PUBLIC_FRONTEND_URL;
      process.env.NEXT_PUBLIC_FRONTEND_URL = 'https://app.meeshy.io';
      mockApi.post.mockResolvedValue({
        data: { data: { linkId: 'link-789', conversationId: 'conv-x' } },
      } as any);

      const result = await svc.createConversationWithLink();

      expect(result).toBe('https://app.meeshy.io/join/link-789');
      process.env.NEXT_PUBLIC_FRONTEND_URL = original;
    });

    it('throws when response has no linkId', async () => {
      mockApi.post.mockResolvedValue({ data: { data: { linkId: undefined } } } as any);

      await expect(svc.createConversationWithLink()).rejects.toThrow(
        'Erreur lors de la création de la conversation avec lien',
      );
    });
  });
});

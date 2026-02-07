/**
 * Tests for share-utils module
 * Tests share link generation and sharing functionality
 */

import {
  generateShareLink,
  generateShareMetadata,
  shareLink,
  validateAffiliateToken,
  validateConversationLink,
  generateQRCodeData,
  getShareStats,
  type ShareLinkOptions,
} from '../../lib/share-utils';

// Mock fetch globally
global.fetch = jest.fn();

describe('Share Utils Module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_FRONTEND_URL: 'https://test.meeshy.me',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('generateShareLink', () => {
    it('should generate affiliate link', () => {
      const options: ShareLinkOptions = {
        type: 'affiliate',
        affiliateToken: 'abc123',
      };

      const result = generateShareLink(options);
      expect(result).toBe('https://test.meeshy.me/signup/affiliate/abc123');
    });

    it('should throw error for affiliate link without token', () => {
      const options: ShareLinkOptions = {
        type: 'affiliate',
      };

      expect(() => generateShareLink(options)).toThrow("Token d'affiliation requis");
    });

    it('should generate conversation link', () => {
      const options: ShareLinkOptions = {
        type: 'conversation',
        linkId: 'conv-123',
      };

      const result = generateShareLink(options);
      expect(result).toBe('https://test.meeshy.me/join/conv-123');
    });

    it('should throw error for conversation link without linkId', () => {
      const options: ShareLinkOptions = {
        type: 'conversation',
      };

      expect(() => generateShareLink(options)).toThrow('LinkId requis');
    });

    it('should generate join link', () => {
      const options: ShareLinkOptions = {
        type: 'join',
        linkId: 'join-456',
      };

      const result = generateShareLink(options);
      expect(result).toBe('https://test.meeshy.me/join/join-456');
    });

    it('should throw error for join link without linkId', () => {
      const options: ShareLinkOptions = {
        type: 'join',
      };

      expect(() => generateShareLink(options)).toThrow('LinkId requis');
    });

    it('should generate default link', () => {
      const options: ShareLinkOptions = {
        type: 'default',
      };

      const result = generateShareLink(options);
      expect(result).toBe('https://test.meeshy.me');
    });

    it('should use fallback URL when env variable not set', () => {
      delete process.env.NEXT_PUBLIC_FRONTEND_URL;

      const options: ShareLinkOptions = {
        type: 'default',
      };

      const result = generateShareLink(options);
      expect(result).toBe('https://meeshy.me');
    });
  });

  describe('generateShareMetadata', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            title: 'Custom Title',
            description: 'Custom Description',
            image: 'https://example.com/image.jpg',
            url: 'https://test.meeshy.me',
            type: 'website',
            siteName: 'Meeshy',
            locale: 'fr_FR',
          }),
      });
    });

    it('should fetch metadata from API', async () => {
      const options: ShareLinkOptions = {
        type: 'affiliate',
        affiliateToken: 'abc123',
      };

      const result = await generateShareMetadata(options);

      expect(global.fetch).toHaveBeenCalled();
      expect(result.title).toBe('Custom Title');
    });

    it('should return fallback metadata when API fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const options: ShareLinkOptions = {
        type: 'default',
      };

      const result = await generateShareMetadata(options);

      expect(result.title).toContain('Meeshy');
      expect(result.siteName).toBe('Meeshy');
      expect(result.locale).toBe('fr_FR');
    });

    it('should use custom title and description in fallback', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      const options: ShareLinkOptions = {
        type: 'default',
        customTitle: 'My Custom Title',
        customDescription: 'My Custom Description',
      };

      const result = await generateShareMetadata(options);

      expect(result.title).toBe('My Custom Title');
      expect(result.description).toBe('My Custom Description');
    });

    it('should include correct parameters in API request', async () => {
      const options: ShareLinkOptions = {
        type: 'affiliate',
        affiliateToken: 'test-token',
        linkId: 'link-123',
      };

      await generateShareMetadata(options);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(fetchCall).toContain('type=affiliate');
      expect(fetchCall).toContain('affiliate=test-token');
      expect(fetchCall).toContain('linkId=link-123');
    });
  });

  describe('shareLink', () => {
    const originalNavigator = global.navigator;

    afterEach(() => {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        configurable: true,
      });
    });

    it('should use Web Share API when available', async () => {
      const mockShare = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(global, 'navigator', {
        value: { share: mockShare },
        configurable: true,
      });

      const result = await shareLink(
        'https://test.meeshy.me',
        'Test Title',
        'Test Description'
      );

      expect(mockShare).toHaveBeenCalledWith({
        title: 'Test Title',
        text: 'Test Description',
        url: 'https://test.meeshy.me',
      });
      expect(result).toBe(true);
    });

    it('should fallback to clipboard when Web Share unavailable', async () => {
      const mockWriteText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(global, 'navigator', {
        value: {
          share: undefined,
          clipboard: { writeText: mockWriteText },
        },
        configurable: true,
      });

      const result = await shareLink(
        'https://test.meeshy.me',
        'Test Title',
        'Test Description'
      );

      expect(mockWriteText).toHaveBeenCalledWith('https://test.meeshy.me');
      expect(result).toBe(false); // Returns false to indicate copy, not share
    });

    it('should handle share abort error gracefully', async () => {
      const abortError = new Error('User cancelled');
      abortError.name = 'AbortError';
      const mockShare = jest.fn().mockRejectedValue(abortError);
      Object.defineProperty(global, 'navigator', {
        value: { share: mockShare },
        configurable: true,
      });

      const result = await shareLink('https://test.meeshy.me', 'Title', 'Desc');

      expect(result).toBe(false);
    });

    it('should throw non-abort errors', async () => {
      const networkError = new Error('Network error');
      const mockShare = jest.fn().mockRejectedValue(networkError);
      Object.defineProperty(global, 'navigator', {
        value: { share: mockShare },
        configurable: true,
      });

      await expect(
        shareLink('https://test.meeshy.me', 'Title', 'Desc')
      ).rejects.toThrow('Network error');
    });
  });

  describe('validateAffiliateToken', () => {
    it('should return true for valid token', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const result = await validateAffiliateToken('valid-token');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should return false for invalid token', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      const result = await validateAffiliateToken('invalid-token');

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await validateAffiliateToken('token');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('validateConversationLink', () => {
    it('should return true for valid link', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const result = await validateConversationLink('valid-link-id');

      expect(result).toBe(true);
    });

    it('should return false for invalid link', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      const result = await validateConversationLink('invalid-link-id');

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await validateConversationLink('link-id');

      expect(result).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  describe('generateQRCodeData', () => {
    it('should return the URL for QR code generation', () => {
      const url = 'https://test.meeshy.me/join/abc123';
      const result = generateQRCodeData(url);

      expect(result).toBe(url);
    });

    it('should handle any URL format', () => {
      const url = 'https://example.com?param=value&other=123';
      const result = generateQRCodeData(url);

      expect(result).toBe(url);
    });
  });

  describe('getShareStats', () => {
    it('should return stats for valid link', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              views: 100,
              shares: 50,
              clicks: 75,
            },
          }),
      });

      const result = await getShareStats('valid-link-id');

      expect(result).toEqual({
        views: 100,
        shares: 50,
        clicks: 75,
      });
    });

    it('should return null for invalid link', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      const result = await getShareStats('invalid-link-id');

      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await getShareStats('link-id');

      expect(result).toBeNull();

      consoleSpy.mockRestore();
    });
  });

  describe('ShareLinkOptions type', () => {
    it('should accept valid options', () => {
      const affiliateOptions: ShareLinkOptions = {
        type: 'affiliate',
        affiliateToken: 'token',
      };
      expect(affiliateOptions.type).toBe('affiliate');

      const conversationOptions: ShareLinkOptions = {
        type: 'conversation',
        linkId: 'link-id',
      };
      expect(conversationOptions.type).toBe('conversation');

      const joinOptions: ShareLinkOptions = {
        type: 'join',
        linkId: 'link-id',
      };
      expect(joinOptions.type).toBe('join');

      const defaultOptions: ShareLinkOptions = {
        type: 'default',
      };
      expect(defaultOptions.type).toBe('default');
    });
  });
});

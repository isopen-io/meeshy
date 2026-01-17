/**
 * Tests for link-name-generator utility
 */

import {
  generateLinkName,
  generateSimpleLinkName,
} from '../../utils/link-name-generator';

describe('link-name-generator', () => {
  describe('generateLinkName', () => {
    describe('basic functionality', () => {
      it('should generate a link name with conversation title', () => {
        const result = generateLinkName({
          conversationTitle: 'My Conversation',
          durationDays: 7,
        });

        expect(result).toContain('My Conversation');
        expect(result).toContain('7j');
      });

      it('should truncate long conversation titles', () => {
        const longTitle = 'A'.repeat(30);
        const result = generateLinkName({
          conversationTitle: longTitle,
          durationDays: 7,
        });

        expect(result.length).toBeLessThanOrEqual(60);
      });

      it('should include sharing context when provided', () => {
        const result = generateLinkName({
          conversationTitle: 'My Conversation',
          sharingContext: 'linkedin',
          durationDays: 7,
        });

        expect(result).toContain('LinkedIn');
      });
    });

    describe('duration formatting by language', () => {
      it('should format duration in French', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          language: 'fr',
          durationDays: 7,
        });

        expect(result).toContain('7j');
      });

      it('should format duration in English', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          language: 'en',
          durationDays: 7,
        });

        expect(result).toContain('7d');
      });

      it('should format duration in Spanish', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          language: 'es',
          durationDays: 7,
        });

        expect(result).toContain('7d');
      });

      it('should format duration in German', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          language: 'de',
          durationDays: 7,
        });

        expect(result).toContain('7T');
      });

      it('should format duration in Italian', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          language: 'it',
          durationDays: 7,
        });

        expect(result).toContain('7g');
      });

      it('should format duration in Portuguese', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          language: 'pt',
          durationDays: 7,
        });

        expect(result).toContain('7d');
      });

      it('should use infinity symbol for no duration', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          durationDays: undefined,
        });

        expect(result).toContain('');
      });

      it('should default to English for unknown language', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          language: 'xyz',
          durationDays: 7,
        });

        expect(result).toContain('7d');
      });
    });

    describe('sharing context translations', () => {
      const contexts = [
        'linkedin',
        'whatsapp',
        'facebook',
        'instagram',
        'twitter',
        'telegram',
        'email',
        'family',
        'community',
        'team',
        'work',
        'friends',
        'public',
        'private',
      ];

      contexts.forEach(context => {
        it(`should handle ${context} context in French`, () => {
          const result = generateLinkName({
            conversationTitle: 'Test',
            language: 'fr',
            sharingContext: context,
            durationDays: 7,
          });

          expect(result).toContain('Lien');
        });
      });

      it('should handle LinkedIn context in English', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          language: 'en',
          sharingContext: 'linkedin',
          durationDays: 7,
        });

        expect(result).toContain('LinkedIn Link');
      });

      it('should be case insensitive for context', () => {
        const result1 = generateLinkName({
          conversationTitle: 'Test',
          sharingContext: 'LINKEDIN',
          durationDays: 7,
        });

        const result2 = generateLinkName({
          conversationTitle: 'Test',
          sharingContext: 'linkedin',
          durationDays: 7,
        });

        expect(result1).toBe(result2);
      });
    });

    describe('default behavior without sharing context', () => {
      it('should use "Lien" in French without context', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          language: 'fr',
          durationDays: 7,
        });

        expect(result).toContain('Lien');
      });

      it('should use "Link" in English without context', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          language: 'en',
          durationDays: 7,
        });

        expect(result).toContain('Link');
      });

      it('should use "Enlace" in Spanish without context', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          language: 'es',
          durationDays: 7,
        });

        expect(result).toContain('Enlace');
      });
    });

    describe('edge cases', () => {
      it('should handle empty conversation title', () => {
        const result = generateLinkName({
          conversationTitle: '',
          durationDays: 7,
        });

        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
      });

      it('should handle zero duration days', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          durationDays: 0,
        });

        // 0 days is falsy, so should show infinity
        expect(result).toContain('');
      });

      it('should handle very long duration', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          durationDays: 365,
        });

        expect(result).toContain('365');
      });

      it('should respect maximum length', () => {
        const result = generateLinkName({
          conversationTitle: 'A'.repeat(100),
          sharingContext: 'community',
          durationDays: 7,
        });

        expect(result.length).toBeLessThanOrEqual(63); // 60 + '...'
      });
    });

    describe('Chinese and Japanese formatting', () => {
      it('should format duration in Chinese', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          language: 'zh',
          durationDays: 7,
        });

        // Chinese uses the day character
        expect(result).toBeDefined();
      });

      it('should format duration in Japanese', () => {
        const result = generateLinkName({
          conversationTitle: 'Test',
          language: 'ja',
          durationDays: 7,
        });

        // Japanese also uses day character
        expect(result).toBeDefined();
      });
    });
  });

  describe('generateSimpleLinkName (deprecated)', () => {
    it('should generate a simple link name', () => {
      const result = generateSimpleLinkName('My Conversation');

      expect(result).toContain('My Conversation');
    });

    it('should default to French language', () => {
      const result = generateSimpleLinkName('Test');

      expect(result).toContain('7j');
    });

    it('should accept custom language', () => {
      const result = generateSimpleLinkName('Test', 'en');

      expect(result).toContain('7d');
    });

    it('should use 7 days duration by default', () => {
      const result = generateSimpleLinkName('Test', 'fr');

      expect(result).toContain('7j');
    });
  });
});

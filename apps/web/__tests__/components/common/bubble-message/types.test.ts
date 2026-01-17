/**
 * Tests pour les types du systeme BubbleMessage
 *
 * Ces tests verifient que les types sont correctement exportes et utilisables
 */

import type {
  BubbleMessage,
  MessageTranslation,
  MessageVersion,
  MessageSender,
  AnonymousSender,
  TranslationModel,
  MessageViewType,
  MessageViewState,
  EditMessageData,
  TranslationTier,
  LanguageOption,
  EmojiCategory,
  MessageImpactPreview
} from '@/components/common/bubble-message/types';

describe('BubbleMessage Types', () => {
  describe('Type Exports', () => {
    it('should export MessageViewType as a valid union type', () => {
      // Test that the type accepts valid values
      const validTypes: MessageViewType[] = [
        'normal',
        'reaction-selection',
        'language-selection',
        'edit',
        'delete'
      ];

      expect(validTypes).toHaveLength(5);
      validTypes.forEach(type => {
        expect(typeof type).toBe('string');
      });
    });

    it('should export MessageViewState with correct shape', () => {
      const viewState: MessageViewState = {
        activeView: 'normal',
        messageId: 'msg-123',
        conversationId: 'conv-456'
      };

      expect(viewState.activeView).toBe('normal');
      expect(viewState.messageId).toBe('msg-123');
      expect(viewState.conversationId).toBe('conv-456');
    });

    it('should export MessageViewState with nullable fields', () => {
      const viewState: MessageViewState = {
        activeView: 'edit',
        messageId: null,
        conversationId: null
      };

      expect(viewState.messageId).toBeNull();
      expect(viewState.conversationId).toBeNull();
    });

    it('should export EditMessageData with correct shape', () => {
      const editData: EditMessageData = {
        content: 'New message content',
        messageId: 'msg-789'
      };

      expect(editData.content).toBe('New message content');
      expect(editData.messageId).toBe('msg-789');
    });

    it('should export TranslationTier with correct shape', () => {
      const tier: TranslationTier = {
        id: 'basic',
        name: 'Basic Translation',
        description: 'Fast translation using basic models',
        languages: ['en', 'fr', 'es'],
        isPremium: false
      };

      expect(tier.id).toBe('basic');
      expect(tier.languages).toContain('en');
      expect(tier.isPremium).toBe(false);
    });

    it('should export TranslationTier with premium settings', () => {
      const premiumTier: TranslationTier = {
        id: 'premium',
        name: 'Premium Translation',
        description: 'High quality translation',
        languages: ['en', 'fr', 'es', 'de', 'it', 'pt'],
        isPremium: true
      };

      expect(premiumTier.id).toBe('premium');
      expect(premiumTier.isPremium).toBe(true);
      expect(premiumTier.languages.length).toBeGreaterThan(3);
    });

    it('should export LanguageOption with correct shape', () => {
      const option: LanguageOption = {
        code: 'fr',
        name: 'French',
        flag: 'FR',
        tier: 'basic'
      };

      expect(option.code).toBe('fr');
      expect(option.name).toBe('French');
      expect(option.tier).toBe('basic');
    });

    it('should export EmojiCategory with correct shape', () => {
      const category: EmojiCategory = {
        id: 'smileys',
        name: 'Smileys & Emotion',
        emojis: ['grinning', 'smile', 'heart_eyes'],
        icon: 'smile'
      };

      expect(category.id).toBe('smileys');
      expect(category.emojis).toContain('grinning');
      expect(Array.isArray(category.emojis)).toBe(true);
    });

    it('should export MessageImpactPreview with all fields', () => {
      const preview: MessageImpactPreview = {
        translations: 5,
        attachments: 2,
        reactions: 10,
        replies: 3
      };

      expect(preview.translations).toBe(5);
      expect(preview.attachments).toBe(2);
      expect(preview.reactions).toBe(10);
      expect(preview.replies).toBe(3);
    });

    it('should handle MessageImpactPreview with zero values', () => {
      const emptyPreview: MessageImpactPreview = {
        translations: 0,
        attachments: 0,
        reactions: 0,
        replies: 0
      };

      expect(emptyPreview.translations).toBe(0);
      expect(emptyPreview.attachments).toBe(0);
      expect(emptyPreview.reactions).toBe(0);
      expect(emptyPreview.replies).toBe(0);
    });
  });

  describe('TranslationModel type', () => {
    it('should accept valid translation model values', () => {
      const models: TranslationModel[] = ['basic', 'medium', 'premium'];

      expect(models).toContain('basic');
      expect(models).toContain('medium');
      expect(models).toContain('premium');
    });
  });

  describe('Type Compatibility', () => {
    it('should allow partial MessageViewState for nullable fields', () => {
      // Test that the type allows null values for optional fields
      const partialState: MessageViewState = {
        activeView: 'normal',
        messageId: null,
        conversationId: null
      };

      expect(partialState.activeView).toBeDefined();
    });

    it('should allow array of LanguageOption', () => {
      const options: LanguageOption[] = [
        { code: 'en', name: 'English', flag: 'GB', tier: 'basic' },
        { code: 'fr', name: 'French', flag: 'FR', tier: 'basic' },
        { code: 'de', name: 'German', flag: 'DE', tier: 'medium' }
      ];

      expect(options).toHaveLength(3);
      expect(options.map(o => o.code)).toEqual(['en', 'fr', 'de']);
    });

    it('should allow array of EmojiCategory', () => {
      const categories: EmojiCategory[] = [
        { id: 'recent', name: 'Recent', emojis: ['heart', 'thumbsup'], icon: 'clock' },
        { id: 'smileys', name: 'Smileys', emojis: ['smile', 'laugh'], icon: 'smile' }
      ];

      expect(categories).toHaveLength(2);
      expect(categories[0].id).toBe('recent');
    });
  });
});

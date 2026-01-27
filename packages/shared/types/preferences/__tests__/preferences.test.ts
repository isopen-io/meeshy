/**
 * Tests unitaires pour les schemas Zod de préférences
 * Vérifie la validation, les defaults, et les types
 */

import { describe, test, expect } from 'vitest';
import {
  PrivacyPreferenceSchema,
  PRIVACY_PREFERENCE_DEFAULTS,
  AudioPreferenceSchema,
  AUDIO_PREFERENCE_DEFAULTS,
  MessagePreferenceSchema,
  MESSAGE_PREFERENCE_DEFAULTS,
  NotificationPreferenceSchema,
  NOTIFICATION_PREFERENCE_DEFAULTS,
  VideoPreferenceSchema,
  VIDEO_PREFERENCE_DEFAULTS,
  DocumentPreferenceSchema,
  DOCUMENT_PREFERENCE_DEFAULTS,
  ApplicationPreferenceSchema,
  APPLICATION_PREFERENCE_DEFAULTS
} from '../index';

describe('PrivacyPreferenceSchema', () => {
  test('devrait accepter des données valides', () => {
    const valid = {
      showOnlineStatus: true,
      showLastSeen: false,
      showReadReceipts: true,
      showTypingIndicator: true,
      allowContactRequests: true,
      allowGroupInvites: false,
      allowCallsFromNonContacts: false,
      saveMediaToGallery: false,
      allowAnalytics: true,
      shareUsageData: false,
      blockScreenshots: false,
      hideProfileFromSearch: false,
      encryptionPreference: 'optional' as const,
      autoEncryptNewConversations: false,
      showEncryptionStatus: true,
      warnOnUnencrypted: false
    };

    const result = PrivacyPreferenceSchema.parse(valid);
    expect(result).toEqual(valid);
  });

  test('devrait appliquer les valeurs par défaut', () => {
    const result = PrivacyPreferenceSchema.parse({});
    expect(result).toEqual(PRIVACY_PREFERENCE_DEFAULTS);
  });

  test('devrait rejeter des types invalides', () => {
    expect(() => {
      PrivacyPreferenceSchema.parse({ showOnlineStatus: 'invalid' });
    }).toThrow();
  });

  test('devrait merger les valeurs partielles avec les defaults', () => {
    const partial = { showOnlineStatus: false };
    const result = PrivacyPreferenceSchema.parse(partial);

    expect(result.showOnlineStatus).toBe(false);
    expect(result.showLastSeen).toBe(PRIVACY_PREFERENCE_DEFAULTS.showLastSeen);
  });
});

describe('AudioPreferenceSchema', () => {
  test('devrait accepter des données valides', () => {
    const valid = {
      transcriptionEnabled: true,
      transcriptionSource: 'server' as const,
      autoTranscribeIncoming: false,
      audioTranslationEnabled: true,
      translatedAudioFormat: 'mp3' as const,
      ttsEnabled: false,
      ttsSpeed: 1.2,
      ttsPitch: 0.9,
      audioQuality: 'high' as const,
      noiseSuppression: true,
      echoCancellation: true,
      voiceProfileEnabled: false,
      voiceCloneQuality: 'balanced' as const
    };

    const result = AudioPreferenceSchema.parse(valid);
    expect(result).toEqual(valid);
  });

  test('devrait valider les enums correctement', () => {
    expect(() => {
      AudioPreferenceSchema.parse({ transcriptionSource: 'invalid' });
    }).toThrow();

    const valid = AudioPreferenceSchema.parse({ transcriptionSource: 'auto' });
    expect(valid.transcriptionSource).toBe('auto');
  });

  test('devrait valider les limites numériques', () => {
    // ttsSpeed doit être entre 0.5 et 2.0
    expect(() => {
      AudioPreferenceSchema.parse({ ttsSpeed: 3.0 });
    }).toThrow();

    expect(() => {
      AudioPreferenceSchema.parse({ ttsSpeed: 0.3 });
    }).toThrow();

    const valid = AudioPreferenceSchema.parse({ ttsSpeed: 1.5 });
    expect(valid.ttsSpeed).toBe(1.5);
  });
});

describe('MessagePreferenceSchema', () => {
  test('devrait accepter des données valides', () => {
    const valid = {
      sendOnEnter: false,
      showFormattingToolbar: true,
      enableMarkdown: true,
      enableEmoji: true,
      emojiSkinTone: 'medium' as const,
      autoCorrectEnabled: true,
      spellCheckEnabled: true,
      linkPreviewEnabled: true,
      imagePreviewEnabled: true,
      saveDrafts: true,
      draftExpirationDays: 45,
      defaultFontSize: 'large' as const,
      defaultTextAlign: 'left' as const,
      autoTranslateIncoming: false,
      autoTranslateLanguages: ['fr', 'es'],
      maxCharacterLimit: 5000
    };

    const result = MessagePreferenceSchema.parse(valid);
    expect(result).toEqual(valid);
  });

  test('devrait valider draftExpirationDays entre 1 et 90', () => {
    expect(() => {
      MessagePreferenceSchema.parse({ draftExpirationDays: 0 });
    }).toThrow();

    expect(() => {
      MessagePreferenceSchema.parse({ draftExpirationDays: 100 });
    }).toThrow();

    const valid = MessagePreferenceSchema.parse({ draftExpirationDays: 60 });
    expect(valid.draftExpirationDays).toBe(60);
  });
});

describe('NotificationPreferenceSchema', () => {
  test('devrait accepter des données valides', () => {
    const valid = {
      pushEnabled: true,
      emailEnabled: false,
      soundEnabled: true,
      vibrationEnabled: true,
      newMessageEnabled: true,
      missedCallEnabled: true,
      voicemailEnabled: true,
      systemEnabled: false,
      conversationEnabled: true,
      replyEnabled: true,
      mentionEnabled: true,
      reactionEnabled: false,
      contactRequestEnabled: true,
      groupInviteEnabled: true,
      memberJoinedEnabled: false,
      memberLeftEnabled: false,
      dndEnabled: true,
      dndStartTime: '20:00',
      dndEndTime: '07:30',
      dndDays: ['sat', 'sun'] as const,
      showPreview: true,
      showSenderName: true,
      groupNotifications: true,
      notificationBadgeEnabled: true
    };

    const result = NotificationPreferenceSchema.parse(valid);
    expect(result).toEqual(valid);
  });

  test('devrait valider le format des heures DND', () => {
    // Format invalide
    expect(() => {
      NotificationPreferenceSchema.parse({ dndStartTime: '25:00' });
    }).toThrow();

    expect(() => {
      NotificationPreferenceSchema.parse({ dndEndTime: '12:60' });
    }).toThrow();

    // Format valide
    const valid = NotificationPreferenceSchema.parse({
      dndStartTime: '23:59',
      dndEndTime: '00:00'
    });
    expect(valid.dndStartTime).toBe('23:59');
    expect(valid.dndEndTime).toBe('00:00');
  });

  test('devrait valider les jours de la semaine', () => {
    expect(() => {
      NotificationPreferenceSchema.parse({ dndDays: ['invalid'] });
    }).toThrow();

    const valid = NotificationPreferenceSchema.parse({
      dndDays: ['mon', 'wed', 'fri']
    });
    expect(valid.dndDays).toEqual(['mon', 'wed', 'fri']);
  });
});

describe('VideoPreferenceSchema', () => {
  test('devrait accepter des données valides', () => {
    const valid = {
      videoQuality: 'high' as const,
      videoBitrate: 2500,
      videoFrameRate: '30' as const,
      videoResolution: '1080p' as const,
      videoCodec: 'VP9' as const,
      mirrorLocalVideo: false,
      videoLayout: 'grid' as const,
      showSelfView: true,
      selfViewPosition: 'top-right' as const,
      backgroundBlurEnabled: true,
      virtualBackgroundEnabled: false,
      hardwareAccelerationEnabled: true,
      adaptiveBitrateEnabled: true,
      autoStartVideo: false,
      autoMuteOnJoin: true
    };

    const result = VideoPreferenceSchema.parse(valid);
    expect(result).toEqual(valid);
  });

  test('devrait valider les limites de bitrate', () => {
    expect(() => {
      VideoPreferenceSchema.parse({ videoBitrate: 50 });
    }).toThrow();

    expect(() => {
      VideoPreferenceSchema.parse({ videoBitrate: 6000 });
    }).toThrow();

    const valid = VideoPreferenceSchema.parse({ videoBitrate: 1500 });
    expect(valid.videoBitrate).toBe(1500);
  });
});

describe('DocumentPreferenceSchema', () => {
  test('devrait accepter des données valides', () => {
    const valid = {
      autoDownloadEnabled: false,
      autoDownloadOnWifi: true,
      autoDownloadMaxSize: 25,
      inlinePreviewEnabled: true,
      previewPdfEnabled: true,
      previewImagesEnabled: true,
      previewVideosEnabled: false,
      storageQuota: 10000,
      autoDeleteOldFiles: true,
      fileRetentionDays: 180,
      compressImagesOnUpload: true,
      imageCompressionQuality: 75,
      allowedFileTypes: ['image/*', 'application/pdf'],
      scanFilesForMalware: true,
      allowExternalLinks: false
    };

    const result = DocumentPreferenceSchema.parse(valid);
    expect(result).toEqual(valid);
  });

  test('devrait valider les limites de taille', () => {
    expect(() => {
      DocumentPreferenceSchema.parse({ autoDownloadMaxSize: 0 });
    }).toThrow();

    expect(() => {
      DocumentPreferenceSchema.parse({ autoDownloadMaxSize: 150 });
    }).toThrow();

    const valid = DocumentPreferenceSchema.parse({ autoDownloadMaxSize: 50 });
    expect(valid.autoDownloadMaxSize).toBe(50);
  });

  test('devrait valider fileRetentionDays entre 7 et 365', () => {
    expect(() => {
      DocumentPreferenceSchema.parse({ fileRetentionDays: 5 });
    }).toThrow();

    const valid = DocumentPreferenceSchema.parse({ fileRetentionDays: 30 });
    expect(valid.fileRetentionDays).toBe(30);
  });
});

describe('ApplicationPreferenceSchema', () => {
  test('devrait accepter des données valides', () => {
    const valid = {
      theme: 'dark' as const,
      accentColor: 'purple',
      interfaceLanguage: 'fr',
      fontSize: 'large' as const,
      fontFamily: 'roboto',
      lineHeight: 'relaxed' as const,
      compactMode: true,
      sidebarPosition: 'right' as const,
      showAvatars: false,
      animationsEnabled: false,
      reducedMotion: true,
      highContrastMode: true,
      screenReaderOptimized: true,
      keyboardShortcutsEnabled: true,
      tutorialsCompleted: ['onboarding', 'messaging'],
      betaFeaturesEnabled: true,
      telemetryEnabled: false
    };

    const result = ApplicationPreferenceSchema.parse(valid);
    expect(result).toEqual(valid);
  });

  test('devrait valider les enums de thème', () => {
    expect(() => {
      ApplicationPreferenceSchema.parse({ theme: 'invalid' });
    }).toThrow();

    const themes = ['light', 'dark', 'auto'];
    themes.forEach((theme) => {
      const result = ApplicationPreferenceSchema.parse({ theme });
      expect(result.theme).toBe(theme);
    });
  });

  test('devrait supporter les tutorialsCompleted comme array', () => {
    const valid = ApplicationPreferenceSchema.parse({
      tutorialsCompleted: ['tutorial1', 'tutorial2', 'tutorial3']
    });
    expect(valid.tutorialsCompleted).toHaveLength(3);
  });
});

describe('Schema.partial() pour updates partiels', () => {
  test('PrivacyPreferenceSchema.partial() devrait accepter un sous-ensemble', () => {
    const partial = PrivacyPreferenceSchema.partial().parse({
      showOnlineStatus: false
    });

    expect(partial.showOnlineStatus).toBe(false);
    expect(partial.showLastSeen).toBeUndefined();
  });

  test('NotificationPreferenceSchema.partial() devrait accepter plusieurs champs', () => {
    const partial = NotificationPreferenceSchema.partial().parse({
      pushEnabled: false,
      dndEnabled: true,
      dndStartTime: '21:00'
    });

    expect(partial.pushEnabled).toBe(false);
    expect(partial.dndEnabled).toBe(true);
    expect(partial.dndStartTime).toBe('21:00');
  });
});

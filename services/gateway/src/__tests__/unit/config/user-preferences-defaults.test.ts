/**
 * user-preferences-defaults.ts — unit tests
 *
 * Covers all exported constants, factory functions, and validators.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  USER_PREFERENCES_DEFAULTS,
  VALID_FONTS,
  VALID_THEMES,
  VALID_FONT_SIZES,
  VALID_MEDIA_QUALITY,
  VALID_AUTO_DOWNLOAD,
  CONVERSATION_PREFERENCES_DEFAULTS,
  COMMUNITY_PREFERENCES_DEFAULTS,
  NOTIFICATION_PREFERENCES_DEFAULTS,
  createDefaultNotificationPreferences,
  isValidDndTime,
  createDefaultConversationPreferences,
  createDefaultCommunityPreferences,
  isValidFont,
  validatePreferenceValue,
  getDefaultUserPreference,
  getAllDefaultUserPreferences,
  PRIVACY_PREFERENCES_DEFAULTS,
  PRIVACY_KEY_MAPPING,
  PRIVACY_KEY_REVERSE_MAPPING,
} from '../../../config/user-preferences-defaults';

// ─── Constants ────────────────────────────────────────────────────────────────

describe('USER_PREFERENCES_DEFAULTS', () => {
  it('contains expected keys with value and valueType', () => {
    expect(USER_PREFERENCES_DEFAULTS['theme']).toEqual({
      value: 'system',
      valueType: 'string',
      description: expect.any(String),
    });
    expect(USER_PREFERENCES_DEFAULTS['language']).toEqual({
      value: 'fr',
      valueType: 'string',
      description: expect.any(String),
    });
  });

  it('has boolean defaults stored as string "true"/"false"', () => {
    expect(USER_PREFERENCES_DEFAULTS['notifications-enabled']?.value).toBe('true');
    expect(USER_PREFERENCES_DEFAULTS['save-media-to-gallery']?.value).toBe('false');
  });
});

describe('VALID_FONTS', () => {
  it('includes inter and several other fonts', () => {
    expect(VALID_FONTS).toContain('inter');
    expect(VALID_FONTS.length).toBeGreaterThan(3);
  });
});

describe('VALID_THEMES', () => {
  it('contains light, dark, system', () => {
    expect(VALID_THEMES).toContain('light');
    expect(VALID_THEMES).toContain('dark');
    expect(VALID_THEMES).toContain('system');
  });
});

describe('VALID_FONT_SIZES', () => {
  it('contains small, medium, large', () => {
    expect(VALID_FONT_SIZES).toContain('small');
    expect(VALID_FONT_SIZES).toContain('medium');
    expect(VALID_FONT_SIZES).toContain('large');
  });
});

describe('VALID_MEDIA_QUALITY', () => {
  it('contains low, medium, high', () => {
    expect(VALID_MEDIA_QUALITY).toContain('low');
    expect(VALID_MEDIA_QUALITY).toContain('medium');
    expect(VALID_MEDIA_QUALITY).toContain('high');
  });
});

describe('VALID_AUTO_DOWNLOAD', () => {
  it('contains wifi, always, never', () => {
    expect(VALID_AUTO_DOWNLOAD).toContain('wifi');
    expect(VALID_AUTO_DOWNLOAD).toContain('always');
    expect(VALID_AUTO_DOWNLOAD).toContain('never');
  });
});

// ─── CONVERSATION_PREFERENCES_DEFAULTS ───────────────────────────────────────

describe('CONVERSATION_PREFERENCES_DEFAULTS', () => {
  it('has safe defaults: not pinned, not muted, empty tags', () => {
    expect(CONVERSATION_PREFERENCES_DEFAULTS.isPinned).toBe(false);
    expect(CONVERSATION_PREFERENCES_DEFAULTS.isMuted).toBe(false);
    expect(CONVERSATION_PREFERENCES_DEFAULTS.isArchived).toBe(false);
    expect(CONVERSATION_PREFERENCES_DEFAULTS.tags).toEqual([]);
    expect(CONVERSATION_PREFERENCES_DEFAULTS.categoryId).toBeNull();
    expect(CONVERSATION_PREFERENCES_DEFAULTS.deletedForUserAt).toBeNull();
  });
});

// ─── COMMUNITY_PREFERENCES_DEFAULTS ──────────────────────────────────────────

describe('COMMUNITY_PREFERENCES_DEFAULTS', () => {
  it('has notificationLevel all by default', () => {
    expect(COMMUNITY_PREFERENCES_DEFAULTS.notificationLevel).toBe('all');
    expect(COMMUNITY_PREFERENCES_DEFAULTS.isPinned).toBe(false);
    expect(COMMUNITY_PREFERENCES_DEFAULTS.isHidden).toBe(false);
  });
});

// ─── NOTIFICATION_PREFERENCES_DEFAULTS ───────────────────────────────────────

describe('NOTIFICATION_PREFERENCES_DEFAULTS', () => {
  it('has push, email, sound enabled by default', () => {
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.pushEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.emailEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.soundEnabled).toBe(true);
  });

  it('has DND disabled by default with null times', () => {
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.dndEnabled).toBe(false);
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.dndStartTime).toBeNull();
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.dndEndTime).toBeNull();
  });
});

// ─── PRIVACY_PREFERENCES_DEFAULTS ────────────────────────────────────────────

describe('PRIVACY_PREFERENCES_DEFAULTS', () => {
  it('shows online status and last seen by default', () => {
    expect(PRIVACY_PREFERENCES_DEFAULTS.showOnlineStatus).toBe(true);
    expect(PRIVACY_PREFERENCES_DEFAULTS.showLastSeen).toBe(true);
  });

  it('save-media-to-gallery is false (privacy-safe default)', () => {
    expect(PRIVACY_PREFERENCES_DEFAULTS.saveMediaToGallery).toBe(false);
  });
});

// ─── PRIVACY_KEY_MAPPING ─────────────────────────────────────────────────────

describe('PRIVACY_KEY_MAPPING', () => {
  it('maps camelCase keys to kebab-case database keys', () => {
    expect(PRIVACY_KEY_MAPPING.showOnlineStatus).toBe('show-online-status');
    expect(PRIVACY_KEY_MAPPING.allowAnalytics).toBe('allow-analytics');
  });
});

describe('PRIVACY_KEY_REVERSE_MAPPING', () => {
  it('maps kebab-case back to camelCase', () => {
    expect(PRIVACY_KEY_REVERSE_MAPPING['show-online-status']).toBe('showOnlineStatus');
    expect(PRIVACY_KEY_REVERSE_MAPPING['save-media-to-gallery']).toBe('saveMediaToGallery');
  });

  it('is the inverse of PRIVACY_KEY_MAPPING for all keys', () => {
    for (const [camel, kebab] of Object.entries(PRIVACY_KEY_MAPPING)) {
      expect(PRIVACY_KEY_REVERSE_MAPPING[kebab]).toBe(camel);
    }
  });
});

// ─── createDefaultNotificationPreferences ────────────────────────────────────

describe('createDefaultNotificationPreferences', () => {
  it('returns default notification prefs merged with userId', () => {
    const prefs = createDefaultNotificationPreferences('user-42');
    expect(prefs.userId).toBe('user-42');
    expect(prefs.pushEnabled).toBe(true);
    expect(prefs.dndEnabled).toBe(false);
    expect(prefs.newMessageEnabled).toBe(true);
    expect(prefs.reactionEnabled).toBe(true);
  });
});

// ─── isValidDndTime ───────────────────────────────────────────────────────────

describe('isValidDndTime', () => {
  it('accepts valid HH:MM times', () => {
    expect(isValidDndTime('00:00')).toBe(true);
    expect(isValidDndTime('09:30')).toBe(true);
    expect(isValidDndTime('23:59')).toBe(true);
    expect(isValidDndTime('12:00')).toBe(true);
  });

  it('rejects invalid formats', () => {
    expect(isValidDndTime('24:00')).toBe(false);  // hour out of range
    expect(isValidDndTime('23:60')).toBe(false);  // minute out of range
    expect(isValidDndTime('9:30')).toBe(false);   // missing leading zero
    expect(isValidDndTime('09:3')).toBe(false);   // missing leading zero
    expect(isValidDndTime('')).toBe(false);
    expect(isValidDndTime('noon')).toBe(false);
    expect(isValidDndTime('09:30:00')).toBe(false); // seconds not allowed
  });

  it('boundary: 19:00 and 20:00 are valid', () => {
    expect(isValidDndTime('19:00')).toBe(true);
    expect(isValidDndTime('20:00')).toBe(true);
  });
});

// ─── createDefaultConversationPreferences ────────────────────────────────────

describe('createDefaultConversationPreferences', () => {
  it('merges userId and conversationId with defaults', () => {
    const prefs = createDefaultConversationPreferences('user-1', 'conv-1');
    expect(prefs.userId).toBe('user-1');
    expect(prefs.conversationId).toBe('conv-1');
    expect(prefs.isPinned).toBe(false);
    expect(prefs.tags).toEqual([]);
  });
});

// ─── createDefaultCommunityPreferences ───────────────────────────────────────

describe('createDefaultCommunityPreferences', () => {
  it('merges userId and communityId with defaults', () => {
    const prefs = createDefaultCommunityPreferences('user-2', 'community-3');
    expect(prefs.userId).toBe('user-2');
    expect(prefs.communityId).toBe('community-3');
    expect(prefs.notificationLevel).toBe('all');
    expect(prefs.isHidden).toBe(false);
  });
});

// ─── isValidFont ──────────────────────────────────────────────────────────────

describe('isValidFont', () => {
  it('returns true for known fonts', () => {
    expect(isValidFont('inter')).toBe(true);
    expect(isValidFont('roboto')).toBe(true);
    expect(isValidFont('nunito')).toBe(true);
  });

  it('returns false for unknown fonts', () => {
    expect(isValidFont('comic-sans')).toBe(false);
    expect(isValidFont('')).toBe(false);
    expect(isValidFont('Arial')).toBe(false);
  });
});

// ─── validatePreferenceValue ──────────────────────────────────────────────────

describe('validatePreferenceValue', () => {
  describe('font-family', () => {
    it('returns valid for a known font', () => {
      expect(validatePreferenceValue('font-family', 'inter')).toEqual({ valid: true });
    });

    it('returns error for an unknown font', () => {
      const result = validatePreferenceValue('font-family', 'wingdings');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('inter');
    });
  });

  describe('theme', () => {
    it('returns valid for light/dark/system', () => {
      expect(validatePreferenceValue('theme', 'light')).toEqual({ valid: true });
      expect(validatePreferenceValue('theme', 'dark')).toEqual({ valid: true });
      expect(validatePreferenceValue('theme', 'system')).toEqual({ valid: true });
    });

    it('returns error for unknown theme', () => {
      const result = validatePreferenceValue('theme', 'auto');
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('font-size', () => {
    it('returns valid for small/medium/large', () => {
      expect(validatePreferenceValue('font-size', 'medium')).toEqual({ valid: true });
    });

    it('returns error for invalid size', () => {
      const result = validatePreferenceValue('font-size', 'huge');
      expect(result.valid).toBe(false);
    });
  });

  describe('media-quality', () => {
    it('returns valid for low/medium/high', () => {
      expect(validatePreferenceValue('media-quality', 'high')).toEqual({ valid: true });
    });

    it('returns error for invalid quality', () => {
      const result = validatePreferenceValue('media-quality', 'ultra');
      expect(result.valid).toBe(false);
    });
  });

  describe('auto-download-media', () => {
    it('returns valid for wifi/always/never', () => {
      expect(validatePreferenceValue('auto-download-media', 'wifi')).toEqual({ valid: true });
      expect(validatePreferenceValue('auto-download-media', 'never')).toEqual({ valid: true });
    });

    it('returns error for invalid option', () => {
      const result = validatePreferenceValue('auto-download-media', 'sometimes');
      expect(result.valid).toBe(false);
    });
  });

  describe('unknown key', () => {
    it('returns valid for any value (no validation rule)', () => {
      expect(validatePreferenceValue('enter-to-send', 'true')).toEqual({ valid: true });
      expect(validatePreferenceValue('unknown-pref', 'anything')).toEqual({ valid: true });
    });
  });
});

// ─── getDefaultUserPreference ─────────────────────────────────────────────────

describe('getDefaultUserPreference', () => {
  it('returns value and valueType for a known key', () => {
    const pref = getDefaultUserPreference('theme');
    expect(pref).toEqual({ value: 'system', valueType: 'string' });
  });

  it('returns null for an unknown key', () => {
    expect(getDefaultUserPreference('nonexistent-key')).toBeNull();
  });
});

// ─── getAllDefaultUserPreferences ─────────────────────────────────────────────

describe('getAllDefaultUserPreferences', () => {
  it('returns an array with key, value, valueType, description for each preference', () => {
    const all = getAllDefaultUserPreferences();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(10);
    const themeEntry = all.find((p) => p.key === 'theme');
    expect(themeEntry).toBeDefined();
    expect(themeEntry?.value).toBe('system');
    expect(themeEntry?.description).toBeTruthy();
  });

  it('each entry has the required fields', () => {
    const all = getAllDefaultUserPreferences();
    for (const pref of all) {
      expect(pref).toHaveProperty('key');
      expect(pref).toHaveProperty('value');
      expect(pref).toHaveProperty('valueType');
      expect(pref).toHaveProperty('description');
    }
  });
});

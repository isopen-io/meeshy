/**
 * Tests for utils/audio-effects-config.ts
 */

import {
  LANGUAGE_NAMES,
  EFFECT_NAMES,
  PARAMETER_NAMES,
  EFFECT_COLORS,
  EFFECT_TAB_CLASSES,
  EFFECT_ICONS,
  CURVE_COLORS,
  getParameterName,
  getEffectName,
  getEffectColor,
  getEffectIcon,
} from '@/utils/audio-effects-config';

// ─── constants ───────────────────────────────────────────────────────────────

describe('LANGUAGE_NAMES', () => {
  it('contains expected language codes', () => {
    expect(LANGUAGE_NAMES['fr']).toBe('Français');
    expect(LANGUAGE_NAMES['en']).toBe('English');
    expect(LANGUAGE_NAMES['es']).toBe('Español');
    expect(LANGUAGE_NAMES['original']).toBe('Original');
  });

  it('covers all supported language codes', () => {
    const expectedCodes = ['original', 'fr', 'en', 'es', 'pt', 'de', 'it', 'zh', 'ja', 'ko', 'ar', 'ru'];
    expectedCodes.forEach(code => {
      expect(LANGUAGE_NAMES[code]).toBeTruthy();
    });
  });
});

describe('EFFECT_NAMES', () => {
  it('maps all audio effect types', () => {
    expect(EFFECT_NAMES['voice-coder']).toBe('Voice Coder');
    expect(EFFECT_NAMES['baby-voice']).toBe('Baby Voice');
    expect(EFFECT_NAMES['demon-voice']).toBe('Demon Voice');
    expect(EFFECT_NAMES['back-sound']).toBe('Background Sound');
    expect(EFFECT_NAMES['overview']).toBeDefined();
  });
});

describe('PARAMETER_NAMES', () => {
  it('maps common parameter keys', () => {
    expect(PARAMETER_NAMES['pitch']).toBeTruthy();
    expect(PARAMETER_NAMES['volume']).toBeTruthy();
    expect(PARAMETER_NAMES['reverb']).toBeTruthy();
  });

  it('contains at least 10 parameter mappings', () => {
    expect(Object.keys(PARAMETER_NAMES).length).toBeGreaterThanOrEqual(10);
  });
});

describe('EFFECT_COLORS', () => {
  it('has a hex color for each effect', () => {
    const effects = ['voice-coder', 'baby-voice', 'demon-voice', 'back-sound'] as const;
    effects.forEach(effect => {
      expect(EFFECT_COLORS[effect]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

describe('EFFECT_TAB_CLASSES', () => {
  it('includes overview and all effect types', () => {
    expect(EFFECT_TAB_CLASSES['overview']).toBeTruthy();
    expect(EFFECT_TAB_CLASSES['voice-coder']).toBeTruthy();
    expect(EFFECT_TAB_CLASSES['baby-voice']).toBeTruthy();
    expect(EFFECT_TAB_CLASSES['demon-voice']).toBeTruthy();
    expect(EFFECT_TAB_CLASSES['back-sound']).toBeTruthy();
  });

  it('all classes contain data-[state=active] selectors', () => {
    Object.values(EFFECT_TAB_CLASSES).forEach(cls => {
      expect(cls).toContain('data-[state=active]');
    });
  });
});

describe('EFFECT_ICONS', () => {
  it('has an icon component for each effect type', () => {
    const effects = ['voice-coder', 'baby-voice', 'demon-voice', 'back-sound'] as const;
    effects.forEach(effect => {
      expect(EFFECT_ICONS[effect]).toBeDefined();
    });
  });
});

describe('CURVE_COLORS', () => {
  it('contains multiple hex colors', () => {
    expect(CURVE_COLORS.length).toBeGreaterThanOrEqual(4);
    CURVE_COLORS.forEach(color => {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

// ─── getParameterName ─────────────────────────────────────────────────────────

describe('getParameterName', () => {
  it('returns translated name for known keys', () => {
    expect(getParameterName('pitch')).toBeTruthy();
    expect(getParameterName('pitch')).not.toBe('pitch');
  });

  it('returns the key itself for unknown parameters', () => {
    expect(getParameterName('unknownParam')).toBe('unknownParam');
  });

  it('handles empty string', () => {
    expect(getParameterName('')).toBe('');
  });
});

// ─── getEffectName ────────────────────────────────────────────────────────────

describe('getEffectName', () => {
  it('returns display name for known effects', () => {
    expect(getEffectName('voice-coder')).toBe('Voice Coder');
    expect(getEffectName('baby-voice')).toBe('Baby Voice');
    expect(getEffectName('overview')).toBeTruthy();
  });

  it('returns the effect key itself for unknown effect', () => {
    expect(getEffectName('unknown-effect' as any)).toBe('unknown-effect');
  });
});

// ─── getEffectColor ───────────────────────────────────────────────────────────

describe('getEffectColor', () => {
  it('returns hex color for known effects', () => {
    const color = getEffectColor('voice-coder');
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('returns fallback black for unknown effects', () => {
    expect(getEffectColor('unknown' as any)).toBe('#000000');
  });
});

// ─── getEffectIcon ────────────────────────────────────────────────────────────

describe('getEffectIcon', () => {
  it('returns a component for each known effect', () => {
    const effects = ['voice-coder', 'baby-voice', 'demon-voice', 'back-sound'] as const;
    effects.forEach(effect => {
      expect(getEffectIcon(effect)).toBeDefined();
    });
  });
});

/**
 * Tests for utils/translation-persistence.ts
 */

import {
  saveMessageTranslations,
  loadMessageTranslations,
  removeMessageTranslations,
  cleanupExpiredTranslations,
  loadAllMessageTranslations,
} from '@/utils/translation-persistence';

const STORAGE_KEY_PREFIX = 'meeshy_message_translations_';

const makeTranslation = (lang: string = 'fr'): any => ({
  id: `t-${lang}`,
  targetLanguage: lang,
  translatedContent: `Bonjour (${lang})`,
  messageId: 'msg-1',
});

const setStoredData = (messageId: string, data: object) => {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${messageId}`, JSON.stringify(data));
};

beforeEach(() => {
  localStorage.clear();
});

// ─── saveMessageTranslations ──────────────────────────────────────────────────

describe('saveMessageTranslations', () => {
  it('writes a JSON entry to localStorage', () => {
    const translations = [makeTranslation('fr')];
    saveMessageTranslations('msg-1', translations);
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}msg-1`);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.messageId).toBe('msg-1');
    expect(parsed.translations).toHaveLength(1);
  });

  it('defaults showingOriginal to true', () => {
    saveMessageTranslations('msg-2', []);
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}msg-2`);
    const parsed = JSON.parse(raw!);
    expect(parsed.showingOriginal).toBe(true);
  });

  it('persists explicit showingOriginal=false', () => {
    saveMessageTranslations('msg-3', [], false);
    const parsed = JSON.parse(localStorage.getItem(`${STORAGE_KEY_PREFIX}msg-3`)!);
    expect(parsed.showingOriginal).toBe(false);
  });

  it('records a lastUpdated ISO timestamp', () => {
    saveMessageTranslations('msg-4', []);
    const parsed = JSON.parse(localStorage.getItem(`${STORAGE_KEY_PREFIX}msg-4`)!);
    expect(typeof parsed.lastUpdated).toBe('string');
    expect(() => new Date(parsed.lastUpdated)).not.toThrow();
  });
});

// ─── loadMessageTranslations ──────────────────────────────────────────────────

describe('loadMessageTranslations', () => {
  it('returns null when no entry exists', () => {
    expect(loadMessageTranslations('nonexistent')).toBeNull();
  });

  it('returns translations and showingOriginal for fresh data', () => {
    const translations = [makeTranslation('en')];
    saveMessageTranslations('msg-5', translations, false);
    const result = loadMessageTranslations('msg-5');
    expect(result).not.toBeNull();
    expect(result!.translations).toHaveLength(1);
    expect(result!.showingOriginal).toBe(false);
  });

  it('returns null and removes entry for data older than 7 days', () => {
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    setStoredData('msg-old', {
      messageId: 'msg-old',
      translations: [],
      showingOriginal: true,
      lastUpdated: oldDate,
    });
    const result = loadMessageTranslations('msg-old');
    expect(result).toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEY_PREFIX}msg-old`)).toBeNull();
  });

  it('returns null for corrupted JSON', () => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}msg-corrupt`, 'not-json{');
    expect(loadMessageTranslations('msg-corrupt')).toBeNull();
  });

  it('defaults translations to [] when missing from stored data', () => {
    setStoredData('msg-no-arr', {
      messageId: 'msg-no-arr',
      showingOriginal: true,
      lastUpdated: new Date().toISOString(),
    });
    const result = loadMessageTranslations('msg-no-arr');
    expect(result!.translations).toEqual([]);
  });
});

// ─── removeMessageTranslations ────────────────────────────────────────────────

describe('removeMessageTranslations', () => {
  it('removes the entry from localStorage', () => {
    saveMessageTranslations('msg-remove', []);
    removeMessageTranslations('msg-remove');
    expect(localStorage.getItem(`${STORAGE_KEY_PREFIX}msg-remove`)).toBeNull();
  });

  it('does not throw when entry does not exist', () => {
    expect(() => removeMessageTranslations('nonexistent')).not.toThrow();
  });
});

// ─── cleanupExpiredTranslations ───────────────────────────────────────────────

describe('cleanupExpiredTranslations', () => {
  it('removes expired entries (> 7 days old)', () => {
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    setStoredData('msg-exp1', { translations: [], showingOriginal: true, lastUpdated: oldDate });
    cleanupExpiredTranslations();
    expect(localStorage.getItem(`${STORAGE_KEY_PREFIX}msg-exp1`)).toBeNull();
  });

  it('keeps fresh entries (< 7 days old)', () => {
    saveMessageTranslations('msg-fresh', []);
    cleanupExpiredTranslations();
    expect(localStorage.getItem(`${STORAGE_KEY_PREFIX}msg-fresh`)).not.toBeNull();
  });

  it('removes corrupted entries', () => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}corrupt`, 'INVALID_JSON');
    cleanupExpiredTranslations();
    expect(localStorage.getItem(`${STORAGE_KEY_PREFIX}corrupt`)).toBeNull();
  });

  it('ignores unrelated localStorage keys', () => {
    localStorage.setItem('some_other_key', 'value');
    cleanupExpiredTranslations();
    expect(localStorage.getItem('some_other_key')).toBe('value');
  });
});

// ─── loadAllMessageTranslations ───────────────────────────────────────────────

describe('loadAllMessageTranslations', () => {
  it('returns an empty Map for empty input', () => {
    const result = loadAllMessageTranslations([]);
    expect(result.size).toBe(0);
  });

  it('returns a Map with entries for existing messages', () => {
    saveMessageTranslations('m1', [makeTranslation('fr')]);
    saveMessageTranslations('m2', [makeTranslation('en')]);
    const result = loadAllMessageTranslations(['m1', 'm2']);
    expect(result.size).toBe(2);
    expect(result.get('m1')!.translations).toHaveLength(1);
  });

  it('skips missing message IDs without throwing', () => {
    saveMessageTranslations('m3', []);
    const result = loadAllMessageTranslations(['m3', 'missing']);
    expect(result.size).toBe(1);
    expect(result.has('m3')).toBe(true);
    expect(result.has('missing')).toBe(false);
  });
});

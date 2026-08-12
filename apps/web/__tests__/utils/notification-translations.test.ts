import {
  buildMultilingualNotificationMessage,
  getNotificationTitle,
  getNotificationIcon,
  getToastDuration,
  hasValidTranslations,
  formatTranslationsForNotification,
} from '@/utils/notification-translations';
import type { NotificationTranslations } from '@/utils/notification-translations';

// ── buildMultilingualNotificationMessage ───────────────────────────────────────

describe('buildMultilingualNotificationMessage', () => {
  it('returns truncated content when no translations provided', () => {
    const result = buildMultilingualNotificationMessage('Hello world', undefined);
    expect(result).toBe('Hello world');
  });

  it('truncates content longer than 30 chars with ellipsis', () => {
    const longContent = 'A'.repeat(40);
    const result = buildMultilingualNotificationMessage(longContent, undefined);
    expect(result).toBe('A'.repeat(30) + '...');
  });

  it('does not add ellipsis for content exactly 30 chars', () => {
    const content = 'A'.repeat(30);
    const result = buildMultilingualNotificationMessage(content, undefined);
    expect(result).toBe('A'.repeat(30));
  });

  it('does not add ellipsis for content shorter than 30 chars', () => {
    const result = buildMultilingualNotificationMessage('Short', undefined);
    expect(result).toBe('Short');
  });

  it('returns plain base message when translations object has all undefined languages', () => {
    const result = buildMultilingualNotificationMessage('Hello', {});
    expect(result).toBe('Hello');
  });

  it('includes French flag prefix and english translation when en provided', () => {
    const result = buildMultilingualNotificationMessage('Bonjour', { en: 'Hello' });
    expect(result).toContain('🇫🇷 Bonjour');
    expect(result).toContain('🇺🇸 Hello');
  });

  it('includes Spanish translation when es provided', () => {
    const result = buildMultilingualNotificationMessage('Bonjour', { es: 'Hola' });
    expect(result).toContain('🇪🇸 Hola');
  });

  it('includes all translations when fr, en, es all provided', () => {
    const translations: NotificationTranslations = { fr: 'Bonjour', en: 'Hello', es: 'Hola' };
    const result = buildMultilingualNotificationMessage('Content', translations);
    expect(result).toContain('🇫🇷');
    expect(result).toContain('🇺🇸 Hello');
    expect(result).toContain('🇪🇸 Hola');
  });

  it('truncates translation text longer than 30 chars', () => {
    const longEn = 'E'.repeat(40);
    const result = buildMultilingualNotificationMessage('Content', { en: longEn });
    expect(result).toContain('E'.repeat(30) + '...');
  });

  it('joins multiple translations with newlines', () => {
    const result = buildMultilingualNotificationMessage('Content', { en: 'Hello', es: 'Hola' });
    expect(result.split('\n').length).toBeGreaterThan(1);
  });
});

// ── getNotificationTitle ───────────────────────────────────────────────────────

describe('getNotificationTitle', () => {
  it('returns direct message title for "direct" conversation type', () => {
    expect(getNotificationTitle('direct', 'Alice')).toBe('Message direct de Alice');
  });

  it('returns group message title for "group" conversation type', () => {
    expect(getNotificationTitle('group', 'Bob')).toBe('Message de groupe de Bob');
  });

  it('returns public message title for "public" conversation type', () => {
    expect(getNotificationTitle('public', 'Carol')).toBe('Message public de Carol');
  });

  it('returns global message title for "global" conversation type', () => {
    expect(getNotificationTitle('global', 'Dave')).toBe('Message global de Dave');
  });

  it('returns generic new message title for unknown conversation type', () => {
    expect(getNotificationTitle('unknown', 'Eve')).toBe('Nouveau message de Eve');
  });

  it('uses provided sender name in title', () => {
    const title = getNotificationTitle('direct', 'Jean-Charles');
    expect(title).toContain('Jean-Charles');
  });
});

// ── getNotificationIcon ────────────────────────────────────────────────────────

describe('getNotificationIcon', () => {
  it('returns chat emoji for "direct" type', () => {
    expect(getNotificationIcon('direct')).toBe('💬');
  });

  it('returns group emoji for "group" type', () => {
    expect(getNotificationIcon('group')).toBe('👥');
  });

  it('returns globe emoji for "public" type', () => {
    expect(getNotificationIcon('public')).toBe('🌐');
  });

  it('returns earth emoji for "global" type', () => {
    expect(getNotificationIcon('global')).toBe('🌍');
  });

  it('returns default chat emoji for unknown type', () => {
    expect(getNotificationIcon('other')).toBe('💬');
  });
});

// ── getToastDuration ──────────────────────────────────────────────────────────

describe('getToastDuration', () => {
  it('returns 6000ms when hasTranslations is true', () => {
    expect(getToastDuration(true)).toBe(6000);
  });

  it('returns 4000ms when hasTranslations is false', () => {
    expect(getToastDuration(false)).toBe(4000);
  });
});

// ── hasValidTranslations ──────────────────────────────────────────────────────

describe('hasValidTranslations', () => {
  it('returns false when translations is undefined', () => {
    expect(hasValidTranslations(undefined)).toBe(false);
  });

  it('returns false when translations is empty object', () => {
    expect(hasValidTranslations({})).toBe(false);
  });

  it('returns true when fr translation present', () => {
    expect(hasValidTranslations({ fr: 'Bonjour' })).toBe(true);
  });

  it('returns true when en translation present', () => {
    expect(hasValidTranslations({ en: 'Hello' })).toBe(true);
  });

  it('returns true when es translation present', () => {
    expect(hasValidTranslations({ es: 'Hola' })).toBe(true);
  });

  it('returns true when multiple translations present', () => {
    expect(hasValidTranslations({ fr: 'Bonjour', en: 'Hello' })).toBe(true);
  });
});

// ── formatTranslationsForNotification ────────────────────────────────────────

describe('formatTranslationsForNotification', () => {
  it('returns empty array when no translations set', () => {
    expect(formatTranslationsForNotification({})).toEqual([]);
  });

  it('formats fr translation with French flag', () => {
    const result = formatTranslationsForNotification({ fr: 'Bonjour' });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('🇫🇷');
    expect(result[0]).toContain('Bonjour');
  });

  it('formats en translation with US flag', () => {
    const result = formatTranslationsForNotification({ en: 'Hello' });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('🇺🇸');
    expect(result[0]).toContain('Hello');
  });

  it('formats es translation with Spanish flag', () => {
    const result = formatTranslationsForNotification({ es: 'Hola' });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('🇪🇸');
    expect(result[0]).toContain('Hola');
  });

  it('returns all three when fr, en, es all provided', () => {
    const result = formatTranslationsForNotification({ fr: 'Bonjour', en: 'Hello', es: 'Hola' });
    expect(result).toHaveLength(3);
  });

  it('truncates translation text at 30 chars with ellipsis', () => {
    const longText = 'X'.repeat(40);
    const result = formatTranslationsForNotification({ en: longText });
    expect(result[0]).toContain('X'.repeat(30) + '...');
  });

  it('does not truncate text at exactly 30 chars', () => {
    const text = 'Y'.repeat(30);
    const result = formatTranslationsForNotification({ fr: text });
    expect(result[0]).not.toContain('...');
  });
});

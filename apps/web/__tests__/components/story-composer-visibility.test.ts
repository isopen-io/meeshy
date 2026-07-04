import { VISIBILITY_OPTIONS } from '@/components/v2/StoryComposer';
import { isAudienceIncomplete } from '@/components/v2/AudienceUserPicker';

describe('StoryComposer visibility options (W3)', () => {
  it('offers the 6 PostVisibility values in selector order (iOS parity)', () => {
    expect(VISIBILITY_OPTIONS.map((o) => o.id)).toEqual([
      'PUBLIC',
      'FRIENDS',
      'COMMUNITY',
      'EXCEPT',
      'ONLY',
      'PRIVATE',
    ]);
  });

  it('blocks publishing EXCEPT/ONLY without a selected audience (W6 guard)', () => {
    // EXCEPT sans exclus / ONLY sans inclus = visibilité cassée côté serveur.
    expect(isAudienceIncomplete('EXCEPT', 0)).toBe(true);
    expect(isAudienceIncomplete('ONLY', 0)).toBe(true);
    expect(isAudienceIncomplete('EXCEPT', 2)).toBe(false);
    expect(isAudienceIncomplete('ONLY', 1)).toBe(false);
    expect(isAudienceIncomplete('PUBLIC', 0)).toBe(false);
    expect(isAudienceIncomplete('COMMUNITY', 0)).toBe(false);
  });

  it('has a locale label for every option in the 4 supported languages', () => {
    const findBlock = (node: unknown): Record<string, string> | null => {
      if (node && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        if (record.storyVisibility) return record.storyVisibility as Record<string, string>;
        for (const value of Object.values(record)) {
          const found = findBlock(value);
          if (found) return found;
        }
      }
      return null;
    };
    for (const lang of ['en', 'fr', 'es', 'pt']) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const common = require(`../../locales/${lang}/common.json`);
      const block = findBlock(common);
      for (const opt of VISIBILITY_OPTIONS) {
        const key = opt.labelKey.split('.').pop() as string;
        expect(block?.[key]).toBeTruthy();
      }
    }
  });
});

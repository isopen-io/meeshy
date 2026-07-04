import { VISIBILITY_OPTIONS } from '@/components/v2/StoryComposer';

describe('StoryComposer visibility options (W3 inc.1)', () => {
  it('offers COMMUNITY alongside the historic options, in selector order', () => {
    expect(VISIBILITY_OPTIONS.map((o) => o.id)).toEqual([
      'PUBLIC',
      'FRIENDS',
      'COMMUNITY',
      'PRIVATE',
    ]);
  });

  it('does not offer EXCEPT/ONLY until the audience picker exists', () => {
    // Publier EXCEPT/ONLY sans `visibilityUserIds` produit une visibilité
    // cassée (trou constaté sur PostComposer, consigné au backlog story-sota).
    // Ces options n'entrent dans le sélecteur qu'avec le picker (W3 inc.2).
    const ids = VISIBILITY_OPTIONS.map((o) => o.id) as string[];
    expect(ids).not.toContain('EXCEPT');
    expect(ids).not.toContain('ONLY');
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

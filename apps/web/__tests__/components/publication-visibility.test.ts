/**
 * Loi produit 2026-08-23 — les SIX audiences du modèle sont offertes par TOUTE
 * surface de publication, à la création comme à l'édition.
 *
 * Ce fichier remplace `story-composer-visibility.test.ts` : la liste des
 * options ne vit plus dans le composer story mais dans un module partagé, parce
 * que quatre listes recopiées avaient dérivé (éditeur à 3 options, composers à
 * 5, story à 6) — et une audience absente d'une surface est une audience qu'on
 * peut poser sans jamais pouvoir la reprendre.
 *
 * La garde de source ci-dessous est NÉGATIVE : elle doit rougir si une surface
 * se remet à déclarer sa propre liste. Contre-épreuve exigée par
 * `reference_negative_source_guards_die_silently` — réintroduire un
 * `labelKey:` littéral dans l'un de ces fichiers la fait échouer.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PUBLICATION_VISIBILITY_OPTIONS } from '@/components/v2/publication-visibility';
import { isAudienceIncomplete } from '@/components/v2/AudienceUserPicker';

// W9 — les trois surfaces retirées (PostComposer/AudioPostComposer/PostEditor)
// laissent la place aux DEUX surfaces unifiées qui portent désormais la
// création ET l'édition de tout format document/mood (loi 3 : un seul site
// par capacité). `StoryComposer.tsx` reste (§G, opposable). Une garde
// NÉGATIVE qui perd sa cible sans qu'on lui en donne une nouvelle passe au
// vert en perdant sa protection — recomposer plutôt que réduire l'ensemble.
const SURFACES = [
  'components/v2/StoryComposer.tsx',
  'components/composer/ComposerDocumentSurface.tsx',
  'components/composer/ComposerMoodSurface.tsx',
];

function sourceOf(relative: string): string {
  return readFileSync(join(__dirname, '../../', relative), 'utf8');
}

describe('publication visibility options', () => {
  it('offers the 6 PostVisibility values in selector order (iOS parity)', () => {
    expect(PUBLICATION_VISIBILITY_OPTIONS.map((o) => o.id)).toEqual([
      'PUBLIC',
      'FRIENDS',
      'COMMUNITY',
      'EXCEPT',
      'ONLY',
      'PRIVATE',
    ]);
  });

  it('blocks publishing EXCEPT/ONLY without a selected audience (W6 guard)', () => {
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
        if (record.publicationVisibility) return record.publicationVisibility as Record<string, string>;
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
      expect(block?.label).toBeTruthy();
      for (const opt of PUBLICATION_VISIBILITY_OPTIONS) {
        const key = opt.labelKey.split('.').pop() as string;
        expect(block?.[key]).toBeTruthy();
      }
    }
  });

  it('is the ONLY list: no publication surface declares its own options', () => {
    for (const surface of SURFACES) {
      const source = sourceOf(surface);
      expect(source).toContain('PUBLICATION_VISIBILITY_OPTIONS');
      expect(source).not.toMatch(/labelKey:\s*['"]/);
    }
  });

  it('the guard above would catch a re-declared local list', () => {
    const reintroduced = `const VISIBILITY_OPTIONS = [{ id: 'PUBLIC', labelKey: 'x.public', icon: '🌍' }];`;
    expect(reintroduced).toMatch(/labelKey:\s*['"]/);
  });
});

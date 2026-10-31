import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RELATION_EXPORT_BADGE_MIN_LEVEL, relationExportBadge } from '../utils/relation-export-badge';

type Vector = { readonly _label: string; readonly input: unknown; readonly expected: string | null };
type Vectors = { readonly minLevel: string; readonly vectors: readonly Vector[] };

const fixture = (): Vectors =>
  JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'relation-export-badge.vectors.json'), 'utf8')) as Vectors;

describe('relationExportBadge — le logo de cercle de l’intro exportée', () => {
  it.each(fixture().vectors.map((v) => [v._label, v] as const))('%s', (_label, vector) => {
    expect(relationExportBadge(vector.input)).toBe(vector.expected);
  });

  it('le seuil déclaré par les vecteurs est celui de la loi', () => {
    expect(RELATION_EXPORT_BADGE_MIN_LEVEL).toBe(fixture().minLevel);
  });

  it('un Ami n’a jamais de logo, même quand le niveau voyage avec des espaces', () => {
    expect(relationExportBadge(' FRIEND ')).toBeNull();
    expect(relationExportBadge(' CLOSE ')).toBeNull();
  });

  it('une clé héritée d’un objet n’est pas un niveau : rien n’est peint', () => {
    for (const inherited of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(relationExportBadge(inherited)).toBeNull();
    }
  });

  it('seuls Proche et Sang, au-dessus du seuil, ont un logo', () => {
    const painted = fixture().vectors.filter((v) => relationExportBadge(v.input) !== null).map((v) => v.input);
    expect(painted).toEqual([RELATION_EXPORT_BADGE_MIN_LEVEL, 'BLOOD']);
  });
});

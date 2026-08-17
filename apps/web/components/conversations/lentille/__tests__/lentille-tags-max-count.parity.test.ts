/**
 * Garde de parité du plafond numérique des pastilles de tags
 * (behaviour-matrix:L08, réserve REV-4/R4-2 soldée).
 *
 * `LentilleRow.LENTILLE_LIST_TAGS_MAX_COUNT` est un NOMBRE JS (nécessaire à
 * `.slice()`), mirroré depuis `packages/shared/design/lentille-tokens.json`
 * → `list.tags.maxCount` (source de vérité §4.3) et depuis
 * `--lentille-list-tags-max-count` (`lentille-tokens.css`, M-049). Même
 * discipline que `lentille-rail-max-entries.parity.test.ts` : si l'un des
 * trois dérive, cette suite échoue — et on répare le MIROIR, jamais le test.
 */
import * as fs from 'fs';
import * as path from 'path';
import { LENTILLE_LIST_TAGS_MAX_COUNT } from '../LentilleRow';

describe('LENTILLE_LIST_TAGS_MAX_COUNT — parité JSON/CSS', () => {
  it('correspond à list.tags.maxCount du JSON source', () => {
    const jsonPath = path.join(__dirname, '../../../../../../packages/shared/design/lentille-tokens.json');
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(LENTILLE_LIST_TAGS_MAX_COUNT).toBe(json.list.tags.maxCount);
  });

  it('correspond à --lentille-list-tags-max-count du CSS', () => {
    const cssPath = path.join(__dirname, '../../../../styles/lentille-tokens.css');
    const css = fs.readFileSync(cssPath, 'utf-8');
    const match = css.match(/--lentille-list-tags-max-count:\s*([-\d.]+);/);
    expect(match).not.toBeNull();
    expect(LENTILLE_LIST_TAGS_MAX_COUNT).toBe(Number(match![1]));
  });
});

/**
 * WL-105 (LWS-10) — garde de parité du plafond numérique du rail.
 *
 * `LivesRail.LENTILLE_LIST_RAIL_MAX_ENTRIES` est un NOMBRE JS (nécessaire à
 * `.slice()`), mirroré depuis `packages/shared/design/lentille-tokens.json`
 * → `list.rail.maxEntries` (source de vérité §4.3) et depuis
 * `--lentille-list-rail-max-entries` (`lentille-tokens.css`, M-049). Cette
 * suite échoue si l'un des trois dérive — discipline `MeeshyTokenParityTest`
 * (« ne jamais réparer le test en y recopiant la valeur qui a dérivé »).
 */
import * as fs from 'fs';
import * as path from 'path';
import { LENTILLE_LIST_RAIL_MAX_ENTRIES } from '../LivesRail';

describe('LENTILLE_LIST_RAIL_MAX_ENTRIES — parité JSON/CSS', () => {
  it('correspond à list.rail.maxEntries du JSON source', () => {
    const jsonPath = path.join(__dirname, '../../../../../../packages/shared/design/lentille-tokens.json');
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(LENTILLE_LIST_RAIL_MAX_ENTRIES).toBe(json.list.rail.maxEntries);
  });

  it('correspond à --lentille-list-rail-max-entries du CSS', () => {
    const cssPath = path.join(__dirname, '../../../../styles/lentille-tokens.css');
    const css = fs.readFileSync(cssPath, 'utf-8');
    const match = css.match(/--lentille-list-rail-max-entries:\s*([-\d.]+);/);
    expect(match).not.toBeNull();
    expect(LENTILLE_LIST_RAIL_MAX_ENTRIES).toBe(Number(match![1]));
  });
});

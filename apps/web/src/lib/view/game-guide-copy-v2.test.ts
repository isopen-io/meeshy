import { describe, expect, test } from 'bun:test';

import { GUIDE_MOMENT_KEYS_V2, guideMomentV2, type GuideEventV2 } from '@meeshy/shared/utils/game/guide-v2';

import { SUPPORTED_INTERFACE_LANGUAGES } from '../inline-interface-language-bootstrap.js';
import { loadGameCatalog } from '../i18n-game-catalog';
import { actionLabelV2, momentCopyV2 } from './game-guide-copy-v2';

/**
 * CE QUE DISENT MEE ET MEO, VAGUE 2 (#9481) — les huit moments de la loi, dits
 * en toutes lettres dans les sept langues : jamais une clé, jamais un
 * paramètre `{…}` laissé tel quel, jamais une ligne vide.
 */
const EVENTS: Readonly<Record<(typeof GUIDE_MOMENT_KEYS_V2)[number], GuideEventV2>> = {
  'league-first': { kind: 'league-first', league: 'jade', pointsToPromotion: 12 },
  'league-promoted': { kind: 'league-promoted', from: 'jade', to: 'saphir', rank: 3, weekKey: '2026-11-02' },
  'league-relegated': { kind: 'league-relegated', from: 'jade', to: 'ambre', pointsToPromotion: 40, weekKey: '2026-11-02' },
  'season-start': { kind: 'season-start', season: 1, themeKey: 'language:sw', steps: 40 },
  'season-end': { kind: 'season-end', season: 1, stepsReached: 40, completed: true, gloryGained: 500 },
  trophy: { kind: 'trophy', trophyKey: 'trophy.league-cup.2026-10-26.jade.gold' },
  prestige: { kind: 'prestige', prestige: 2, gloryGained: 1000 },
  'atlas-stamp': { kind: 'atlas-stamp', language: 'ja', stamped: 5, total: 83 },
};

describe('les huit moments, dans les sept langues', () => {
  test('chaque moment dit ses cinq lignes, sans clé ni paramètre laissé tel quel', async () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      await loadGameCatalog(language);
      for (const event of Object.values(EVENTS)) {
        for (const presentation of [new Set<string>(), new Set<string>([event.kind])]) {
          const copy = momentCopyV2(guideMomentV2(event, presentation), language);
          for (const text of Object.values(copy)) {
            expect({ language, kind: event.kind, text, bare: /game\.[a-z_]+\.|\{\w+\}/.test(text) }).toEqual({ language, kind: event.kind, text, bare: false });
            expect(text.trim().length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  test('les chiffres de la loi passent dans le texte', () => {
    const promoted = momentCopyV2(guideMomentV2(EVENTS['league-promoted'], []), 'fr');
    expect(promoted.what).toBe('Tu montes en ligue Saphir !');
    expect(promoted.means).toContain('place 3');
    expect(promoted.means).toContain('ligue Jade');
    expect(momentCopyV2(guideMomentV2(EVENTS['league-first'], []), 'fr').next).toBe('Encore 12 points pour monter cette semaine.');
  });

  test('une fin de saison terminée ne dit pas la même chose qu’une fin inachevée', () => {
    const done = momentCopyV2(guideMomentV2(EVENTS['season-end'], []), 'fr');
    const partial = momentCopyV2(guideMomentV2({ kind: 'season-end', season: 1, stepsReached: 22, completed: false, gloryGained: 0 }, []), 'fr');
    expect(done.what).toContain('parcours complet');
    expect(done.means).toContain('500 de Gloire');
    expect(partial.means).toContain('étape 22 sur 40');
    expect(partial.means).not.toContain('Gloire');
  });

  test('le thème de la saison se nomme dans la langue ; un thème inconnu se tait', () => {
    expect(momentCopyV2(guideMomentV2(EVENTS['season-start'], []), 'fr').means).toContain('Swahili');
    const unknown = momentCopyV2(guideMomentV2({ ...EVENTS['season-start'], themeKey: 'region:mystere' } as unknown as GuideEventV2, []), 'fr');
    expect(unknown.means).not.toContain('{theme}');
    expect(unknown.means).not.toContain('region');
  });

  test('au sommet des ligues : pas d’écart à la montée', () => {
    const top = momentCopyV2(guideMomentV2({ kind: 'league-first', league: 'prisme', pointsToPromotion: null }, []), 'fr');
    expect(top.next).toContain('sommet');
  });

  test('une descente sans écart connu : la phrase sans nombre', () => {
    const far = momentCopyV2(guideMomentV2({ kind: 'league-relegated', from: 'jade', to: 'ambre', pointsToPromotion: null, weekKey: '2026-11-02' }, []), 'fr');
    expect(far.next).toContain('chaque point compte');
  });

  test('les boutons : quatre nouveaux, et « voir mon niveau » pour le Prestige', () => {
    expect(actionLabelV2('see-league', 'fr')).toBe('Voir ma ligue');
    expect(actionLabelV2('see-season', 'fr')).toBe('Voir la saison');
    expect(actionLabelV2('see-trophies', 'fr')).toBe('Voir ma vitrine');
    expect(actionLabelV2('see-atlas', 'fr')).toBe('Voir mon Atlas');
    expect(actionLabelV2('see-level', 'fr')).toBe('Voir mon niveau');
  });
});

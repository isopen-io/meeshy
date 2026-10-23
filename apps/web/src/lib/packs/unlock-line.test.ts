import { beforeAll, describe, expect, test } from 'bun:test';

import type { PackRequirementPreview } from '@meeshy/shared/types/pack-unlock';
import type { GloryRankKey } from '@meeshy/shared/utils/game/glory';

import { loadStickerPacksCatalog } from '@/lib/i18n-sticker-packs-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { packIsLocked, packUnlockLine } from './unlock-line';

/**
 * W18 (#11324) — LA BOUTIQUE DIT CE QUI RESTE À DÉBLOQUER, ET COMMENT. La
 * passerelle sert `requirementPreview` (S21, #11276) pour chaque pack non
 * possédé qui se gagne ou qui a une fenêtre ; le web en fait UNE ligne, dans
 * la langue de l'interface. Le serveur reste juge : la ligne montre, elle
 * n'accorde rien.
 */
beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadStickerPacksCatalog(language)));
});

const rank = (missing: number): PackRequirementPreview => ({
  met: false,
  reward: { kind: 'rank', rank: 'conteur', currentRank: 'echo', requirement: { current: 1_000, required: 1_000 + missing, missing, met: missing === 0 } },
  window: null,
});

const line = (preview: PackRequirementPreview, rankName?: (key: GloryRankKey) => string) =>
  packUnlockLine({ preview, language: 'fr', ...(rankName !== undefined ? { rankName } : {}) });

describe('packUnlockLine — ce qui reste, et comment', () => {
  test('un rang : la Gloire qui manque, et le rang quand son nom est connu', () => {
    const amount = new Intl.NumberFormat('fr-FR').format(3_500);
    expect(line(rank(3_500))).toBe(`Gloire manquante : ${amount}`);
    expect(line(rank(3_500), () => 'Conteur')).toBe(`Rang Conteur — Gloire manquante : ${amount}`);
  });

  test('un trophée, une saison', () => {
    expect(line({ met: false, reward: { kind: 'trophy', key: 'polyglotte', met: false }, window: null })).toBe('Se gagne avec un trophée');
    expect(line({ met: false, reward: { kind: 'season', number: 3, met: false }, window: null })).toBe('Récompense de la saison 3');
  });

  test('une fenêtre à venir, ouverte avec une fin, fermée', () => {
    expect(line({ met: false, reward: null, window: { state: 'upcoming', startsAt: '2026-11-02T00:00:00.000Z' } })).toBe('Disponible à partir du 2 novembre');
    expect(line({ met: true, reward: null, window: { state: 'open', endsAt: '2026-11-30T00:00:00.000Z' } })).toBe('Disponible jusqu’au 30 novembre');
    expect(line({ met: false, reward: null, window: { state: 'closed', endsAt: '2026-10-01T00:00:00.000Z' } })).toBe('N’est plus proposé');
  });

  test('une récompense remplie ne se redit pas ; la fenêtre qui reste se dit seule', () => {
    expect(
      line({ met: false, reward: { kind: 'season', number: 3, met: true }, window: { state: 'upcoming', startsAt: '2026-11-02T00:00:00.000Z' } }),
    ).toBe('Disponible à partir du 2 novembre');
  });

  test('récompense ET fenêtre : les deux, séparées', () => {
    expect(
      line({ met: false, reward: { kind: 'trophy', key: 'x', met: false }, window: { state: 'open', endsAt: '2026-11-30T00:00:00.000Z' } }),
    ).toBe('Se gagne avec un trophée · Disponible jusqu’au 30 novembre');
  });

  test('ouverte sans fin et récompense remplie : rien à dire', () => {
    expect(line({ met: true, reward: { kind: 'season', number: 1, met: true }, window: { state: 'open' } })).toBeNull();
  });

  test('chaque phrase existe dans les sept langues', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const text = packUnlockLine({ preview: { met: false, reward: { kind: 'season', number: 3, met: false }, window: { state: 'closed' } }, language });
      expect(text).toContain('3');
      expect(text).not.toContain('packs.unlock');
    }
  });
});

describe('packIsLocked — le geste d’installer ou d’acheter n’est offert qu’une fois débloqué', () => {
  test('aucun aperçu (pack libre ou possédé) : jamais verrouillé', () => {
    expect(packIsLocked(undefined)).toBe(false);
  });

  test('aperçu non rempli : verrouillé ; rempli : non', () => {
    expect(packIsLocked(rank(10))).toBe(true);
    expect(packIsLocked({ ...rank(0), met: true })).toBe(false);
  });
});

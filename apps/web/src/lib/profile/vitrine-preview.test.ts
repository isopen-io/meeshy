import { describe, expect, test } from 'bun:test';

import { RELATION_LEVELS, type RelationLevel } from '@meeshy/shared/types/relation';
import { resolveProfileCircleViewAs, type ProfileCircleView } from '@meeshy/shared/utils/profile-circle-view';

import { VITRINE_LEVELS, localVitrineView, vitrinePreviewOf } from './vitrine-preview';

const TARGET = 'owner-1';
const view = (level: RelationLevel): ProfileCircleView => localVitrineView({ level, targetId: TARGET });
const keysOf = (rows: readonly { readonly key: string }[]): readonly string[] => rows.map((row) => row.key);

describe('« Voir comme » : l’aperçu est le verdict de la loi d’accès, jamais une liste écrite à la main', () => {
  test('les niveaux proposés sont ceux de la loi, Public en tête', () => {
    expect(VITRINE_LEVELS).toEqual(RELATION_LEVELS);
    expect(VITRINE_LEVELS[0]).toBe('PUBLIC');
  });

  test('chaque capacité rendue est ouverte OU fermée, jamais les deux, et l’état est celui de la loi', () => {
    for (const level of RELATION_LEVELS) {
      const law = resolveProfileCircleViewAs({ level, targetId: TARGET });
      const preview = vitrinePreviewOf(view(level));
      expect(keysOf(preview.opened).filter((key) => keysOf(preview.locked).includes(key))).toEqual([]);
      for (const row of preview.opened) expect(law.capabilities[row.key]?.state).toBe('open');
      for (const row of preview.locked) {
        expect(law.capabilities[row.key]?.state).toBe('locked');
        expect(row.circle).toBe(law.capabilities[row.key]?.circle);
      }
    }
  });

  test('monter d’un cercle n’en ferme jamais : ce qui est ouvert à un niveau l’est à tous les suivants', () => {
    const openedAt = RELATION_LEVELS.map((level) => keysOf(vitrinePreviewOf(view(level)).opened));
    openedAt.forEach((opened, rank) => {
      if (rank === 0) return;
      for (const key of openedAt[rank - 1] ?? []) expect(opened).toContain(key);
    });
  });

  test('Public ferme plus de choses que Sang, et Sang ne montre aucun verrou que la loi n’impose', () => {
    const publicView = vitrinePreviewOf(view('PUBLIC'));
    const bloodView = vitrinePreviewOf(view('BLOOD'));
    expect(publicView.locked.length).toBeGreaterThan(bloodView.locked.length);
    expect(bloodView.locked.every((row) => row.circle === 'BLOOD' || RELATION_LEVELS.indexOf(row.circle) > RELATION_LEVELS.indexOf('BLOOD'))).toBe(true);
  });

  test('les rangées fermées sont ordonnées du cercle le plus proche au plus intime', () => {
    const ranks = vitrinePreviewOf(view('PUBLIC')).locked.map((row) => RELATION_LEVELS.indexOf(row.circle));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  test('un état inconnu se lit FERMÉ : fail-closed, jamais une porte ouverte par défaut', () => {
    const served = {
      ...view('PUBLIC'),
      capabilities: { presence: { state: 'maybe' as unknown as 'open', circle: 'FRIEND' as const, consentRequired: false } },
    };
    const preview = vitrinePreviewOf(served);
    expect(keysOf(preview.opened)).toEqual([]);
    expect(keysOf(preview.locked)).toEqual(['presence']);
  });

  test('une capacité que l’écran ne sait pas nommer ne s’affiche pas (jamais sa clé brute)', () => {
    const served = {
      ...view('PUBLIC'),
      capabilities: { hologram: { state: 'locked' as const, circle: 'BLOOD' as const, consentRequired: false } },
    } as unknown as ProfileCircleView;
    const preview = vitrinePreviewOf(served);
    expect(preview.opened).toEqual([]);
    expect(preview.locked).toEqual([]);
  });

  test('une vue sans capacité (bloqué, désactivé ou ancien serveur) ne montre rien : aucune rangée inventée', () => {
    const empty = { ...view('PUBLIC'), capabilities: {} };
    expect(vitrinePreviewOf(empty)).toEqual({ opened: [], locked: [] });
  });
});

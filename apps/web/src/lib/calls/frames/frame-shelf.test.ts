import { describe, expect, test } from 'bun:test';

import { captureFrames } from './frame-catalogue';
import { CALL_FRAME_USES } from './frame-filter';
import type { CaptureFrame } from './frame-spec';
import { shelvedStudio } from './frame-shelf';
import { createFrameStudio } from './frame-studio';

/**
 * RETIRER UNE AMBIANCE CACHE SA PUCE, JAMAIS SON CADRE (#10169, LC, § 5.10.7) —
 * l'étagère des ambiances installées ne filtre que ce que l'atelier PROPOSE
 * (ambiances, cadres d'une ambiance, défaut de la réconciliation) ; la
 * résolution par identifiant (`find`) reste sur le catalogue CONNU, jamais
 * filtré : le cadre qu'un pair a choisi, ou mémorisé dans une ambiance
 * retirée, se peint encore.
 */

const frames = captureFrames();
const duoOf = (mood: string): CaptureFrame => {
  const frame = frames.find((candidate) => candidate.mood === mood && candidate.bucket === 'duo');
  if (frame === undefined) throw new Error(`aucun cadre de duo pour ${mood}`);
  return frame;
};
const allMoods = () => createFrameStudio({ fonts: undefined }).moods(2);

describe('shelvedStudio — l’étagère gouverne l’offre', () => {
  test('sans étagère connue (null), rien ne se cache : les défauts du registre installent tout', () => {
    const studio = createFrameStudio({ fonts: undefined });
    expect(shelvedStudio(studio, null)).toBe(studio);
  });

  test('une ambiance retirée disparaît des puces d’ambiance et de ses cadres', () => {
    const studio = shelvedStudio(createFrameStudio({ fonts: undefined }), allMoods().filter((mood) => mood !== 'jovial'));
    expect(studio.moods(2)).not.toContain('jovial');
    expect(studio.moods(2)).toHaveLength(allMoods().length - 1);
    expect(studio.framesOf(2, 'jovial')).toEqual([]);
  });

  test('le cadre d’une ambiance retirée se RÉSOUT encore par son identifiant (un pair l’a choisi, un brouillon le porte)', () => {
    const jovial = duoOf('jovial');
    const studio = shelvedStudio(createFrameStudio({ fonts: undefined }), ['signature']);
    expect(studio.find(jovial.id)?.id).toBe(jovial.id);
  });

  test('la réconciliation d’un choix mémorisé dans une ambiance retirée ne le repropose pas comme défaut', () => {
    const jovial = duoOf('jovial');
    const studio = shelvedStudio(createFrameStudio({ fonts: undefined }), ['signature']);
    const reconciled = studio.reconcile(jovial.id, 2);
    expect(reconciled?.mood).not.toBe('jovial');
  });

  test('toutes retirées ⇒ aucune puce d’ambiance, aucun défaut (l’hôte retombe sur un classique)', () => {
    const studio = shelvedStudio(createFrameStudio({ fonts: undefined }), []);
    expect(studio.moods(2)).toEqual([]);
    expect(studio.reconcile(duoOf('jovial').id, 2)).toBeNull();
  });

  test('l’étagère se combine avec la loi d’usage : en appel, jamais un cadre de capture seule, même installé', () => {
    const studio = shelvedStudio(createFrameStudio({ fonts: undefined, uses: CALL_FRAME_USES }), ['jovial', 'signature']);
    expect(studio.moods(2).flatMap((mood) => studio.framesOf(2, mood)).every((frame) => studio.servesCall(frame))).toBe(true);
  });

  test('l’atelier étagé garde tout ce que l’atelier porte : cadres, peinture, polices, libellés', () => {
    const studio = createFrameStudio({ fonts: undefined });
    const shelved = shelvedStudio(studio, ['signature']);
    expect(shelved.frames).toBe(studio.frames);
    expect(shelved.draw).toBe(studio.draw);
    expect(shelved.ready).toBe(studio.ready);
    expect(shelved.usageLabel).toBe(studio.usageLabel);
  });
});

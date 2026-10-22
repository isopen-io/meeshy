import { describe, expect, test } from 'bun:test';

import { gloryFramesFor, type GloryFrameOfferPack } from '@meeshy/shared/utils/game/glory-frames';

import { gloryTextsOf } from './glory-texts';
import { dayMoment, flameMoment, meeshMoment, rankMoment, tierMoment, treasuryMoment } from './moments';

/**
 * LES TEXTES VIVANTS D'UN CADRE DE GLOIRE (L14, #10167) — ce que le moment
 * remplit dans les emplacements du contrat : la ligne du dessus, le titre, la
 * date, la plaque ; le message reste à l'auteur. Le titre dit le VRAI palier
 * même quand la loi sert le cadre du palier dessiné en dessous (D4, #10180).
 */

const DATE = '10 octobre 2026';

/** Le pack `moments` tel que la loi le lit : seuls les paliers dessinés y ont un cadre. */
const moments: GloryFrameOfferPack = {
  slug: 'moments',
  atmosphere: null,
  collections: ['moments'],
  frames: (['lueur', 'aurore', 'galaxie'] as const).map((tier) => ({
    id: `moments.palier-${tier}`,
    usage: { kind: 'moment', family: 'tier' },
    collection: 'moments',
    appliesTo: { family: 'tier', tier },
    option: null,
    hidden: false,
  })),
};

describe('gloryTextsOf', () => {
  test('D4 : Comète n’a pas de cadre, la loi sert Aurore — et le titre reste « Ta lumière en Comète »', () => {
    const moment = tierMoment({ tier: 'comete', level: 60 });
    const offer = gloryFramesFor({ stepId: moment.id, atmosphere: null, lastChosen: null, catalog: [moments], installed: new Set(['moments']) });
    expect(offer.preselected?.frameId).toBe('moments.palier-aurore');
    expect(gloryTextsOf(moment, DATE)).toEqual({ kicker: 'Niveau 60', title: 'Ta lumière en Comète', date: DATE, message: null, 'plate.1': null });
  });

  test('le trésor grave le compte de Meeshes gardées sur sa plaque ; la Meesh, son numéro dans le titre', () => {
    expect(gloryTextsOf(treasuryMoment('coffret'), DATE)).toMatchObject({ kicker: 'Héritage', title: 'Coffret', 'plate.1': '50 Meeshes gardées' });
    expect(gloryTextsOf(meeshMoment({ number: 200 }), DATE)).toMatchObject({ title: 'Meesh n° 200 · or', 'plate.1': null });
  });

  test('la Flamme dit sa forme ; le jour, son quantième, sur la ligne du dessus ET sur la plaque', () => {
    expect(gloryTextsOf(flameMoment(100), DATE)).toMatchObject({ kicker: 'Astre', title: '100 jours de Flamme' });
    const day = dayMoment('2026-10-10');
    expect(day === null ? null : gloryTextsOf(day, DATE)).toMatchObject({ kicker: 'Réalisation du jour · Jour 283', title: 'L’Offrande ouverte', 'plate.1': 'Réalisation du jour · Jour 283' });
  });

  test('le message n’est jamais pré-rempli : il appartient à l’auteur', () => {
    expect(gloryTextsOf(rankMoment({ rank: 'oracle', division: 2 }), DATE).message).toBeNull();
  });
});

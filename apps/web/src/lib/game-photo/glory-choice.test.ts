import { describe, expect, test } from 'bun:test';

import type { PackAssetRef } from '@meeshy/shared/types/content-pack';

import { INITIAL_CHOICE, birdLayoutOf, chooseFrame, choosePose, composedVersionOf, presenceOf, reconcileChoice, tileOf, type GloryOffer, type GloryOfferTile } from './glory-choice';

/**
 * LE CHOIX DU CADRE ET DE LA POSE (#10164, L11) — une loi PURE entre l'offre que
 * la loi partagée sert (`gloryFramesFor`, projetée en tuiles) et ce que
 * l'utilisateur a touché : la présélection vaut tant qu'il n'a rien choisi, un
 * choix tient tant que l'offre le propose encore, une pose n'existe que si le
 * cadre choisi la déclare, et la carte simple reste toujours un choix possible.
 */
const thumb: PackAssetRef = { src: '0123456789abcdef.webp', bytes: 1, sha256: '0'.repeat(64) };

const tile = (frameId: string, overrides: Partial<GloryOfferTile> = {}): GloryOfferTile => ({
  ref: { pack: 'afrique', frameId },
  name: frameId,
  usage: 'Rang Ambassadeur II uniquement',
  thumb,
  poses: ['perches', 'pied'],
  defaultPose: 'perches',
  squareSimple: true,
  message: true,
  ready: true,
  missingBytes: 0,
  ...overrides,
});

const offer: GloryOffer = {
  tiles: [tile('savane.ambassadeur-2'), tile('royaumes.ambassadeur-2', { poses: ['duo'], defaultPose: 'duo', ready: false, missingBytes: 420_000 })],
  preselected: { pack: 'afrique', frameId: 'savane.ambassadeur-2' },
};

describe('la présélection et le choix', () => {
  test('sans offre : aucun cadre (la carte simple), rien choisi', () => {
    expect(reconcileChoice(INITIAL_CHOICE, null)).toEqual(INITIAL_CHOICE);
  });

  test('l’offre arrive : la présélection de la loi, tant que l’utilisateur n’a rien touché', () => {
    expect(reconcileChoice(INITIAL_CHOICE, offer)).toEqual({ frame: offer.preselected, pose: null, byUser: false });
  });

  test('un choix de l’utilisateur tient quand l’offre relue le propose encore ; sinon la présélection reprend', () => {
    const chosen = chooseFrame(INITIAL_CHOICE, offer, { pack: 'afrique', frameId: 'royaumes.ambassadeur-2' });
    expect(reconcileChoice(chosen, offer)).toEqual(chosen);
    const without: GloryOffer = { tiles: [tile('savane.ambassadeur-2')], preselected: offer.preselected };
    expect(reconcileChoice(chosen, without)).toEqual({ frame: offer.preselected, pose: null, byUser: false });
  });

  test('la carte simple choisie exprès tient à travers une relecture de l’offre', () => {
    const simple = chooseFrame(reconcileChoice(INITIAL_CHOICE, offer), offer, null);
    expect(simple).toEqual({ frame: null, pose: null, byUser: true });
    expect(reconcileChoice(simple, offer)).toEqual(simple);
  });

  test('un cadre que l’offre ne propose pas ne se choisit pas (fail-closed)', () => {
    const start = reconcileChoice(INITIAL_CHOICE, offer);
    expect(chooseFrame(start, offer, { pack: 'olympe', frameId: 'olympe.ambassadeur-2' })).toEqual(start);
  });
});

describe('la pose', () => {
  const start = reconcileChoice(INITIAL_CHOICE, offer);

  test('une pose se choisit parmi celles que le cadre déclare ; une autre est ignorée ; `null` rend la pose du cadre', () => {
    expect(choosePose(start, offer, 'pied')).toEqual({ ...start, pose: 'pied', byUser: true });
    expect(choosePose(start, offer, 'ruban')).toEqual(start);
    expect(choosePose(choosePose(start, offer, 'pied'), offer, null)).toEqual({ ...start, pose: null, byUser: true });
  });

  test('changer de cadre garde la pose si le nouveau la déclare, la rend sinon', () => {
    const posed = choosePose(start, offer, 'pied');
    expect(chooseFrame(posed, offer, { pack: 'afrique', frameId: 'royaumes.ambassadeur-2' }).pose).toBeNull();
    const both: GloryOffer = { ...offer, tiles: [tile('savane.ambassadeur-2'), tile('royaumes.ambassadeur-2')] };
    expect(chooseFrame(posed, both, { pack: 'afrique', frameId: 'royaumes.ambassadeur-2' }).pose).toBe('pied');
  });

  test('sans cadre, aucune pose', () => {
    expect(choosePose({ frame: null, pose: null, byUser: true }, offer, 'pied').pose).toBeNull();
  });
});

describe('ce que la prise emporte', () => {
  test('la version de la loi d’enregistrement se nomme par la scène COMPOSÉE et sa pose, sinon par la carte simple du moment', () => {
    expect(composedVersionOf({ frameId: 'savane.ambassadeur-2', pose: null, momentId: 'rank:ambassadeur:2' })).toBe('savane.ambassadeur-2');
    expect(composedVersionOf({ frameId: 'savane.ambassadeur-2', pose: 'pied', momentId: 'rank:ambassadeur:2' })).toBe('savane.ambassadeur-2#pied');
    expect(composedVersionOf({ frameId: null, pose: 'pied', momentId: 'rank:ambassadeur:2' })).toBe('rank:ambassadeur:2');
    expect(composedVersionOf({ frameId: 'a', pose: 'pied', momentId: 'm' })).not.toBe(composedVersionOf({ frameId: 'a', pose: 'perches', momentId: 'm' }));
  });

  test('le message de l’auteur nomme aussi la version sur un cadre (#10165) ; sur la carte simple, où il n’est pas écrit, il ne change rien', () => {
    const plain = composedVersionOf({ frameId: 'a', pose: 'pied', momentId: 'm' });
    expect(composedVersionOf({ frameId: 'a', pose: 'pied', message: 'Pour toi, maman', momentId: 'm' })).not.toBe(plain);
    expect(composedVersionOf({ frameId: 'a', pose: 'pied', message: '', momentId: 'm' })).toBe(plain);
    expect(composedVersionOf({ frameId: 'a', pose: 'pied', message: 'Merci', momentId: 'm' })).not.toBe(composedVersionOf({ frameId: 'a', pose: 'pied', message: 'Merci !', momentId: 'm' }));
    expect(composedVersionOf({ frameId: null, pose: null, message: 'Merci', momentId: 'm' })).toBe('m');
  });

  test('la présence d’une tuile : prête, ou le poids qui manque ; un état vécu (chargement, échec) prime', () => {
    expect(presenceOf(offer, offer.tiles[0]!.ref, new Map())).toBe('ready');
    expect(presenceOf(offer, offer.tiles[1]!.ref, new Map())).toBe('missing');
    expect(presenceOf(offer, offer.tiles[1]!.ref, new Map([['royaumes.ambassadeur-2', 'loading']]))).toBe('loading');
    expect(tileOf(offer, { pack: 'afrique', frameId: 'nulle-part' })).toBeUndefined();
  });
});

describe('la pose relue dans une recette du carnet (#10166)', () => {
  test('une pose que le format déclare se relit ; une inconnue, ou aucune, rend la pose par défaut du cadre', () => {
    expect(birdLayoutOf('perches')).toBe('perches');
    expect(birdLayoutOf('crest')).toBeNull();
    expect(birdLayoutOf(undefined)).toBeNull();
  });
});

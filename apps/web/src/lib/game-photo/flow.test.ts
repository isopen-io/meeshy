import { describe, expect, test } from 'bun:test';

import { saveButtonVisible } from '@meeshy/shared/utils/capture/capture-save';

import { flowReducer, type FlowEvent, type FlowState } from './flow';

/**
 * LE DÉROULÉ DE LA PHOTO (#9382) — conception, partie VI :
 *
 *   1. Mee propose : Selfie avec nous, Carte seule, Plus tard ;
 *   2. Selfie : caméra avant, cadre en surimpression ;
 *   3. au déclenchement, Mee et Meo frappent l'emblème, la photo se fige ;
 *   4. 9:16 et 1:1 : enregistrer, partager, ou garder au carnet ;
 *   5. « Plus tard » laisse le moment en attente sept jours.
 *
 * Le déroulé est un réducteur PUR : l'écran lui envoie des événements, il rend
 * l'étape — jamais une étape impossible (déclencher sans caméra vivante, partager
 * avant d'avoir composé).
 */
const run = (events: readonly FlowEvent[], from: FlowState = { step: 'offer' }): FlowState =>
  events.reduce(flowReducer, from);

describe('la proposition', () => {
  test('le selfie ouvre la caméra', () => {
    expect(run([{ type: 'selfie' }])).toEqual({ step: 'camera', camera: 'opening' });
  });
  test('la carte seule va droit à la frappe, sans caméra', () => {
    expect(run([{ type: 'card' }])).toEqual({ step: 'striking', mode: 'card', zone: 'outside' });
  });
  test('« plus tard » ferme en laissant le moment en attente', () => {
    expect(run([{ type: 'later' }])).toEqual({ step: 'done', deferred: true });
  });
  test('fermer ne laisse rien en attente', () => {
    expect(run([{ type: 'close' }])).toEqual({ step: 'done', deferred: false });
  });
});

describe('la reprise d’une photo gardée (#10166)', () => {
  test('« la même photo » va droit à la frappe, dans le mode de la photo gardée, hors cadre', () => {
    expect(run([{ type: 'same-photo', mode: 'selfie' }])).toEqual({ step: 'striking', mode: 'selfie', zone: 'outside' });
    expect(run([{ type: 'same-photo', mode: 'gallery' }])).toEqual({ step: 'striking', mode: 'gallery', zone: 'outside' });
  });
  test('hors de la proposition, l’événement est ignoré', () => {
    const opening: FlowState = { step: 'camera', camera: 'opening' };
    expect(run([{ type: 'same-photo', mode: 'gallery' }], opening)).toEqual(opening);
  });
});

describe('la caméra', () => {
  const opening: FlowState = { step: 'camera', camera: 'opening' };

  test('prête : le flux est vivant', () => {
    expect(run([{ type: 'camera-ready' }], opening)).toEqual({ step: 'camera', camera: 'live' });
  });

  test('le déclencheur fige la photo et lance la frappe', () => {
    expect(run([{ type: 'camera-ready' }, { type: 'shutter', zone: 'frame' }], opening)).toEqual({ step: 'striking', mode: 'selfie', zone: 'frame' });
    expect(run([{ type: 'camera-ready' }, { type: 'shutter', zone: 'outside' }], opening)).toEqual({ step: 'striking', mode: 'selfie', zone: 'outside' });
  });

  test('on ne déclenche pas une caméra qui n’est pas vivante', () => {
    expect(run([{ type: 'shutter', zone: 'frame' }], opening)).toEqual(opening);
  });

  test('chaque refus a son nom, et l’écran en tire son remède', () => {
    for (const reason of ['denied', 'unsupported', 'unavailable'] as const) {
      expect(run([{ type: 'camera-failed', reason }], opening)).toEqual({ step: 'camera', camera: reason });
    }
  });

  test('refus de la caméra ⇒ la galerie reste possible', () => {
    const denied: FlowState = { step: 'camera', camera: 'denied' };
    expect(run([{ type: 'gallery' }], denied)).toEqual({ step: 'striking', mode: 'gallery', zone: 'outside' });
  });

  test('refus de la caméra ⇒ la carte seule reste possible', () => {
    const denied: FlowState = { step: 'camera', camera: 'denied' };
    expect(run([{ type: 'card' }], denied)).toEqual({ step: 'striking', mode: 'card', zone: 'outside' });
  });

  test('la galerie est possible dès l’ouverture, sans attendre la caméra', () => {
    expect(run([{ type: 'gallery' }], opening)).toEqual({ step: 'striking', mode: 'gallery', zone: 'outside' });
  });

  test('fermer la caméra ferme tout, sans attente', () => {
    expect(run([{ type: 'close' }], { step: 'camera', camera: 'live' })).toEqual({ step: 'done', deferred: false });
  });
});

describe('la frappe et le résultat', () => {
  const striking: FlowState = { step: 'striking', mode: 'selfie', zone: 'outside' };
  const unsaved = { currentFrame: 'moment', currentFormat: 'story', savedWith: [] };

  test('les deux images prêtes : le résultat, rien de gardé ni de partagé encore', () => {
    expect(run([{ type: 'composed', frame: 'moment', format: 'story' }], striking)).toEqual({ step: 'result', mode: 'selfie', kept: null, shared: null, save: unsaved });
  });

  test('une composition impossible est un état à part, avec une sortie', () => {
    expect(run([{ type: 'compose-failed' }], striking)).toEqual({ step: 'failed' });
    expect(run([{ type: 'close' }], { step: 'failed' })).toEqual({ step: 'done', deferred: false });
  });

  test('garder au carnet : la réussite et l’échec se disent', () => {
    const result: FlowState = { step: 'result', mode: 'selfie', kept: null, shared: null, save: unsaved };
    expect(run([{ type: 'kept', ok: true }], result)).toEqual({ ...result, kept: true });
    expect(run([{ type: 'kept', ok: false }], result)).toEqual({ ...result, kept: false });
  });

  test('partager : l’issue se garde', () => {
    const result: FlowState = { step: 'result', mode: 'card', kept: null, shared: null, save: unsaved };
    expect(run([{ type: 'shared', outcome: 'downloaded' }], result)).toEqual({ ...result, shared: 'downloaded' });
  });

  test('on ne partage pas avant d’avoir composé', () => {
    expect(run([{ type: 'shared', outcome: 'shared' }], striking)).toEqual(striking);
    expect(run([{ type: 'kept', ok: true }], striking)).toEqual(striking);
  });

  test('fermer le résultat ne laisse rien en attente', () => {
    expect(run([{ type: 'close' }], { step: 'result', mode: 'selfie', kept: true, shared: null, save: unsaved })).toEqual({ step: 'done', deferred: false });
  });

  test('une fois fini, plus rien ne bouge', () => {
    const done: FlowState = { step: 'done', deferred: true };
    expect(run([{ type: 'selfie' }, { type: 'shutter', zone: 'frame' }], done)).toEqual(done);
  });
});

/**
 * LE CADRE EST LE DÉCLENCHEUR (#10284) — directive porteur 2026-10-12, loi
 * `@meeshy/shared/utils/capture/capture-save` : une prise par la case du cadre
 * part en galerie puis en retouche ; une prise hors cadre (la scène, une photo
 * importée, la carte seule) va en retouche et reste dans l'app. « Enregistrer »
 * est masqué tant que la prise est en galerie AVEC le cadre courant.
 */
describe('l’enregistrement d’une prise suit la zone qui l’a déclenchée (#10284)', () => {
  const live: FlowState = { step: 'camera', camera: 'live' };
  const resultOf = (zone: 'frame' | 'outside') => run([{ type: 'shutter', zone }, { type: 'composed', frame: 'moment', format: 'story' }], live);
  const visible = (state: FlowState): boolean | null => (state.step === 'result' ? saveButtonVisible(state.save) : null);

  test('prise par la case du cadre : déjà en galerie avec ce cadre, « Enregistrer » masqué', () => {
    expect(resultOf('frame')).toMatchObject({ step: 'result', save: { currentFrame: 'moment', currentFormat: 'story', savedWith: [{ frameId: 'moment', format: 'story' }] } });
    expect(visible(resultOf('frame'))).toBe(false);
  });

  test('prise par la scène : jamais en galerie, « Enregistrer » visible', () => {
    expect(resultOf('outside')).toMatchObject({ step: 'result', save: { currentFrame: 'moment', currentFormat: 'story', savedWith: [] } });
    expect(visible(resultOf('outside'))).toBe(true);
  });

  test('une photo importée et la carte seule sont des prises hors cadre', () => {
    const card = run([{ type: 'card' }, { type: 'composed', frame: 'moment', format: 'story' }]);
    const imported = run([{ type: 'gallery' }, { type: 'composed', frame: 'moment', format: 'story' }], live);
    expect(visible(card)).toBe(true);
    expect(visible(imported)).toBe(true);
  });

  test('« Enregistrer » touché le masque ; un échec le fait revenir', () => {
    const saved = run([{ type: 'saved' }], resultOf('outside'));
    expect(visible(saved)).toBe(false);
    expect(visible(run([{ type: 'save-failed', frame: 'moment', format: 'story' }], saved))).toBe(true);
  });

  test('l’écriture automatique d’une prise par le cadre qui échoue rend « Enregistrer »', () => {
    expect(visible(run([{ type: 'save-failed', frame: 'moment', format: 'story' }], resultOf('frame')))).toBe(true);
  });

  test('changer de cadre fait revenir « Enregistrer » ; revenir au cadre enregistré le masque', () => {
    const other = run([{ type: 'frame', frame: 'cour-du-roi' }], resultOf('frame'));
    expect(visible(other)).toBe(true);
    expect(visible(run([{ type: 'frame', frame: 'moment' }], other))).toBe(false);
  });

  test('#10296 : story enregistrée par le cadre, puis le carré, fait revenir « Enregistrer »', () => {
    expect(visible(run([{ type: 'format', format: 'square' }], resultOf('frame')))).toBe(true);
  });

  test('#10296 : le carré enregistré puis le retour à la story déjà enregistrée le masque, sans doublon', () => {
    const squareSaved = run([{ type: 'format', format: 'square' }, { type: 'saved' }], resultOf('frame'));
    expect(visible(squareSaved)).toBe(false);
    const back = run([{ type: 'format', format: 'story' }], squareSaved);
    expect(visible(back)).toBe(false);
    expect(back).toMatchObject({ save: { savedWith: [{ frameId: 'moment', format: 'story' }, { frameId: 'moment', format: 'square' }] } });
  });

  test('#10296 : l’échec de l’écriture du carré vise le carré, pas la story déjà en galerie', () => {
    const failed = run([{ type: 'format', format: 'square' }, { type: 'saved' }, { type: 'save-failed', frame: 'moment', format: 'square' }], resultOf('frame'));
    expect(visible(failed)).toBe(true);
    expect(visible(run([{ type: 'format', format: 'story' }], failed))).toBe(false);
  });

  test('avant la composition, rien ne s’enregistre', () => {
    const striking: FlowState = { step: 'striking', mode: 'selfie', zone: 'frame' };
    expect(run([{ type: 'saved' }, { type: 'frame', frame: 'x' }, { type: 'format', format: 'square' }], striking)).toEqual(striking);
  });
});

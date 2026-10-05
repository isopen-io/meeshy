import { describe, expect, test } from 'bun:test';

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
    expect(run([{ type: 'card' }])).toEqual({ step: 'striking', mode: 'card' });
  });
  test('« plus tard » ferme en laissant le moment en attente', () => {
    expect(run([{ type: 'later' }])).toEqual({ step: 'done', deferred: true });
  });
  test('fermer ne laisse rien en attente', () => {
    expect(run([{ type: 'close' }])).toEqual({ step: 'done', deferred: false });
  });
});

describe('la caméra', () => {
  const opening: FlowState = { step: 'camera', camera: 'opening' };

  test('prête : le flux est vivant', () => {
    expect(run([{ type: 'camera-ready' }], opening)).toEqual({ step: 'camera', camera: 'live' });
  });

  test('le déclencheur fige la photo et lance la frappe', () => {
    expect(run([{ type: 'camera-ready' }, { type: 'shutter' }], opening)).toEqual({ step: 'striking', mode: 'selfie' });
  });

  test('on ne déclenche pas une caméra qui n’est pas vivante', () => {
    expect(run([{ type: 'shutter' }], opening)).toEqual(opening);
  });

  test('chaque refus a son nom, et l’écran en tire son remède', () => {
    for (const reason of ['denied', 'unsupported', 'unavailable'] as const) {
      expect(run([{ type: 'camera-failed', reason }], opening)).toEqual({ step: 'camera', camera: reason });
    }
  });

  test('refus de la caméra ⇒ la galerie reste possible', () => {
    const denied: FlowState = { step: 'camera', camera: 'denied' };
    expect(run([{ type: 'gallery' }], denied)).toEqual({ step: 'striking', mode: 'gallery' });
  });

  test('refus de la caméra ⇒ la carte seule reste possible', () => {
    const denied: FlowState = { step: 'camera', camera: 'denied' };
    expect(run([{ type: 'card' }], denied)).toEqual({ step: 'striking', mode: 'card' });
  });

  test('la galerie est possible dès l’ouverture, sans attendre la caméra', () => {
    expect(run([{ type: 'gallery' }], opening)).toEqual({ step: 'striking', mode: 'gallery' });
  });

  test('fermer la caméra ferme tout, sans attente', () => {
    expect(run([{ type: 'close' }], { step: 'camera', camera: 'live' })).toEqual({ step: 'done', deferred: false });
  });
});

describe('la frappe et le résultat', () => {
  const striking: FlowState = { step: 'striking', mode: 'selfie' };

  test('les deux images prêtes : le résultat, rien de gardé ni de partagé encore', () => {
    expect(run([{ type: 'composed' }], striking)).toEqual({ step: 'result', mode: 'selfie', kept: null, shared: null });
  });

  test('une composition impossible est un état à part, avec une sortie', () => {
    expect(run([{ type: 'compose-failed' }], striking)).toEqual({ step: 'failed' });
    expect(run([{ type: 'close' }], { step: 'failed' })).toEqual({ step: 'done', deferred: false });
  });

  test('garder au carnet : la réussite et l’échec se disent', () => {
    const result: FlowState = { step: 'result', mode: 'selfie', kept: null, shared: null };
    expect(run([{ type: 'kept', ok: true }], result)).toEqual({ ...result, kept: true });
    expect(run([{ type: 'kept', ok: false }], result)).toEqual({ ...result, kept: false });
  });

  test('partager : l’issue se garde', () => {
    const result: FlowState = { step: 'result', mode: 'card', kept: null, shared: null };
    expect(run([{ type: 'shared', outcome: 'downloaded' }], result)).toEqual({ ...result, shared: 'downloaded' });
  });

  test('on ne partage pas avant d’avoir composé', () => {
    expect(run([{ type: 'shared', outcome: 'shared' }], striking)).toEqual(striking);
    expect(run([{ type: 'kept', ok: true }], striking)).toEqual(striking);
  });

  test('fermer le résultat ne laisse rien en attente', () => {
    expect(run([{ type: 'close' }], { step: 'result', mode: 'selfie', kept: true, shared: null })).toEqual({ step: 'done', deferred: false });
  });

  test('une fois fini, plus rien ne bouge', () => {
    const done: FlowState = { step: 'done', deferred: true };
    expect(run([{ type: 'selfie' }, { type: 'shutter' }], done)).toEqual(done);
  });
});

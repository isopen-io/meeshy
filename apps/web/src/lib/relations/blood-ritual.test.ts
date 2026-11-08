import { describe, expect, test } from 'bun:test';

import { INITIAL_RITUAL, reduceRitual, shouldSeal, type RitualEvent, type RitualState } from './blood-ritual';

/**
 * LE RITUEL DU SANG, LA MACHINE (#13938) — miroir de `BloodRitualViewModel`
 * (branche `lot/ui-cercles-ios-13938`). Le serveur tient l'état ; l'écran le
 * PILOTE. L'ordre est celui du serveur : les consentements AVANT la tenue (un
 * `confirm` n'est accepté que sur une tenue fraîche des deux côtés), et le
 * scellement part tout seul dès que les deux tiennent. Lâcher est calme.
 */

const play = (...events: readonly RitualEvent[]): RitualState => events.reduce(reduceRitual, INITIAL_RITUAL);

const opened: readonly RitualEvent[] = [{ type: 'proceed' }, { type: 'open-requested', online: true }, { type: 'opened', token: 't1', holdWindowMs: 9000 }];

describe('les consentements d’abord, tous refusés au départ', () => {
  test('l’état de départ refuse les quatre partages', () => {
    expect(INITIAL_RITUAL.stage).toBe('consent');
    expect(Object.values(INITIAL_RITUAL.consents)).toEqual([false, false, false, false]);
  });

  test('chaque partage s’accorde un à un ; plus rien ne bouge après « Continuer »', () => {
    const state = play({ type: 'consent', key: 'locationLive', granted: true }, { type: 'proceed' }, { type: 'consent', key: 'listeningTitle', granted: true });
    expect(state.stage).toBe('ready');
    expect(state.consents).toEqual({ listeningTitle: false, locationLive: true, locationHistory: false, locationProximity: false });
  });
});

describe('ouvrir', () => {
  test('hors ligne, le rituel est indisponible et le dit', () => {
    const state = play({ type: 'proceed' }, { type: 'open-requested', online: false });
    expect(state.stage).toBe('unavailable');
    expect(state.offline).toBe(true);
  });

  test('ouvert : on attend l’autre, avec le jeton et la fenêtre servis', () => {
    const state = play(...opened);
    expect(state).toMatchObject({ stage: 'waiting', token: 't1', holdWindowMs: 9000 });
  });

  test('« occupé » rend la main avec un avis ; un refus typé ferme ; une panne rend la main', () => {
    expect(play({ type: 'proceed' }, { type: 'open-requested', online: true }, { type: 'open-failed', refusal: 'RELATION_RITUAL_BUSY' })).toMatchObject({ stage: 'ready', notice: 'busy' });
    expect(play({ type: 'proceed' }, { type: 'open-requested', online: true }, { type: 'open-failed', refusal: 'RELATION_NOT_ELIGIBLE' })).toMatchObject({ stage: 'unavailable', refusal: 'RELATION_NOT_ELIGIBLE' });
    expect(play({ type: 'proceed' }, { type: 'open-requested', online: true }, { type: 'open-failed', refusal: null })).toMatchObject({ stage: 'ready', notice: 'openFailed' });
  });
});

describe('tenir l’écran ensemble', () => {
  test('le scellement ne part que si les DEUX tiennent, et que MA tenue est enregistrée', () => {
    const pressed = play(...opened, { type: 'hold-began' });
    expect(pressed.holding).toBe(true);
    expect(shouldSeal(reduceRitual(pressed, { type: 'other-progress', token: 't1', stage: 'held' }))).toBe(false);
    const mine = reduceRitual(pressed, { type: 'hold-acked' });
    expect(shouldSeal(mine)).toBe(false);
    const both = reduceRitual(mine, { type: 'other-progress', token: 't1', stage: 'held' });
    expect(shouldSeal(both)).toBe(true);
    expect(reduceRitual(both, { type: 'seal-started' }).stage).toBe('synchronised');
  });

  test('l’autre tient d’abord, puis moi : même issue', () => {
    expect(shouldSeal(play(...opened, { type: 'other-progress', token: 't1', stage: 'held' }, { type: 'hold-began' }, { type: 'hold-acked' }))).toBe(true);
  });

  test('un événement d’un AUTRE rituel est ignoré', () => {
    const state = play(...opened, { type: 'hold-began' }, { type: 'other-progress', token: 'autre', stage: 'held' });
    expect(state.otherHolding).toBe(false);
  });

  test('lâcher avant le scellement revient à l’attente', () => {
    const state = play(...opened, { type: 'hold-began' }, { type: 'hold-acked' }, { type: 'other-progress', token: 't1', stage: 'held' }, { type: 'seal-started' }, { type: 'hold-ended' });
    expect(state).toMatchObject({ stage: 'waiting', holding: false, holdAcked: false });
    expect(reduceRitual(state, { type: 'hold-acked' }).holdAcked).toBe(false);
  });

  test('une tenue refusée parce que la demande a disparu ferme le rituel', () => {
    expect(play(...opened, { type: 'hold-began' }, { type: 'hold-failed', refusal: 'RELATION_RITUAL_NO_REQUEST' })).toMatchObject({ stage: 'unavailable', holding: false });
    expect(play(...opened, { type: 'hold-began' }, { type: 'hold-failed', refusal: null })).toMatchObject({ stage: 'waiting', holding: true });
  });
});

describe('sceller', () => {
  const sealing: readonly RitualEvent[] = [...opened, { type: 'hold-began' }, { type: 'hold-acked' }, { type: 'other-progress', token: 't1', stage: 'held' }, { type: 'seal-started' }];

  test('scellé tout de suite, ou en attente de la confirmation de l’autre', () => {
    expect(play(...sealing, { type: 'sealed', completed: true }).stage).toBe('completed');
    expect(play(...sealing, { type: 'sealed', completed: false }).stage).toBe('awaitingOther');
    expect(play(...sealing, { type: 'sealed', completed: false }, { type: 'other-completed', token: 't1' }).stage).toBe('completed');
  });

  test('l’autre a lâché : rien n’est enregistré, on peut recommencer', () => {
    const lapsed = play(...sealing, { type: 'seal-failed', refusal: 'RELATION_RITUAL_LAPSED' });
    expect(lapsed).toMatchObject({ stage: 'lapsed', holding: false, otherHolding: false });
    expect(reduceRitual(lapsed, { type: 'retry' })).toMatchObject({ stage: 'ready', token: null, otherWaiting: false });
    expect(play(...opened, { type: 'other-progress', token: 't1', stage: 'lapsed' }).stage).toBe('lapsed');
  });

  test('pas synchronisés : on attend de nouveau que l’autre tienne', () => {
    expect(play(...sealing, { type: 'seal-failed', refusal: 'RELATION_RITUAL_NOT_SYNCHRONISED' })).toMatchObject({ stage: 'waiting', otherHolding: false });
  });

  test('un consentement refusé par le serveur ramène aux consentements, sans en accorder aucun', () => {
    const state = play(...sealing, { type: 'seal-failed', refusal: 'RELATION_CONSENT_REQUIRED' });
    expect(state.stage).toBe('consent');
    expect(Object.values(state.consents)).toEqual([false, false, false, false]);
  });

  test('une panne laisse tenir encore, avec un avis', () => {
    expect(play(...sealing, { type: 'seal-failed', refusal: null })).toMatchObject({ stage: 'waiting', notice: 'sealFailed' });
  });

  test('l’avis se consomme', () => {
    const state = play({ type: 'proceed' }, { type: 'open-requested', online: true }, { type: 'open-failed', refusal: null }, { type: 'notice-shown' });
    expect(state.notice).toBeNull();
  });

  test('l’autre a ouvert : l’écran le dit', () => {
    expect(play({ type: 'proceed' }, { type: 'other-started' }).otherWaiting).toBe(true);
  });
});

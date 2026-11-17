import { describe, expect, test } from 'bun:test';
import type { ProfileCircleView } from '@meeshy/shared/utils/profile-circle-view';

import { circleVerdictKeysOf, circleVerdictStateOf, verdictMustRefresh } from './user-profile-circle-verdict';

const view: ProfileCircleView = { isSelf: false, level: 'FRIEND', sharesCommunity: false, capabilities: {}, missing: null };

describe('le verdict du cercle distingue un ancien serveur d’un verdict qui n’est pas encore là (revue #18879)', () => {
  test('servi : le verdict', () => {
    expect(circleVerdictStateOf({ enabled: true, status: 'success', data: view })).toEqual({ kind: 'served', view });
  });

  test('ancien serveur : la réponse est arrivée sans cercle', () => {
    expect(circleVerdictStateOf({ enabled: true, status: 'success', data: null })).toEqual({ kind: 'legacy' });
  });

  test('en chargement ou en échec : en attente, jamais l’ancienne règle', () => {
    expect(circleVerdictStateOf({ enabled: true, status: 'pending', data: undefined })).toEqual({ kind: 'pending' });
    expect(circleVerdictStateOf({ enabled: true, status: 'error', data: undefined })).toEqual({ kind: 'pending' });
  });

  test('non demandé (sans compte, soi, bloqué) : la fiche d’avant', () => {
    expect(circleVerdictStateOf({ enabled: false, status: 'pending', data: undefined })).toEqual({ kind: 'legacy' });
  });
});

describe('le verdict ne se relit que quand la relation BOUGE', () => {
  test('les liens qui arrivent en cache ne font pas relire', () => {
    expect(verdictMustRefresh({ kind: 'friend', link: undefined }, { kind: 'friend', link: 'friend/friend' })).toBe(false);
  });

  test('un lien qui change fait relire', () => {
    expect(verdictMustRefresh({ kind: 'friend', link: 'friend/friend' }, { kind: 'friend', link: 'close/close' })).toBe(true);
  });

  test('une relation qui change fait relire, liens connus ou non', () => {
    expect(verdictMustRefresh({ kind: 'none', link: undefined }, { kind: 'friend', link: undefined })).toBe(true);
  });

  test('rien ne change : rien ne part', () => {
    expect(verdictMustRefresh({ kind: 'friend', link: 'friend/friend' }, { kind: 'friend', link: 'friend/friend' })).toBe(false);
  });
});

describe('la fiche et la carte relisent la même paire', () => {
  test('les deux clés — par pseudo (fiche) et par identifiant (carte) — sont invalidées', () => {
    const keys = circleVerdictKeysOf({ handle: 'Leo.M', personId: '65f0a1b2c3d4e5f6a7b8c9d0', viewerId: 'me' });
    expect(keys).toEqual([
      ['directory', 'people-circle', 'leo.m', 'me'],
      ['directory', 'people-circle', '65f0a1b2c3d4e5f6a7b8c9d0', 'me'],
    ]);
  });

  test('sans identifiant distinct, une seule clé', () => {
    expect(circleVerdictKeysOf({ handle: 'leo', personId: '', viewerId: 'me' })).toHaveLength(1);
  });
});

/**
 * « Choisir sur la carte » (#19557) : la relecture de MON partage annonce que la passerelle
 * accepte un point choisi à la main. C'est le SEUL signal qu'un client lit pour proposer le
 * choix ; il traverse le vrai sérialiseur de la route (fast-json-stringify retire toute clé que
 * le schéma ne déclare pas), avec ou sans partage en cours — et rien de plus ne part à côté.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import fastJson from 'fast-json-stringify';
import type { SharedLocationOwnSnapshot } from '@meeshy/shared/types/shared-location';
import { ownSharedLocationSchema, servedOwnSharedLocation } from '../../../../routes/relations/locations';

const serialize = fastJson({
  type: 'object',
  properties: { success: { type: 'boolean' }, data: ownSharedLocationSchema },
} as unknown as Parameters<typeof fastJson>[0]);

const servi = (own: SharedLocationOwnSnapshot) => JSON.parse(serialize({ success: true, data: servedOwnSharedLocation(own) })).data;

const partage: SharedLocationOwnSnapshot = {
  recipients: [{ userId: '6300000000000000000000a1', precision: 'neighborhood', expiresAt: '2026-11-21T12:00:00.000Z' }],
  expiresAt: '2026-11-21T12:00:00.000Z',
  shareBattery: false,
  startedAt: '2026-11-21T11:00:00.000Z',
  source: 'manual',
};

describe('la relecture de mon partage annonce le point choisi', () => {
  it('sans partage en cours : l’annonce est servie (le client la lit AVANT de partager)', () => {
    expect(servi({ recipients: [], expiresAt: null })).toEqual({ recipients: [], expiresAt: null, acceptsManualSource: true, acceptsExpectedStart: true });
  });

  it('avec un partage : l’annonce s’ajoute, rien de ce qui était servi ne se perd', () => {
    expect(servi(partage)).toEqual({ ...partage, acceptsManualSource: true, acceptsExpectedStart: true });
  });

  it('aucune position ne voyage à côté, même si l’état la portait', () => {
    const avecPosition = { ...partage, latitude: 48.8566, longitude: 2.3522 } as SharedLocationOwnSnapshot;
    expect(JSON.stringify(servi(avecPosition))).not.toMatch(/latitude|longitude|48\.85|2\.35/);
  });
});

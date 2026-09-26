/**
 * LES RÈGLES D'APPEL — un seul jeu, et ses relations gardées (#8074).
 *
 * Deux choses tiennent ici :
 *  1. les RELATIONS entre les délais : chacune est une panne précise si elle
 *     casse (un nettoyage plus court que la sonnerie tue un appel qui sonne,
 *     une poussée qui survit à la sonnerie fait sonner un appel déjà manqué) ;
 *  2. la PARITÉ du miroir Swift (`CallRules.swift`) : le SDK iOS ne peut pas
 *     importer ce module, il en est la projection — ce témoin lit sa source, il
 *     n'a besoin ni de Xcode ni d'un simulateur.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CALL_RING_TIMEOUT_MS,
  CALL_RING_GC_MS,
  CALL_OFFER_TIMEOUT_MS,
  CALL_CONNECTING_GRACE_MS,
  CALL_HEARTBEAT_INTERVAL_MS,
  CALL_HEARTBEAT_TIMEOUT_MS,
  CALL_BACKGROUND_HEARTBEAT_TIMEOUT_MS,
  CALL_PUSH_TTL_MS,
  CALL_MAX_PARTICIPANTS,
  CALL_MESH_CEILING,
} from '../types/call-rules.js';
import * as sharedTypes from '../types/index.js';

describe('règles d’appel — relations entre les délais', () => {
  it('la sonnerie dure 45 s, partout', () => {
    expect(CALL_RING_TIMEOUT_MS).toBe(45_000);
  });

  it('le nettoyage d’un appel qui sonne passe APRÈS la sonnerie, avec une marge', () => {
    expect(CALL_RING_GC_MS).toBeGreaterThan(CALL_RING_TIMEOUT_MS);
    expect(CALL_RING_GC_MS - CALL_RING_TIMEOUT_MS).toBeGreaterThanOrEqual(15_000);
  });

  it('la poussée d’appel ne survit pas à la sonnerie — elle ferait sonner un appel manqué', () => {
    expect(CALL_PUSH_TTL_MS).toBeLessThanOrEqual(CALL_RING_TIMEOUT_MS);
    expect(CALL_PUSH_TTL_MS).toBeGreaterThan(0);
  });

  it('l’offre attendue après le décroché tient dans la grâce de connexion du serveur', () => {
    expect(CALL_OFFER_TIMEOUT_MS).toBeLessThan(CALL_CONNECTING_GRACE_MS);
  });

  it('le serveur tolère au moins trois battements perdus avant de déclarer un pair mort', () => {
    expect(CALL_HEARTBEAT_TIMEOUT_MS).toBeGreaterThanOrEqual(3 * CALL_HEARTBEAT_INTERVAL_MS);
  });

  it('un pair en arrière-plan a plus de grâce qu’un pair au premier plan', () => {
    expect(CALL_BACKGROUND_HEARTBEAT_TIMEOUT_MS).toBeGreaterThan(CALL_HEARTBEAT_TIMEOUT_MS);
  });

  it('le plafond de participants tient dans le maillage — pas de 9999 sans SFU', () => {
    expect(CALL_MAX_PARTICIPANTS).toBeGreaterThanOrEqual(2);
    expect(CALL_MAX_PARTICIPANTS).toBeLessThanOrEqual(CALL_MESH_CEILING);
  });

  it('le paquet les exporte par sa racine de types', () => {
    expect(sharedTypes.CALL_RING_TIMEOUT_MS).toBe(CALL_RING_TIMEOUT_MS);
    expect(sharedTypes.CALL_MAX_PARTICIPANTS).toBe(CALL_MAX_PARTICIPANTS);
  });
});

const SWIFT_MIRROR = join(import.meta.dirname, '../../MeeshySDK/Sources/MeeshySDK/Models/CallRules.swift');

function swiftConstant(source: string, name: string): number {
  const match = new RegExp(`public static let ${name}(?::\\s*\\w+)? = ([0-9_.]+)\\b`).exec(source);
  if (!match?.[1]) throw new Error(`CallRules.${name} introuvable dans le miroir Swift`);
  return Number(match[1].replace(/_/g, ''));
}

describe('règles d’appel — le miroir Swift dit les mêmes valeurs', () => {
  const source = readFileSync(SWIFT_MIRROR, 'utf8');
  const seconds = (ms: number) => ms / 1000;

  it.each([
    ['ringTimeout', seconds(CALL_RING_TIMEOUT_MS)],
    ['ringGarbageCollection', seconds(CALL_RING_GC_MS)],
    ['offerTimeout', seconds(CALL_OFFER_TIMEOUT_MS)],
    ['connectingGrace', seconds(CALL_CONNECTING_GRACE_MS)],
    ['heartbeatInterval', seconds(CALL_HEARTBEAT_INTERVAL_MS)],
    ['heartbeatTimeout', seconds(CALL_HEARTBEAT_TIMEOUT_MS)],
    ['backgroundHeartbeatTimeout', seconds(CALL_BACKGROUND_HEARTBEAT_TIMEOUT_MS)],
    ['pushTimeToLive', seconds(CALL_PUSH_TTL_MS)],
    ['maxParticipants', CALL_MAX_PARTICIPANTS],
  ] as const)('CallRules.%s = %d', (name, expected) => {
    expect(swiftConstant(source, name)).toBe(expected);
  });
});

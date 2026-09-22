/**
 * Ce qu'un ENVOI écrit d'un éphémère, et ce qu'il cesse d'écrire (#7451).
 *
 * Avant ce lot, `Message.ephemeralDuration` n'avait AUCUN écrivain et
 * `Message.expiresAt` portait l'échéance que le client avait calculée chez lui.
 * Les deux colonnes changent de main dans le même mouvement, et l'inversion
 * doit se lire d'un témoin : la DURÉE est ce que le client dit, l'ÉCHÉANCE est
 * ce que le serveur décide.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { EPHEMERAL_UNRECEIVED_RETENTION_MS } from '@meeshy/shared/utils/ephemeral-countdown';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { composeMessageEffectFlags, ephemeralSendFields } from '../ephemeralSendFields';

const NOW = new Date('2026-09-22T12:00:00.000Z');

describe('ephemeralSendFields', () => {
  it("enregistre la durée d'un client à jour, et pose l'échéance au PLAFOND de rétention", () => {
    // Le client a envoyé 30 s. Ce qui part en base n'est PAS « maintenant + 30 s » :
    // personne n'a encore rien reçu, donc rien ne décompte. La colonne porte le
    // plafond de rétention — le seul filet contre un message que personne ne
    // reçoit jamais.
    expect(ephemeralSendFields({ ephemeralDuration: 30, now: NOW })).toEqual({
      ephemeralDuration: 30,
      expiresAt: new Date(NOW.getTime() + EPHEMERAL_UNRECEIVED_RETENTION_MS),
    });
  });

  it("DÉRIVE la durée d'un client déjà distribué qui n'envoie qu'une échéance", () => {
    expect(
      ephemeralSendFields({ expiresAt: new Date(NOW.getTime() + 300_000), now: NOW }),
    ).toEqual({
      ephemeralDuration: 300,
      expiresAt: new Date(NOW.getTime() + EPHEMERAL_UNRECEIVED_RETENTION_MS),
    });
  });

  it("laisse la colonne à son AUTRE écrivain sur un message non éphémère", () => {
    // `expiresAt` sert aussi la grâce de vue unique (`scheduleViewOnceBurn`).
    // L'écraser ici rallongerait la vie d'un contenu voulu plus court.
    expect(ephemeralSendFields({ now: NOW })).toEqual({
      ephemeralDuration: null,
      expiresAt: null,
    });
  });
});

describe('composeMessageEffectFlags', () => {
  it("pose le bit EPHEMERAL sur la seule DURÉE — un client à jour n'envoie plus d'échéance", () => {
    expect(composeMessageEffectFlags({ ephemeralDuration: 30 }) & MESSAGE_EFFECT_FLAGS.EPHEMERAL)
      .toBe(MESSAGE_EFFECT_FLAGS.EPHEMERAL);
  });

  it("le pose toujours sur la seule échéance — un ancien client n'envoie que ça", () => {
    expect(composeMessageEffectFlags({ expiresAt: NOW }) & MESSAGE_EFFECT_FLAGS.EPHEMERAL)
      .toBe(MESSAGE_EFFECT_FLAGS.EPHEMERAL);
  });

  it('ne pose aucun bit sur un message ordinaire', () => {
    expect(composeMessageEffectFlags({})).toBe(0);
  });

  it('conserve les bits que le client a posés lui-même', () => {
    expect(composeMessageEffectFlags({ effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }))
      .toBe(MESSAGE_EFFECT_FLAGS.BLURRED);
  });
});

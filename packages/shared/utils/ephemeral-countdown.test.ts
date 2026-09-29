/**
 * Le décompte d'un éphémère part de la RÉCEPTION, jamais de l'envoi (#7451).
 *
 * Directive porteur 2026-09-22 : « les messages avec temps décompté ne doivent
 * décompter que lorsque l'utilisateur l'a reçu ! Le serveur rend le message
 * indisponible après le temps imparti + 1 h ».
 *
 * Ces témoins portent la LOI — les quatre dates et leurs bords — et ils vivent
 * ICI, à côté d'elle, plutôt que dans la suite du gateway où ils ont d'abord
 * été écrits. Deux raisons, et la seconde a mordu :
 *
 *   - la loi est PARTAGÉE : les trois clients la lisent, pas seulement la
 *     passerelle. Ses témoins appartiennent à son paquet ;
 *   - le seuil de couverture de `packages/shared` ne voit QUE ce que son
 *     propre runner exécute. Des témoins parfaits, exécutés ailleurs, laissent
 *     le module à 8 % ici — et c'est le gate `Test shared` qui l'a dit.
 *
 * Il n'en existe donc pas de second exemplaire : la suite du gateway garde le
 * CÂBLAGE (réception, service par lecteur, balayage), qui exerce son code.
 *
 * ─── UN TÉMOIN DE DÉCOMPTE S'ÉCRIT SUR UN DESTINATAIRE QUI A ATTENDU ────────
 *
 * Sur un destinataire qui reçoit à l'instant de l'envoi, l'ancienne règle
 * (échéance = envoi + durée) et la nouvelle rendent le MÊME verdict : un témoin
 * posé là ne peut pas tomber. Chacun de ceux-ci écarte donc la réception de
 * l'envoi.
 *
 */

import { describe, it, expect } from 'vitest';
import {
  EPHEMERAL_UNAVAILABILITY_GRACE_MS,
  EPHEMERAL_UNRECEIVED_RETENTION_MS,
  ephemeralDestructionAt,
  hasPerReaderEphemeralDeadline,
  isAfterReadEphemeral,
  isEphemeralServable,
  isInheritedEphemeralServable,
  inheritedEphemeralExpiresAt,
  normalizeEphemeralDuration,
  recipientEphemeralDeadline,
  servedEphemeralExpiresAt,
} from './ephemeral-countdown';
import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags';
import { messageProtection } from './message-protection';

const SENT_AT = new Date('2026-09-22T10:00:00.000Z');
const at = (msAfterSend: number): Date => new Date(SENT_AT.getTime() + msAfterSend);

describe('normalizeEphemeralDuration — ce qu\'un envoi déclare', () => {
  it('garde la durée d\'un client à jour, sans regarder l\'échéance', () => {
    expect(
      normalizeEphemeralDuration({ ephemeralDuration: 300, expiresAt: at(30_000), now: SENT_AT }),
    ).toBe(300);
  });

  it('dérive la durée d\'un ancien client qui n\'envoie qu\'une échéance', () => {
    expect(
      normalizeEphemeralDuration({ expiresAt: at(300_000), now: SENT_AT }),
    ).toBe(300);
  });

  it('plancher d\'une seconde : une échéance déjà passée reste une durée', () => {
    expect(
      normalizeEphemeralDuration({ expiresAt: at(-60_000), now: SENT_AT }),
    ).toBe(1);
  });

  it('rend null quand le message n\'est pas éphémère', () => {
    expect(normalizeEphemeralDuration({ now: SENT_AT })).toBeNull();
    expect(normalizeEphemeralDuration({ ephemeralDuration: 0, now: SENT_AT })).toBeNull();
    expect(normalizeEphemeralDuration({ ephemeralDuration: -5, now: SENT_AT })).toBeNull();
    expect(normalizeEphemeralDuration({ expiresAt: 'pas-une-date', now: SENT_AT })).toBeNull();
  });
});

describe('recipientEphemeralDeadline — D(u)', () => {
  it('part de la réception du destinataire, pas de l\'envoi', () => {
    const received = at(3_600_000);
    expect(
      recipientEphemeralDeadline({ receivedAt: received, ephemeralDuration: 30 }),
    ).toEqual(new Date(received.getTime() + 30_000));
  });

  it('rien ne décompte tant que le destinataire n\'a rien reçu', () => {
    expect(recipientEphemeralDeadline({ receivedAt: null, ephemeralDuration: 30 })).toBeNull();
  });

  it('rien ne décompte sur un message non éphémère', () => {
    expect(recipientEphemeralDeadline({ receivedAt: SENT_AT, ephemeralDuration: null })).toBeNull();
  });
});

describe('ephemeralDestructionAt — l\'heure interne de l\'effacement', () => {
  it('suit le PLUS TARDIF des décomptes lancés, plus la grâce d\'une heure', () => {
    const tot = at(60_000);
    const tard = at(600_000);
    expect(
      ephemeralDestructionAt({
        sentAt: SENT_AT,
        ephemeralDuration: 30,
        recipientDeadlines: [
          recipientEphemeralDeadline({ receivedAt: tot, ephemeralDuration: 30 }),
          recipientEphemeralDeadline({ receivedAt: tard, ephemeralDuration: 30 }),
        ],
      }),
    ).toEqual(new Date(tard.getTime() + 30_000 + EPHEMERAL_UNAVAILABILITY_GRACE_MS));
  });

  it('un destinataire qui n\'a rien reçu ne repousse rien', () => {
    const recu = at(60_000);
    expect(
      ephemeralDestructionAt({
        sentAt: SENT_AT,
        ephemeralDuration: 30,
        recipientDeadlines: [recipientEphemeralDeadline({ receivedAt: recu, ephemeralDuration: 30 }), null],
      }),
    ).toEqual(new Date(recu.getTime() + 30_000 + EPHEMERAL_UNAVAILABILITY_GRACE_MS));
  });

  it('tombe sur le plafond de rétention quand PERSONNE n\'a reçu (#7450)', () => {
    expect(
      ephemeralDestructionAt({ sentAt: SENT_AT, ephemeralDuration: 30, recipientDeadlines: [null, null] }),
    ).toEqual(new Date(SENT_AT.getTime() + EPHEMERAL_UNRECEIVED_RETENTION_MS));
  });

  it('laisse la colonne à son autre écrivain sur un message non éphémère', () => {
    expect(
      ephemeralDestructionAt({ sentAt: SENT_AT, ephemeralDuration: null, recipientDeadlines: [] }),
    ).toBeNull();
  });
});

describe('servedEphemeralExpiresAt — l\'échéance PAR LECTEUR', () => {
  const D_LECTEUR = at(90_000);
  const D_MAX = at(600_000);

  it('sert son propre D(u) au destinataire, pas l\'heure interne de destruction', () => {
    expect(
      servedEphemeralExpiresAt({
        ephemeralDuration: 30,
        rawExpiresAt: at(EPHEMERAL_UNRECEIVED_RETENTION_MS),
        isSender: false,
        readerDeadline: D_LECTEUR,
        latestRecipientDeadline: D_MAX,
      }),
    ).toEqual(D_LECTEUR);
  });

  it('sert null au destinataire qui n\'a pas encore reçu', () => {
    expect(
      servedEphemeralExpiresAt({
        ephemeralDuration: 30,
        rawExpiresAt: at(EPHEMERAL_UNRECEIVED_RETENTION_MS),
        isSender: false,
        readerDeadline: null,
        latestRecipientDeadline: D_MAX,
      }),
    ).toBeNull();
  });

  it('sert à l\'expéditeur la plus TARDIVE des échéances connues', () => {
    expect(
      servedEphemeralExpiresAt({
        ephemeralDuration: 30,
        rawExpiresAt: null,
        isSender: true,
        readerDeadline: null,
        latestRecipientDeadline: D_MAX,
      }),
    ).toEqual(D_MAX);
  });

  it('sert null à l\'expéditeur tant que personne n\'a reçu — « en attente de réception »', () => {
    expect(
      servedEphemeralExpiresAt({
        ephemeralDuration: 30,
        rawExpiresAt: at(EPHEMERAL_UNRECEIVED_RETENTION_MS),
        isSender: true,
        readerDeadline: null,
        latestRecipientDeadline: null,
      }),
    ).toBeNull();
  });

  it("sert null sur un message non éphémère SANS colonne — `rawExpiresAt` absent", () => {
    // Le repli `?? null` de la branche non éphémère : un message ordinaire n'a
    // ni durée ni échéance, et ce qui sort ne doit pas être `undefined` — les
    // trois clients lisent `null` comme « aucun décompte », jamais comme
    // « le serveur n'a pas répondu ».
    expect(
      servedEphemeralExpiresAt({ ephemeralDuration: null, isSender: false }),
    ).toBeNull();
  });

  it('laisse passer la colonne brute d\'un message non éphémère (vue unique)', () => {
    const grace = at(300_000);
    expect(
      servedEphemeralExpiresAt({
        ephemeralDuration: null,
        rawExpiresAt: grace,
        isSender: false,
        readerDeadline: null,
        latestRecipientDeadline: null,
      }),
    ).toEqual(grace);
  });
});

describe('isEphemeralServable — la coupure à D(u) + 1 h', () => {
  const D = at(90_000);

  it('sert encore le message pendant la grâce, après que la bulle a disparu', () => {
    expect(
      isEphemeralServable({
        ephemeralDuration: 30,
        servedExpiresAt: D,
        now: new Date(D.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS - 1),
      }),
    ).toBe(true);
  });

  it('cesse de le servir à D(u) + 1 h', () => {
    expect(
      isEphemeralServable({
        ephemeralDuration: 30,
        servedExpiresAt: D,
        now: new Date(D.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS),
      }),
    ).toBe(false);
  });

  it('sert un décompte JAMAIS lancé : c\'est ce message-là qu\'il faut livrer', () => {
    expect(
      isEphemeralServable({
        ephemeralDuration: 30,
        servedExpiresAt: null,
        now: at(EPHEMERAL_UNRECEIVED_RETENTION_MS - 1),
      }),
    ).toBe(true);
  });

  it('ne coupe jamais un message non éphémère', () => {
    expect(
      isEphemeralServable({ ephemeralDuration: null, servedExpiresAt: at(-1), now: SENT_AT }),
    ).toBe(true);
  });
});

/**
 * Flamme-œil (#8302) : aucune DURÉE, mais une échéance PAR LECTEUR quand même —
 * celle que la consommation pose (« vu puis quitté »). Les témoins écartent
 * donc la raw column (le plafond de rétention) de ce qui est servi : une
 * lecture qui la servirait afficherait « disparaît dans 7 jours ».
 */
describe('flamme-œil — une échéance par lecteur sans durée (#8302)', () => {
  const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;
  const RETENTION = at(EPHEMERAL_UNRECEIVED_RETENTION_MS);
  const CONSUMED = at(120_000);

  it('reconnaît le bit, et lui seul', () => {
    expect(isAfterReadEphemeral(AFTER_READ)).toBe(true);
    expect(isAfterReadEphemeral(MESSAGE_EFFECT_FLAGS.EPHEMERAL)).toBe(false);
    expect(isAfterReadEphemeral(null)).toBe(false);
  });

  it('a une échéance par lecteur, comme un éphémère à durée', () => {
    expect(hasPerReaderEphemeralDeadline({ effectFlags: AFTER_READ })).toBe(true);
    expect(hasPerReaderEphemeralDeadline({ ephemeralDuration: 30 })).toBe(true);
    expect(hasPerReaderEphemeralDeadline({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL })).toBe(false);
  });

  it('ne sert JAMAIS le plafond de rétention à un lecteur qui n\'a pas consommé', () => {
    expect(
      servedEphemeralExpiresAt({ effectFlags: AFTER_READ, rawExpiresAt: RETENTION, isSender: false, readerDeadline: null }),
    ).toBeNull();
  });

  it('sert au lecteur l\'instant de SA consommation', () => {
    expect(
      servedEphemeralExpiresAt({ effectFlags: AFTER_READ, rawExpiresAt: RETENTION, isSender: false, readerDeadline: CONSUMED }),
    ).toEqual(CONSUMED);
  });

  it('ne sert rien à l\'expéditeur, même quand un lecteur a consommé : il le garde', () => {
    expect(
      servedEphemeralExpiresAt({
        effectFlags: AFTER_READ,
        rawExpiresAt: RETENTION,
        isSender: true,
        readerDeadline: null,
        latestRecipientDeadline: CONSUMED,
      }),
    ).toBeNull();
  });

  it('cesse d\'être servi au lecteur une heure après sa consommation', () => {
    expect(
      isEphemeralServable({
        effectFlags: AFTER_READ,
        servedExpiresAt: CONSUMED,
        now: new Date(CONSUMED.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS),
      }),
    ).toBe(false);
    expect(
      isEphemeralServable({ effectFlags: AFTER_READ, servedExpiresAt: null, now: at(EPHEMERAL_UNRECEIVED_RETENTION_MS - 1) }),
    ).toBe(true);
  });

  it('est un éphémère pour la protection, même si le bit EPHEMERAL manque', () => {
    expect(messageProtection({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ }).ephemeral).toBe(true);
  });
});

/**
 * #8630 — décision porteur 2026-09-29 : « quand elle se détruit, elle entraîne
 * la destruction du message qui l'a cité ». La réponse meurt, POUR UN LECTEUR,
 * à la plus proche des échéances servies de sa chaîne de citations — la sienne
 * comprise. Le témoin est posé sur une réponse qui vivrait PLUS LONGTEMPS que
 * ce qu'elle cite : c'est le seul cas où la règle change le verdict.
 */
describe('la destruction d\'un message cité entraîne ses réponses (#8630)', () => {
  const QUOTED_DEATH = new Date('2026-09-29T10:00:00.000Z');
  const OWN_DEATH = new Date('2026-09-29T12:00:00.000Z');

  it('retient la plus proche des échéances de la chaîne, jamais la plus lointaine', () => {
    expect(inheritedEphemeralExpiresAt([OWN_DEATH, null, QUOTED_DEATH, undefined])).toEqual(QUOTED_DEATH);
  });

  it('ne fabrique aucune échéance quand rien de la chaîne n\'a d\'échéance servie', () => {
    expect(inheritedEphemeralExpiresAt([null, undefined])).toBeNull();
    expect(inheritedEphemeralExpiresAt([])).toBeNull();
  });

  it('cesse de servir la réponse une heure après la mort du message cité, comme le cité lui-même', () => {
    const justBefore = new Date(QUOTED_DEATH.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS - 1);
    const atGraceEnd = new Date(QUOTED_DEATH.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS);
    expect(isInheritedEphemeralServable({ inheritedExpiresAt: QUOTED_DEATH, now: justBefore })).toBe(true);
    expect(isInheritedEphemeralServable({ inheritedExpiresAt: QUOTED_DEATH, now: atGraceEnd })).toBe(false);
  });

  it('sert toujours une réponse dont aucun ancêtre n\'est mort pour ce lecteur', () => {
    expect(isInheritedEphemeralServable({ inheritedExpiresAt: null, now: OWN_DEATH })).toBe(true);
  });
});

/**
 * `expiresAt` est servi PAR LECTEUR — et la colonne ne sort plus jamais (#7451).
 *
 * `Message.expiresAt` porte désormais l'heure INTERNE de destruction : le
 * plafond de rétention (sept jours) tant que personne n'a reçu, puis le plus
 * tardif des décomptes plus une heure. La servir telle quelle afficherait « ce
 * message disparaît dans 7 jours » sous un éphémère de trente secondes.
 *
 * ─── LE TÉMOIN QUI COMPTE EST CELUI DE LA PROJECTION, PAS DU `select` ───────
 *
 * Un mock Prisma rend ce qu'on lui dit quel que soit le `select` : un témoin
 * posé sur la requête passerait au vert sur une projection qui sert encore la
 * colonne. Ceux-ci assertent donc sur la VALEUR SERVIE.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EPHEMERAL_UNAVAILABILITY_GRACE_MS } from '@meeshy/shared/utils/ephemeral-countdown';

import {
  isEphemeralServableToReader,
  loadEphemeralReaderDeadlines,
} from '../ephemeralReaderDeadlines';
import { mapMessageProtectionFields } from '../messageProtectionProjection';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const LECTEUR = '507f1f77bcf86cd799439013';
const AUTRE = '507f1f77bcf86cd799439014';
const EXPEDITEUR = '507f1f77bcf86cd799439015';

const D_LECTEUR = new Date('2026-09-22T11:00:30.000Z');
const D_AUTRE = new Date('2026-09-22T11:10:30.000Z');
/** L'heure INTERNE : sept jours après l'envoi, ce qu'aucun lecteur ne doit voir. */
const DESTRUCTION = new Date('2026-09-29T10:00:00.000Z');

const entryFindMany = jest.fn<any>();
const prisma = { messageStatusEntry: { findMany: entryFindMany } } as any;

const ephemere = (over: Record<string, unknown> = {}) => ({
  id: MESSAGE_ID,
  senderId: EXPEDITEUR,
  ephemeralDuration: 30,
  expiresAt: DESTRUCTION,
  isViewOnce: false,
  maxViewOnceCount: null,
  viewOnceCount: 0,
  isBlurred: false,
  effectFlags: 1,
  ...over,
});

beforeEach(() => {
  entryFindMany.mockReset();
  entryFindMany.mockResolvedValue([
    { messageId: MESSAGE_ID, participantId: LECTEUR, ephemeralExpiresAt: D_LECTEUR },
    { messageId: MESSAGE_ID, participantId: AUTRE, ephemeralExpiresAt: D_AUTRE },
  ]);
});

describe('loadEphemeralReaderDeadlines', () => {
  it("rend au destinataire SON échéance, jamais celle d'un autre ni la colonne", async () => {
    const carte = await loadEphemeralReaderDeadlines(prisma, [ephemere()], LECTEUR);

    expect(carte.get(MESSAGE_ID)).toEqual({
      isSender: false,
      readerDeadline: D_LECTEUR,
      latestRecipientDeadline: D_AUTRE,
    });
  });

  it("ne rend AUCUNE échéance au destinataire qui n'a pas encore reçu", async () => {
    entryFindMany.mockResolvedValue([
      { messageId: MESSAGE_ID, participantId: AUTRE, ephemeralExpiresAt: D_AUTRE },
    ]);

    expect((await loadEphemeralReaderDeadlines(prisma, [ephemere()], LECTEUR))
      .get(MESSAGE_ID)?.readerDeadline).toBeNull();
  });

  it("reconnaît l'expéditeur, à qui la plus TARDIVE revient", async () => {
    const carte = await loadEphemeralReaderDeadlines(prisma, [ephemere()], EXPEDITEUR);

    expect(carte.get(MESSAGE_ID)).toMatchObject({ isSender: true, latestRecipientDeadline: D_AUTRE });
  });

  it("ne paie AUCUNE requête sur une page sans éphémère — la porte la plus appelée du gateway", async () => {
    const carte = await loadEphemeralReaderDeadlines(
      prisma,
      [ephemere({ ephemeralDuration: null })],
      LECTEUR,
    );

    expect(carte.size).toBe(0);
    expect(entryFindMany).not.toHaveBeenCalled();
  });

  it('ferme par défaut quand la lecture échoue — jamais l’échéance de quelqu’un d’autre', async () => {
    entryFindMany.mockRejectedValue(new Error('DB down'));

    expect((await loadEphemeralReaderDeadlines(prisma, [ephemere()], LECTEUR)).get(MESSAGE_ID))
      .toEqual({ isSender: false, readerDeadline: null, latestRecipientDeadline: null });
  });
});

describe('mapMessageProtectionFields — ce qui SORT', () => {
  it("sert D(lecteur) au destinataire, jamais l'heure interne de destruction", async () => {
    const carte = await loadEphemeralReaderDeadlines(prisma, [ephemere()], LECTEUR);

    const servi = mapMessageProtectionFields(ephemere(), carte.get(MESSAGE_ID));

    expect(servi.expiresAt).toEqual(D_LECTEUR);
    expect(servi.ephemeralDuration).toBe(30);
  });

  it("sert la plus tardive à l'expéditeur", async () => {
    const carte = await loadEphemeralReaderDeadlines(prisma, [ephemere()], EXPEDITEUR);

    expect(mapMessageProtectionFields(ephemere(), carte.get(MESSAGE_ID)).expiresAt).toEqual(D_AUTRE);
  });

  it("sert `null` — et surtout PAS la colonne — à un appelant qui n'a rien résolu", () => {
    // Le cas de `GET .../messages/search` et des routes de lien : une porte de
    // service échoue en montrant MOINS, jamais plus.
    expect(mapMessageProtectionFields(ephemere()).expiresAt).toBeNull();
  });

  it('laisse intacte la grâce de vue unique sur un message NON éphémère', () => {
    const grace = new Date('2026-09-22T10:05:00.000Z');

    expect(
      mapMessageProtectionFields(ephemere({ ephemeralDuration: null, expiresAt: grace })).expiresAt,
    ).toEqual(grace);
  });
});

describe('isEphemeralServableToReader — la coupure à D(u) + 1 h', () => {
  const resolution = { isSender: false, readerDeadline: D_LECTEUR, latestRecipientDeadline: D_AUTRE };

  it("sert encore pendant la grâce, après que la bulle a disparu de l'écran", () => {
    expect(
      isEphemeralServableToReader(
        ephemere(),
        resolution,
        new Date(D_LECTEUR.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS - 1),
      ),
    ).toBe(true);
  });

  it('cesse de servir à D(u) + 1 h, alors que le contenu vit encore en base', () => {
    expect(
      isEphemeralServableToReader(
        ephemere(),
        resolution,
        new Date(D_LECTEUR.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS),
      ),
    ).toBe(false);
  });

  it("sert le message d'un destinataire qui n'a rien reçu — c'est celui-là qu'il faut livrer", () => {
    expect(
      isEphemeralServableToReader(
        ephemere(),
        { isSender: false, readerDeadline: null, latestRecipientDeadline: D_AUTRE },
        new Date('2026-09-25T00:00:00.000Z'),
      ),
    ).toBe(true);
  });
});

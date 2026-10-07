/**
 * Ce qu'une COPIE porte de la protection de sa source (#9572) — le transfert
 * (`forwardedFromId`) et la diffusion (`copyAttachmentsFromMessageId`).
 *
 * Critère de fin de l'issue : aucune requête ne peut produire une copie moins
 * protégée que sa source. La règle vit dans `@meeshy/shared`
 * (`contentExitLaw`, `forwardedCopyProtection`) ; ces témoins prouvent ce que
 * la passerelle en fait, APRÈS la contagion des réponses.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { diffusedCopyFields, exitProtectedCopy, forwardedCopyFields } from '../copyExitProtection';

const { EPHEMERAL, BLURRED, VIEW_ONCE, EPHEMERAL_AFTER_READ, SHAKE } = MESSAGE_EFFECT_FLAGS;
const FLAME_BITS = EPHEMERAL | EPHEMERAL_AFTER_READ;

const projection = (over: Record<string, unknown> = {}) => ({
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ephemeralDuration: null,
  expiresAt: null,
  attachments: [] as Array<{ isViewOnce: boolean; isBlurred: boolean; effectFlags: number }>,
  ...over,
});
const piece = (over: Record<string, unknown> = {}) => ({ isViewOnce: false, isBlurred: false, effectFlags: 0, ...over });

describe('forwardedCopyFields — le transfert', () => {
  it('ne touche à rien quand la source n’impose rien', () => {
    const declared = { effectFlags: SHAKE, ephemeralDuration: 60 };
    expect(forwardedCopyFields(declared, null)).toBe(declared);
  });

  it('pose durée ET après lecture sur la copie d’une flamme à durée', () => {
    expect(forwardedCopyFields({}, { ephemeralDuration: 30, isBlurred: false })).toEqual({
      effectFlags: FLAME_BITS,
      isBlurred: false,
      ephemeralDuration: 30,
      expiresAt: undefined,
      durationBoundsAfterRead: true,
    });
  });

  it.each([
    ['plus courte : gardée', 15, 15],
    ['plus longue : ramenée à la source', 86_400, 30],
    ['invalide : celle de la source', -1, 30],
  ])('durée demandée %s', (_label, requested, expected) => {
    const fields = forwardedCopyFields({ ephemeralDuration: requested }, { ephemeralDuration: 30, isBlurred: false });
    expect(fields.ephemeralDuration).toBe(expected);
  });

  it('écarte l’échéance qu’un ancien client aurait calculée chez lui', () => {
    const fields = forwardedCopyFields(
      { expiresAt: new Date('2027-01-01T00:00:00.000Z') },
      { ephemeralDuration: 30, isBlurred: false },
    );
    expect(fields.expiresAt).toBeUndefined();
    expect(fields.ephemeralDuration).toBe(30);
  });

  it('impose le flou de la source et garde les effets décoratifs de la requête', () => {
    expect(
      forwardedCopyFields({ effectFlags: SHAKE, isBlurred: false }, { ephemeralDuration: 30, isBlurred: true }),
    ).toMatchObject({ effectFlags: SHAKE | FLAME_BITS | BLURRED, isBlurred: true });
  });

  it('impose le seul flou d’une source ordinaire, sans toucher à ce que la requête dit de l’éphémère', () => {
    const expiresAt = new Date('2027-01-01T00:00:00.000Z');
    expect(
      forwardedCopyFields({ ephemeralDuration: 60, expiresAt }, { ephemeralDuration: null, isBlurred: true }),
    ).toEqual({ ephemeralDuration: 60, expiresAt, effectFlags: BLURRED, isBlurred: true });
  });

  it('tient après une contagion de réponse qui aurait allongé ou retiré la durée', () => {
    // `declaredReplyProtection` est passée AVANT : citer une flamme de 24 h
    // remplace la durée demandée par 86 400 s et retire le bit après lecture ;
    // citer une flamme-œil retire la durée. Ni l'un ni l'autre ne desserre.
    const afterLongQuote = forwardedCopyFields(
      { effectFlags: EPHEMERAL, ephemeralDuration: 86_400 },
      { ephemeralDuration: 30, isBlurred: false },
    );
    expect(afterLongQuote).toMatchObject({ effectFlags: FLAME_BITS, ephemeralDuration: 30 });

    const afterFlameQuote = forwardedCopyFields(
      { effectFlags: FLAME_BITS, ephemeralDuration: undefined },
      { ephemeralDuration: 30, isBlurred: false },
    );
    expect(afterFlameQuote).toMatchObject({ effectFlags: FLAME_BITS, ephemeralDuration: 30, durationBoundsAfterRead: true });

    const afterShortQuote = forwardedCopyFields(
      { effectFlags: EPHEMERAL, ephemeralDuration: 10 },
      { ephemeralDuration: 30, isBlurred: false },
    );
    expect(afterShortQuote.ephemeralDuration).toBe(10);
  });
});

describe('diffusedCopyFields — la diffusion hérite au moins de la protection de sa source', () => {
  it('ne touche à rien quand la source est ordinaire', () => {
    const declared = { effectFlags: SHAKE };
    expect(diffusedCopyFields(declared, projection({ attachments: [piece()] }))).toBe(declared);
  });

  it('impose la vue unique d’une source à vue unique, y compris par sa pièce', () => {
    expect(diffusedCopyFields({}, projection({ isViewOnce: true }))).toMatchObject({ isViewOnce: true, effectFlags: VIEW_ONCE });
    expect(diffusedCopyFields({}, projection({ attachments: [piece({ isViewOnce: true })] }))).toMatchObject({
      isViewOnce: true,
      effectFlags: VIEW_ONCE,
    });
  });

  it('impose la flamme après lecture', () => {
    expect(diffusedCopyFields({}, projection({ effectFlags: FLAME_BITS }))).toMatchObject({ effectFlags: FLAME_BITS });
  });

  it('ferme en flamme après lecture une source chargée sans toute sa projection', () => {
    const { effectFlags: _forgotten, ...partial } = projection();
    expect(diffusedCopyFields({}, partial as ReturnType<typeof projection>)).toMatchObject({ effectFlags: FLAME_BITS });
  });

  it('borne la durée par celle de la source, sans ajouter le bit après lecture', () => {
    const source = projection({ effectFlags: EPHEMERAL, ephemeralDuration: 300 });
    expect(diffusedCopyFields({}, source)).toMatchObject({ effectFlags: EPHEMERAL, ephemeralDuration: 300 });
    expect(diffusedCopyFields({ ephemeralDuration: 30 }, source).ephemeralDuration).toBe(30);
    expect(diffusedCopyFields({ ephemeralDuration: 86_400 }, source).ephemeralDuration).toBe(300);
    expect(diffusedCopyFields({ expiresAt: new Date('2027-01-01T00:00:00.000Z') }, source).expiresAt).toBeUndefined();
  });

  it('impose le flou de la source, message ou pièce', () => {
    expect(diffusedCopyFields({ isBlurred: false }, projection({ isBlurred: true }))).toMatchObject({
      isBlurred: true,
      effectFlags: BLURRED,
    });
    expect(diffusedCopyFields({}, projection({ attachments: [piece({ isBlurred: true })] }))).toMatchObject({
      isBlurred: true,
      effectFlags: BLURRED,
    });
  });

  it('laisse intacte la protection identique qu’un client rejoue sur chaque cible', () => {
    // iOS rejoue sur les cibles 2..N la protection armée à l'envoi (#8303) :
    // la diffusion d'une vue unique ou d'une flamme reste possible.
    expect(
      diffusedCopyFields({ isViewOnce: true, effectFlags: VIEW_ONCE }, projection({ isViewOnce: true, effectFlags: VIEW_ONCE })),
    ).toMatchObject({ isViewOnce: true, effectFlags: VIEW_ONCE });
    expect(
      diffusedCopyFields(
        { effectFlags: EPHEMERAL, ephemeralDuration: 300 },
        projection({ effectFlags: EPHEMERAL, ephemeralDuration: 300 }),
      ),
    ).toMatchObject({ effectFlags: EPHEMERAL, ephemeralDuration: 300 });
  });
});

describe('exitProtectedCopy — le point d’entrée de saveMessage', () => {
  const findUnique = jest.fn<any>();
  const prisma = { message: { findUnique } } as any;
  const reading = (row: unknown) => {
    findUnique.mockReset();
    findUnique.mockResolvedValue(row);
  };

  it('ne lit rien pour un envoi ordinaire', async () => {
    reading(null);
    const declared = { effectFlags: SHAKE };
    expect(await exitProtectedCopy(prisma, declared)).toBe(declared);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('applique ce que la garde de transfert impose, sans relire la source', async () => {
    reading(null);
    const copy = await exitProtectedCopy(prisma, {
      forwardedFromId: 'src',
      forwardImposes: { ephemeralDuration: 30, isBlurred: true },
      ephemeralDuration: 86_400,
    });
    expect(copy).toMatchObject({ effectFlags: FLAME_BITS | BLURRED, isBlurred: true, ephemeralDuration: 30 });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('laisse passer tel quel un transfert dont la source LUE n’impose rien', async () => {
    const declared = { forwardedFromId: 'src', forwardImposes: null, effectFlags: SHAKE };
    expect(await exitProtectedCopy(prisma, declared)).toBe(declared);
  });

  it('REFUSE un transfert sans verdict d’admission — jamais les champs déclarés tels quels', async () => {
    await expect(exitProtectedCopy(prisma, { forwardedFromId: 'src', ephemeralDuration: 86_400 })).rejects.toThrow(
      'forward:not-admitted',
    );
  });

  it('lit la source d’une diffusion, message ET pièces, et lui fait hériter', async () => {
    reading(projection({ attachments: [piece({ isViewOnce: true })] }));

    const copy = await exitProtectedCopy(prisma, { copyAttachmentsFromMessageId: 'src' });

    expect(copy).toMatchObject({ isViewOnce: true, effectFlags: VIEW_ONCE });
    expect(findUnique.mock.calls[0][0]).toEqual({
      where: { id: 'src' },
      select: {
        isViewOnce: true,
        isBlurred: true,
        effectFlags: true,
        ephemeralDuration: true,
        expiresAt: true,
        attachments: { select: { isViewOnce: true, isBlurred: true, effectFlags: true } },
      },
    });
  });

  it('REFUSE une diffusion dont la source est introuvable, avant toute écriture', async () => {
    reading(null);
    await expect(exitProtectedCopy(prisma, { copyAttachmentsFromMessageId: 'src' })).rejects.toThrow(
      'copy-attachments:source-unavailable',
    );
  });

  it('laisse remonter une lecture de source qui échoue — fermé, rien n’est écrit', async () => {
    findUnique.mockReset();
    findUnique.mockRejectedValue(new Error('db down'));
    await expect(exitProtectedCopy(prisma, { copyAttachmentsFromMessageId: 'src' })).rejects.toThrow('db down');
  });

  describe('les DEUX champs à la fois — ajouter une diffusion ne retire rien au transfert', () => {
    const flameForward = { ephemeralDuration: 30, isBlurred: true };

    it('même source : la copie garde durée bornée, après lecture et flou', async () => {
      reading(projection({ effectFlags: EPHEMERAL | BLURRED, isBlurred: true, ephemeralDuration: 30 }));

      const copy = await exitProtectedCopy(prisma, {
        forwardedFromId: 'src',
        copyAttachmentsFromMessageId: 'src',
        forwardImposes: flameForward,
        ephemeralDuration: 86_400,
        isBlurred: false,
      });

      expect(copy).toMatchObject({
        effectFlags: FLAME_BITS | BLURRED,
        isBlurred: true,
        ephemeralDuration: 30,
        durationBoundsAfterRead: true,
      });
    });

    it('deux sources : une diffusion ORDINAIRE ne desserre pas la flamme transférée', async () => {
      reading(projection());

      const copy = await exitProtectedCopy(prisma, {
        forwardedFromId: 'flame',
        copyAttachmentsFromMessageId: 'ordinary',
        forwardImposes: flameForward,
        ephemeralDuration: 86_400,
      });

      expect(copy).toMatchObject({ effectFlags: FLAME_BITS | BLURRED, isBlurred: true, ephemeralDuration: 30 });
    });

    it('deux sources : la plus restrictive gagne sur chaque axe', async () => {
      reading(projection({ effectFlags: EPHEMERAL, ephemeralDuration: 10, attachments: [piece({ isViewOnce: false })] }));
      const shorter = await exitProtectedCopy(prisma, {
        forwardedFromId: 'flame',
        copyAttachmentsFromMessageId: 'shorter-flame',
        forwardImposes: flameForward,
      });
      expect(shorter).toMatchObject({ effectFlags: FLAME_BITS | BLURRED, ephemeralDuration: 10 });

      reading(projection({ isViewOnce: true, effectFlags: VIEW_ONCE }));
      const viewOnce = await exitProtectedCopy(prisma, {
        forwardedFromId: 'flame',
        copyAttachmentsFromMessageId: 'view-once',
        forwardImposes: flameForward,
      });
      expect(viewOnce).toMatchObject({
        isViewOnce: true,
        effectFlags: FLAME_BITS | BLURRED | VIEW_ONCE,
        ephemeralDuration: 30,
      });
    });

    it('deux sources : un transfert ordinaire garde ce que la diffusion impose', async () => {
      reading(projection({ effectFlags: FLAME_BITS }));
      const copy = await exitProtectedCopy(prisma, {
        forwardedFromId: 'ordinary',
        copyAttachmentsFromMessageId: 'after-read',
        forwardImposes: null,
      });
      expect(copy).toMatchObject({ effectFlags: FLAME_BITS });
    });
  });
});

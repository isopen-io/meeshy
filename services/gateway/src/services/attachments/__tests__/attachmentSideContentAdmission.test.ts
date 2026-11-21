/**
 * #20017 — la garde d'ADMISSION du contenu latéral : on ne FABRIQUE pas une
 * transcription qu'on n'aurait pas le droit de servir.
 *
 * Les deux portes déjà fermées par ce lot empêchent de LIRE la transcription
 * d'une pièce protégée. Aucune ne défait le fait qu'elle a été ÉCRITE : la
 * colonne reste, et les sauvegardes l'emportent. D'où une garde AVANT l'appel
 * à Whisper, et non un nettoyage après.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { attachmentSideContentIsProducible } from '../attachmentSideContentAdmission';

const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';

const NU = { isViewOnce: false, isBlurred: false, effectFlags: 0, isEncrypted: false, encryptionMode: null };
const PORTEUR_NU = { ...NU, expiresAt: null, deletedAt: null };

const prismaWith = (row: unknown) => ({
  messageAttachment: { findUnique: jest.fn<any>().mockResolvedValue(row) },
}) as never;

const prismaThrowing = () => ({
  messageAttachment: { findUnique: jest.fn<any>().mockRejectedValue(new Error('replica lag')) },
}) as never;

describe('attachmentSideContentIsProducible', () => {
  it('autorise une pièce ordinaire dans un message ordinaire', async () => {
    await expect(attachmentSideContentIsProducible(prismaWith({ ...NU, message: PORTEUR_NU }), PIECE)).resolves.toBe(true);
  });

  it('autorise une pièce PAS ENCORE RATTACHÉE — il n’y a pas de porteur à interroger', async () => {
    await expect(attachmentSideContentIsProducible(prismaWith({ ...NU, message: null }), PIECE)).resolves.toBe(true);
  });

  it.each([
    ['la PIÈCE est à vue unique', { ...NU, isViewOnce: true }, PORTEUR_NU],
    ['la PIÈCE est floutée', { ...NU, isBlurred: true }, PORTEUR_NU],
    ['la PIÈCE porte un bit masquant', { ...NU, effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }, PORTEUR_NU],
    ['la PIÈCE est chiffrée', { ...NU, isEncrypted: true }, PORTEUR_NU],
    ['le MESSAGE est à vue unique', NU, { ...PORTEUR_NU, isViewOnce: true }],
    ['le MESSAGE est flouté', NU, { ...PORTEUR_NU, isBlurred: true }],
    ['le MESSAGE est ÉPHÉMÈRE (échéance POSÉE)', NU, { ...PORTEUR_NU, expiresAt: new Date('2026-11-20T12:00:00.000Z') }],
    ['le MESSAGE est SUPPRIMÉ', NU, { ...PORTEUR_NU, deletedAt: new Date('2026-11-20T10:00:00.000Z') }],
    ['le MESSAGE est chiffré', NU, { ...PORTEUR_NU, isEncrypted: true }],
  ])('refuse quand %s', async (_nom, piece, porteur) => {
    await expect(attachmentSideContentIsProducible(prismaWith({ ...piece, message: porteur }), PIECE)).resolves.toBe(false);
  });

  it('refuse une pièce INTROUVABLE', async () => {
    await expect(attachmentSideContentIsProducible(prismaWith(null), PIECE)).resolves.toBe(false);
  });

  it('refuse sans identifiant', async () => {
    await expect(attachmentSideContentIsProducible(prismaWith(null), null)).resolves.toBe(false);
  });

  it('refuse quand la LECTURE LÈVE — fail-closed, à l’inverse d’un best-effort', async () => {
    await expect(attachmentSideContentIsProducible(prismaThrowing(), PIECE)).resolves.toBe(false);
  });

  it('DEMANDE le porteur : sans lui la loi autorise tout, et la garde serait inerte', async () => {
    const prisma = { messageAttachment: { findUnique: jest.fn<any>().mockResolvedValue({ ...NU, message: PORTEUR_NU }) } };
    await attachmentSideContentIsProducible(prisma as never, PIECE);

    const select = prisma.messageAttachment.findUnique.mock.calls[0][0].select as Record<string, any>;
    expect(select.message?.select).toMatchObject({ expiresAt: true, deletedAt: true, isViewOnce: true, isBlurred: true, effectFlags: true });
    expect(select).toMatchObject({ isViewOnce: true, isBlurred: true, effectFlags: true, isEncrypted: true });
  });
});

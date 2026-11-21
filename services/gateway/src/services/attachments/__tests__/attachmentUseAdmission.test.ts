/**
 * @jest-environment node
 *
 * #20113, constat F5 — le court-circuit « je l'ai déposée » ne vaut que pour
 * une pièce qu'AUCUN message ne porte.
 *
 * Scénario fermé : A transfère un média dans la conversation C, puis quitte C
 * ou s'y fait bannir. Sans cette borne, A garde indéfiniment le droit de faire
 * traduire cette pièce et d'en cloner la voix — le court-circuit répondait
 * `true` avant même de regarder l'appartenance.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { callerMayUseAttachment } from '../attachmentUseAdmission';

const MOI = '507f1f77bcf86cd799439011';
const AUTRUI = '507f1f77bcf86cd799439022';
const CONVERSATION = '507f1f77bcf86cd799439033';

const prisma = (member: unknown) => {
  const findFirst = jest.fn(async (_args: { where: Record<string, unknown> }) => member);
  return { double: { participant: { findFirst } } as never, findFirst };
};

describe('callerMayUseAttachment', () => {
  it('REFUSE une pièce portée par un message dans une conversation dont je ne suis plus membre', async () => {
    const { double, findFirst } = prisma(null);

    const verdict = await callerMayUseAttachment(double, MOI, {
      uploadedBy: MOI,
      messageId: 'msg-1',
      message: { conversationId: CONVERSATION },
    });

    expect(verdict).toBe(false);
    // Le refus doit venir de la question POSÉE : un refus obtenu sans la poser
    // serait un refus pour une autre raison.
    expect(findFirst).toHaveBeenCalledWith({
      where: { conversationId: CONVERSATION, userId: MOI, isActive: true },
    });
  });

  it('ACCEPTE quand je suis membre vivant de la conversation qui la porte, même si un AUTRE l’a déposée', async () => {
    const { double } = prisma({ id: 'p-moi' });

    await expect(
      callerMayUseAttachment(double, MOI, {
        uploadedBy: AUTRUI,
        messageId: 'msg-1',
        message: { conversationId: CONVERSATION },
      })
    ).resolves.toBe(true);
  });

  it('ACCEPTE la pièce que je viens de déposer et qu’aucun message ne porte — l’envoi est en cours', async () => {
    const { double, findFirst } = prisma(null);

    await expect(
      callerMayUseAttachment(double, MOI, { uploadedBy: MOI, messageId: null, message: null })
    ).resolves.toBe(true);
    // Aucun porteur dont hériter une appartenance : rien à demander.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('REFUSE la pièce LIBRE d’autrui', async () => {
    const { double } = prisma(null);

    await expect(
      callerMayUseAttachment(double, MOI, { uploadedBy: AUTRUI, messageId: null, message: null })
    ).resolves.toBe(false);
  });

  it('REFUSE quand le porteur est posé mais sa conversation NON CHARGÉE — un `select` oublié n’ouvre pas de porte', async () => {
    const { double, findFirst } = prisma({ id: 'p-moi' });

    await expect(
      callerMayUseAttachment(double, MOI, { uploadedBy: MOI, messageId: 'msg-1', message: null })
    ).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('REFUSE une pièce sans déposant, même libre', async () => {
    const { double } = prisma(null);

    await expect(
      callerMayUseAttachment(double, MOI, { uploadedBy: null, messageId: null, message: null })
    ).resolves.toBe(false);
  });
});
